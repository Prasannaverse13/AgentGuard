import type { OwnerAction } from "../owner/actions";
import {
  FLAGS,
  defaultSecurity,
  type DualRule,
  type Security,
  type Agent,
  type LimitInput,
  type Payment,
  type PaymentRequest,
  type SplitRule,
  type VaultState,
  type Verdict,
} from "./types";

const DAY_MS = 86_400_000;
export const dayOf = (ms: number) => Math.floor(ms / DAY_MS);

export class VaultError extends Error {}
const must = (cond: unknown, msg: string): void => {
  if (!cond) throw new VaultError(msg);
};

/**
 * The same rules as contract/src/lib.rs, in TypeScript. The in-browser vault and the
 * tests run on this. A test below checks it behaves like the contract tests do.
 * Money never moves here. `onSend` is where a real transfer would be started.
 */
export class VaultEngine {
  state: VaultState;
  now: () => number;
  /** Called when a payment is cleared to send. Return true when the transfer worked. */
  onSend: (p: Payment) => Promise<boolean> | boolean;

  constructor(
    state: VaultState,
    opts: { now?: () => number; onSend?: (p: Payment) => Promise<boolean> | boolean } = {},
  ) {
    this.state = state;
    this.now = opts.now ?? Date.now;
    this.onSend = opts.onSend ?? (() => true);
  }

  static empty(owner: string, guard: string, vaultId = "demo.agentguard"): VaultState {
    return {
      vaultId,
      owner,
      ownerEth: null,
      ownerNonce: 0,
      guard,
      paused: false,
      newPayeeNeedsApproval: true,
      balances: {},
      agents: [],
      knownPayees: [],
      splits: [],
      payments: [],
      security: defaultSecurity(),
    };
  }

  get sec(): Security {
    this.state.security ??= defaultSecurity();
    return this.state.security;
  }

  setCoApprovers(list: string[]) {
    must(list.length <= 5, "Up to 5 co-approvers");
    const out: string[] = [];
    for (const raw of list) {
      const a = raw.startsWith("0x") || raw.startsWith("0X") ? raw.toLowerCase() : raw;
      if (a.startsWith("0x")) must(/^0x[0-9a-f]{40}$/.test(a), "Bad Ethereum address");
      must(a !== this.state.owner && a !== this.state.ownerEth, "The owner is already an approver");
      if (!out.includes(a)) out.push(a);
    }
    this.sec.coApprovers = out;
  }

  setDualRules(rules: DualRule[]) {
    this.sec.dualRules = rules.map((r) => ({ token: r.token, above: BigInt(r.above).toString() }));
  }

  setAutoPauseAfter(n: number) {
    must(Number.isInteger(n) && n >= 0 && n <= 20, "Use 0 to 20");
    this.sec.autoPauseAfter = n;
  }

  setPayeePrivate(chain: string, recipient: string, on: boolean) {
    const k = VaultEngine.payeeKey(chain, recipient);
    this.sec.privatePayees = this.sec.privatePayees.filter((x) => x !== k);
    if (on) this.sec.privatePayees.push(k);
  }

  private needsTwo(p: Payment) {
    return this.sec.coApprovers.length > 0 && this.sec.dualRules.some((r) => r.token === p.token && BigInt(p.amount) > BigInt(r.above));
  }

  /** One more blocked or dismissed payment in a row. Pauses the agent at the limit. */
  private strike(agentAccount: string) {
    const n = (this.sec.strikes[agentAccount] ?? 0) + 1;
    this.sec.strikes[agentAccount] = n;
    const a = this.state.agents.find((x) => x.account === agentAccount);
    if (a && this.sec.autoPauseAfter > 0 && n >= this.sec.autoPauseAfter) a.paused = true;
  }

  static payeeKey(chain: string, recipient: string) {
    const r = recipient.startsWith("0x") ? recipient.toLowerCase() : recipient;
    return `${chain.toLowerCase()}:${r}`;
  }

  private agent(account: string): Agent {
    const a = this.state.agents.find((x) => x.account === account);
    must(a, "Caller is not an agent");
    return a as Agent;
  }

  private payment(id: number): Payment {
    const p = this.state.payments[id];
    must(p, "No such payment");
    return p;
  }

  private roll(l: Agent["limits"][number]) {
    const today = dayOf(this.now());
    if (l.day !== today) {
      l.day = today;
      l.spentToday = "0";
    }
  }

  // ---- owner rules
  addAgent(account: string, name: string, kind: Agent["kind"], limits: LimitInput[]) {
    must(account !== this.state.owner, "The owner cannot be an agent");
    must(name.length > 0 && name.length <= 64, "Name must be 1 to 64 characters");
    must(!this.state.agents.some((a) => a.account === account), "Agent already exists");
    this.state.agents.push({ account, name, kind, paused: false, limits: this.buildLimits(limits) });
  }

  setAgentLimits(account: string, limits: LimitInput[]) {
    const a = this.agent(account);
    const fresh = this.buildLimits(limits);
    for (const l of fresh) {
      const old = a.limits.find((o) => o.token === l.token);
      if (old) {
        l.spentToday = old.spentToday;
        l.day = old.day;
      }
    }
    a.limits = fresh;
  }

