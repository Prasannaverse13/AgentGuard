import type { Agent, Payment, SplitRule, VaultState } from "../vault/types";

/**
 * Reads the vault contract over plain JSON RPC. No SDK needed for views.
 * Writes (owner approvals, agent calls) need signatures and are not done here.
 * NOT TESTED against a live node from this build environment (network blocked).
 * The mapping is tested against the contract's JSON shape with a mocked node.
 */
export type Fetcher = typeof fetch;

export async function view<T>(rpc: string, contract: string, method: string, args: object = {}, f: Fetcher = fetch): Promise<T> {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "ag",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  };
  // Public RPC nodes rate limit now and then. Retry a couple of times before giving up.
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      res = await f(rpc, init);
      if (res.ok || (res.status !== 429 && res.status < 500)) break;
    } catch (e) {
      if (i === 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (!res || !res.ok) throw new Error(`RPC ${res?.status ?? "unreachable"}`);
  const j = (await res.json()) as { result?: { result: number[]; error?: string }; error?: { message?: string } };
  if (j.error || !j.result) throw new Error(j.error?.message ?? "RPC gave no result");
  if (j.result.error) throw new Error(j.result.error);
  return JSON.parse(Buffer.from(j.result.result).toString("utf8")) as T;
}

interface ChainAgent {
  name: string;
  kind: Agent["kind"];
  paused: boolean;
  limits: { token: string; daily_cap: string; per_tx_limit: string; spent_today: string; day: number }[];
}
interface ChainPayment {
  id: number;
  agent: string;
  kind: Payment["kind"];
  token: string;
  amount: string;
  recipient: string;
  destination_chain: string;
  transfer_to: string;
  memo: string;
  reason: string;
  status: Payment["status"];
  flags: string[];
  risk_score: number | null;
  created_at: number;
  updated_at: number;
}

const ms = (ns: number | string) => Math.floor(Number(ns) / 1_000_000);

export async function readVault(rpc: string, contract: string, f: Fetcher = fetch): Promise<VaultState> {
  const q = <T,>(m: string, a: object = {}) => view<T>(rpc, contract, m, a, f);
  const [cfg, agents, payees, splits, count] = await Promise.all([
    q<{ owner: string; guard: string; paused: boolean; new_payee_needs_approval: boolean; owner_eth: string | null; owner_nonce: number }>("get_config"),
    q<[string, ChainAgent][]>("get_agents"),
    q<string[]>("get_known_payees"),
    q<SplitRule[]>("get_splits"),
    q<number>("get_payments_count"),
  ]);
  const payments: ChainPayment[] = [];
  for (let from = 0; from < count; from += 100) payments.push(...(await q<ChainPayment[]>("get_payments", { from_index: from, limit: 100 })));
  // The vault keeps no ledger. Its holdings are what each token contract says it owns.
  const tokens = [...new Set([...agents.flatMap(([, a]) => a.limits.map((l) => l.token)), ...payments.map((p) => p.token)])];
  const balances: Record<string, string> = {};
  await Promise.all(
    tokens.map(async (t) => {
      try {
        balances[t] = await view<string>(rpc, t, "ft_balance_of", { account_id: contract }, f);
      } catch {
        /* not a token contract on this network */
      }
    }),
  );
  // Vaults deployed before the security upgrade have no get_security. Leave it out then.
  let security: VaultState["security"];
  try {
    const sec = await q<{ auto_pause_after: number; co_approvers: string[]; dual_rules: { token: string; above: string }[]; private_payees: string[]; strikes: [string, number][] }>("get_security");
    security = {
      autoPauseAfter: sec.auto_pause_after,
      coApprovers: sec.co_approvers,
      dualRules: sec.dual_rules,
      privatePayees: sec.private_payees,
      strikes: Object.fromEntries(sec.strikes),
    };
  } catch {
    security = undefined;
  }
  const waiting = payments.filter((p) => p.status === "NeedsApproval").map((p) => p.id);
  const approvals = new Map<number, string[]>();
  if (security && waiting.length) {
    try {
      for (const [id, who] of await q<[number, string[]][]>("get_approvals", { ids: waiting.slice(-100) })) approvals.set(id, who);
    } catch {
      /* older vault */
    }
  }
  return {
    vaultId: contract,
    security,
    ownerEth: cfg.owner_eth ?? null,
    ownerNonce: Number(cfg.owner_nonce ?? 0),
    owner: cfg.owner,
    guard: cfg.guard,
    paused: cfg.paused,
    newPayeeNeedsApproval: cfg.new_payee_needs_approval,
    balances,
    agents: agents.map(([account, a]) => ({
      account,
      name: a.name,
      kind: a.kind,
      paused: a.paused,
      limits: a.limits.map((l) => ({ token: l.token, dailyCap: l.daily_cap, perTxLimit: l.per_tx_limit, spentToday: l.spent_today, day: l.day })),
    })),
    knownPayees: payees,
    splits,
    payments: payments.map((p) => ({
      id: p.id,
      agent: p.agent,
      kind: p.kind,
      token: p.token,
      amount: p.amount,
      recipient: p.recipient,
      destinationChain: p.destination_chain,
      transferTo: p.transfer_to,
      memo: p.memo,
      reason: p.reason,
      status: p.status,
      flags: p.flags,
      riskScore: p.risk_score,
      createdAt: ms(p.created_at),
      updatedAt: ms(p.updated_at),
      ...(approvals.get(p.id)?.length ? { approvals: approvals.get(p.id) } : {}),
    })),
  };
}
