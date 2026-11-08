import type { DualRule, LimitInput, SplitRule } from "../vault/types";

/**
 * Owner actions. Same JSON shape as the contract's OwnerAction enum
 * ({"method": ..., "args": {...}}, snake case), so one signature works for both
 * the demo vault and the deployed vault.
 */
export type OwnerAction =
  | { method: "approve_payment"; args: { id: number; trust_payee: boolean } }
  | { method: "dismiss_payment"; args: { id: number; note: string | null } }
  | { method: "set_paused"; args: { paused: boolean } }
  | { method: "set_agent_paused"; args: { account: string; paused: boolean } }
  | { method: "set_agent_limits"; args: { account: string; limits: { token: string; daily_cap: string; per_tx_limit: string }[] } }
  | { method: "set_new_payee_needs_approval"; args: { value: boolean } }
  | { method: "add_known_payee"; args: { destination_chain: string; recipient: string } }
  | { method: "remove_known_payee"; args: { destination_chain: string; recipient: string } }
  | { method: "set_splits"; args: { splits: SplitRule[] } }
  | { method: "set_co_approvers"; args: { approvers: string[] } }
  | { method: "set_dual_rules"; args: { rules: DualRule[] } }
  | { method: "set_auto_pause_after"; args: { count: number } }
  | { method: "set_payee_private"; args: { destination_chain: string; recipient: string; private: boolean } };

/** The only actions a co-approver may sign. */
export const CO_APPROVER_METHODS = ["approve_payment", "dismiss_payment"] as const;

/** The exact text signed in MetaMask. Must match contract `message_for`. */
export const ownerMessage = (vault: string, nonce: number, action: string) =>
  `AgentGuard owner action\nvault: ${vault}\nnonce: ${nonce}\naction: ${action}`;

export const claimMessage = (vault: string, address: string) =>
  `AgentGuard: claim this demo vault\nvault: ${vault}\naddress: ${address.toLowerCase()}`;

export const loginMessage = (address: string, issuedAt: string) =>
  `Sign in to AgentGuard\naddress: ${address.toLowerCase()}\nissued: ${issuedAt}`;

/** Short plain line shown before the user signs. */
export function describe(a: OwnerAction): string {
  switch (a.method) {
    case "approve_payment":
      return a.args.trust_payee ? `Approve payment #${a.args.id} and trust the payee` : `Approve payment #${a.args.id}`;
    case "dismiss_payment":
      return `Dismiss payment #${a.args.id}`;
    case "set_paused":
      return a.args.paused ? "Pause the vault" : "Resume the vault";
    case "set_agent_paused":
      return `${a.args.paused ? "Pause" : "Resume"} ${a.args.account}`;
    case "set_agent_limits":
      return `Change limits for ${a.args.account}`;
    case "set_new_payee_needs_approval":
      return a.args.value ? "Hold first payments to new payees" : "Stop holding new payees";
    case "add_known_payee":
      return `Trust ${a.args.recipient}`;
    case "remove_known_payee":
      return `Stop trusting ${a.args.recipient}`;
    case "set_splits":
      return "Change the revenue split";
    case "set_co_approvers":
      return a.args.approvers.length ? `Set ${a.args.approvers.length} co-approver(s)` : "Remove all co-approvers";
    case "set_dual_rules":
      return a.args.rules.length ? "Require two approvers for large payments" : "Turn off two person approval";
    case "set_auto_pause_after":
      return a.args.count ? `Auto pause an agent after ${a.args.count} stopped payments in a row` : "Turn off auto pause";
    case "set_payee_private":
      return `${a.args.private ? "Pay privately" : "Stop paying privately"}: ${a.args.recipient}`;
  }
}

export const limitsToChain = (limits: LimitInput[]) =>
  limits.map((l) => ({ token: l.token, daily_cap: l.dailyCap, per_tx_limit: l.perTxLimit }));

/** Maps a dashboard request to the owner action it stands for, or null if it is not an owner action. */
export function toOwnerAction(url: string, body: Record<string, unknown>): OwnerAction | null {
  const m = /^\/api\/payments\/(\d+)$/.exec(url);
  if (m) {
    const id = Number(m[1]);
    return body.action === "approve"
      ? { method: "approve_payment", args: { id, trust_payee: Boolean(body.trust) } }
      : { method: "dismiss_payment", args: { id, note: (body.note as string) ?? null } };
  }
  if (url !== "/api/vault") return null;
  switch (body.action) {
    case "pause":
      return { method: "set_paused", args: { paused: Boolean(body.paused) } };
    case "agentPause":
      return { method: "set_agent_paused", args: { account: String(body.agent), paused: Boolean(body.paused) } };
    case "newPayeeRule":
      return { method: "set_new_payee_needs_approval", args: { value: Boolean(body.value) } };
    case "addPayee":
      return { method: "add_known_payee", args: { destination_chain: String(body.chain), recipient: String(body.recipient) } };
    case "removePayee":
      return { method: "remove_known_payee", args: { destination_chain: String(body.chain), recipient: String(body.recipient) } };
    case "splits":
      return { method: "set_splits", args: { splits: body.splits as SplitRule[] } };
    case "limits":
      return { method: "set_agent_limits", args: { account: String(body.agent), limits: limitsToChain(body.limits as LimitInput[]) } };
    case "coApprovers":
      return { method: "set_co_approvers", args: { approvers: (body.approvers as string[]).map((a) => a.trim()).filter(Boolean) } };
    case "dualRules":
      return { method: "set_dual_rules", args: { rules: body.rules as DualRule[] } };
    case "autoPause":
      return { method: "set_auto_pause_after", args: { count: Number(body.count) } };
    case "payeePrivate":
      return { method: "set_payee_private", args: { destination_chain: String(body.chain), recipient: String(body.recipient), private: Boolean(body.private) } };
    default:
      return null;
  }
}