  private buildLimits(limits: LimitInput[]) {
    const out: Agent["limits"] = [];
    for (const l of limits) {
      must(BigInt(l.perTxLimit) > 0n && BigInt(l.dailyCap) >= BigInt(l.perTxLimit), "Daily cap must be at least the per payment limit");
      must(!out.some((o) => o.token === l.token), "Duplicate token limit");
      out.push({ token: l.token, dailyCap: l.dailyCap, perTxLimit: l.perTxLimit, spentToday: "0", day: 0 });
    }
    return out;
  }

  setSplits(splits: SplitRule[]) {
    if (splits.length) {
      must(splits.reduce((s, r) => s + r.bps, 0) === 10_000, "Split rules must add up to 10000 basis points");
      must(splits.every((r) => r.bps > 0), "A split rule needs more than 0 basis points");
    }
    this.state.splits = splits;
  }

  addKnownPayee(chain: string, recipient: string) {
    const k = VaultEngine.payeeKey(chain, recipient);
    if (!this.state.knownPayees.includes(k)) this.state.knownPayees.push(k);
  }

  removeKnownPayee(chain: string, recipient: string) {
    const k = VaultEngine.payeeKey(chain, recipient);
    this.state.knownPayees = this.state.knownPayees.filter((x) => x !== k);
  }

  deposit(token: string, amount: string) {
    const cur = BigInt(this.state.balances[token] ?? "0");
    this.state.balances[token] = (cur + BigInt(amount)).toString();
  }

