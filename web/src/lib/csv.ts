import { fromBase, symbolOf, tokenInfo } from "./units";
import type { VaultState } from "./vault/types";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // Quote every cell. Stop spreadsheet formulas from running.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** The audit record as CSV for an accountant. One row per payment or attempt. */
export function activityCsv(s: VaultState): string {
  const head = ["id", "created_utc", "updated_utc", "status", "agent", "kind", "amount", "token", "symbol", "recipient", "chain", "sent_to", "memo", "reason", "risk", "flags", "approvals", "vault"];
  const agent = (acc: string) => s.agents.find((a) => a.account === acc)?.name ?? acc;
  const rows = s.payments.map((p) => [
    p.id,
    new Date(p.createdAt).toISOString(),
    new Date(p.updatedAt).toISOString(),
    p.status,
    agent(p.agent),
    p.kind,
    fromBase(p.amount, tokenInfo(p.token)?.decimals ?? 6, 6).replace(/,/g, ""),
    p.token,
    symbolOf(p.token),
    p.recipient,
    p.destinationChain,
    p.transferTo,
    p.memo,
    p.reason,
    p.riskScore ?? "",
    p.flags.join("; "),
    (p.approvals ?? []).join("; "),
    s.vaultId,
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