  // ---- agents
  requestPayment(agentAccount: string, req: PaymentRequest): number {
    const a = this.agent(agentAccount);
    must(a.kind !== "Revenue", "Revenue agents use distribute_revenue");
    const amount = BigInt(req.amount);
    must(amount > 0n, "Amount must be more than 0");
    must(req.recipient.length > 0 && req.recipient.length <= 128, "Bad recipient");
    must(req.reason.trim().length > 0, "Every payment needs a reason");
    must(req.memo.length <= 500 && req.reason.length <= 500, "Memo or reason is too long");

    const hard: string[] = [];
    const soft: string[] = [];
    if (this.state.paused) hard.push(FLAGS.vaultPaused);
    if (a.paused) hard.push(FLAGS.agentPaused);
    const l = a.limits.find((x) => x.token === req.token);
    if (!l) hard.push(FLAGS.token);
    else {
      this.roll(l);
      if (amount > BigInt(l.perTxLimit)) soft.push(FLAGS.perTx);
      if (BigInt(l.spentToday) + amount > BigInt(l.dailyCap)) soft.push(FLAGS.daily);
    }
    const known = this.state.knownPayees.includes(VaultEngine.payeeKey(req.destinationChain, req.recipient));
    if (this.state.newPayeeNeedsApproval && !known) soft.push(FLAGS.newPayee);

    const isPrivate = this.sec.privatePayees.includes(VaultEngine.payeeKey(req.destinationChain, req.recipient));
    const [status, flags] = hard.length
      ? (["Rejected", hard] as const)
      : soft.length
        ? (["NeedsApproval", soft] as const)
        : (["AwaitingGuard", [] as string[]] as const);

    const now = this.now();
    const id = this.state.payments.length;
    this.state.payments.push({
      id,
      agent: agentAccount,
      kind: "Payment",
      ...req,
      status,
      flags: isPrivate ? [...flags, FLAGS.private] : [...flags],
      riskScore: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async guardVerdict(id: number, verdict: Verdict, riskScore: number, flags: string[]) {
    const p = this.payment(id);
    must(p.status === "AwaitingGuard" || p.status === "NeedsApproval", "Payment is not waiting for the guard");
    must(riskScore >= 0 && riskScore <= 100, "Risk score is 0 to 100");
    const was = p.status;
    p.riskScore = riskScore;
    p.updatedAt = this.now();
    for (const f of flags) if (!p.flags.includes(f)) p.flags.push(f);
    if (verdict === "Block") {
      p.status = "Blocked";
      this.strike(p.agent);
    }
    else if (verdict === "Escalate") p.status = "NeedsApproval";
    else if (was === "AwaitingGuard") {
      must(!this.state.paused, "Vault is paused");
      await this.execute(id);
    }
  }

  /** `who` is "owner" or a co-approver id. Above a dual rule it takes two different people. */
  async approvePayment(id: number, trustPayee: boolean, who = "owner") {
    const p = this.payment(id);
    must(!this.state.paused, "Vault is paused");
    must(p.status === "NeedsApproval", "Payment is not waiting for approval");
    if (this.needsTwo(p)) {
      const list = p.approvals ?? [];
      if (!list.includes(who)) list.push(who);
      p.approvals = list;
      if (list.length < 2) {
        if (!p.flags.includes(FLAGS.second)) p.flags.push(FLAGS.second);
        p.updatedAt = this.now();
        return;
      }
    }
    if (trustPayee && who === "owner") this.addKnownPayee(p.destinationChain, p.recipient);
    await this.execute(id);
  }

  dismissPayment(id: number, note?: string) {
    const p = this.payment(id);
    must(p.status === "NeedsApproval" || p.status === "AwaitingGuard", "Payment cannot be dismissed now");
    p.status = "Dismissed";
    p.updatedAt = this.now();
    if (note) p.flags.push(`owner note: ${note}`);
    if (p.kind === "Payment") this.strike(p.agent);
  }

  async distributeRevenue(agentAccount: string, token: string, amountStr: string, reason: string): Promise<number[]> {
    const a = this.agent(agentAccount);
    must(!this.state.paused, "Vault is paused");
    must(a.kind === "Revenue", "Only a revenue agent can split revenue");
    must(!a.paused, "Agent is paused");
    const amount = BigInt(amountStr);
    must(amount > 0n, "Amount must be more than 0");
    must(this.state.splits.length > 0, "No split rules are set");
    must(reason.trim().length > 0, "Every split needs a reason");
    const l = a.limits.find((x) => x.token === token);
    must(l, "Token not allowed for this agent");
    this.roll(l!);
    must(amount <= BigInt(l!.perTxLimit), "Over the per payment limit");
    must(BigInt(l!.spentToday) + amount <= BigInt(l!.dailyCap), "Over the daily cap");

    const ids: number[] = [];
    let left = amount;
    const rules = this.state.splits;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const leg = i === rules.length - 1 ? left : (amount * BigInt(rule.bps)) / 10_000n;
      left -= leg;
      if (leg === 0n) continue;
      const id = this.state.payments.length;
      const now = this.now();
      this.state.payments.push({
        id,
        agent: agentAccount,
        kind: "Split",
        token,
        amount: leg.toString(),
        recipient: rule.recipient,
        destinationChain: "near",
        transferTo: rule.recipient,
        memo: rule.label,
        reason,
        status: "AwaitingGuard",
        flags: [],
        riskScore: 0,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
      await this.execute(id);
    }
    return ids;
  }

  /** The only place money leaves. */
  private async execute(id: number) {
    const p = this.payment(id);
    const a = this.agent(p.agent);
    const l = a.limits.find((x) => x.token === p.token);
    const amount = BigInt(p.amount);
    const bal = BigInt(this.state.balances[p.token] ?? "0");
    must(bal >= amount, "Vault does not hold enough of this token");
    if (l) {
      this.roll(l);
      l.spentToday = (BigInt(l.spentToday) + amount).toString();
    }
    this.state.balances[p.token] = (bal - amount).toString();
    p.status = "Sending";
    p.updatedAt = this.now();
    let ok = false;
    try {
      ok = await this.onSend(p);
    } catch {
      ok = false;
    }
    p.updatedAt = this.now();
    if (ok) {
      p.status = "Paid";
      if (p.kind === "Payment") delete this.sec.strikes[p.agent];
    }
    else {
      p.status = "Failed";
      if (l && l.day === dayOf(this.now())) l.spentToday = (BigInt(l.spentToday) - amount).toString();
      this.state.balances[p.token] = (BigInt(this.state.balances[p.token]) + amount).toString();
    }
  }

  /** Runs one owner action. The caller has already checked the signature. `who` is "owner" or a co-approver. */
  async applyOwner(a: OwnerAction, who = "owner") {
    if (who !== "owner") must(a.method === "approve_payment" || a.method === "dismiss_payment", "A co-approver can only approve or dismiss");
    switch (a.method) {
      case "approve_payment":
        return this.approvePayment(a.args.id, a.args.trust_payee, who);
      case "dismiss_payment":
        return this.dismissPayment(a.args.id, a.args.note ?? undefined);
      case "set_paused":
        this.state.paused = a.args.paused;
        return;
      case "set_agent_paused": {
        const ag = this.agent(a.args.account);
        ag.paused = a.args.paused;
        return;
      }
      case "set_agent_limits":
        return this.setAgentLimits(
          a.args.account,
          a.args.limits.map((l) => ({ token: l.token, dailyCap: l.daily_cap, perTxLimit: l.per_tx_limit })),
        );
      case "set_new_payee_needs_approval":
        this.state.newPayeeNeedsApproval = a.args.value;
        return;
      case "add_known_payee":
        return this.addKnownPayee(a.args.destination_chain, a.args.recipient);
      case "remove_known_payee":
        return this.removeKnownPayee(a.args.destination_chain, a.args.recipient);
      case "set_splits":
        return this.setSplits(a.args.splits);
      case "set_co_approvers":
        return this.setCoApprovers(a.args.approvers);
      case "set_dual_rules":
        return this.setDualRules(a.args.rules);
      case "set_auto_pause_after":
        return this.setAutoPauseAfter(a.args.count);
      case "set_payee_private":
        return this.setPayeePrivate(a.args.destination_chain, a.args.recipient, a.args.private);
      default:
        throw new VaultError("Unknown owner action");
    }
  }

  pendingApprovals() {
    return this.state.payments.filter((p) => p.status === "NeedsApproval");
  }
}
