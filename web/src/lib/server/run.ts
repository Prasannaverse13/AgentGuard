import { callPaid, callPaidChain } from "../agents/ops";
import { runPayables, runPayablesChain } from "../agents/payables";
import { runRevenue } from "../agents/revenue";
import { chainRevenue } from "../near/chain";
import { readVault } from "../near/rpc";
import type { VaultState } from "../vault/types";
import { alertChanges } from "./alerts";
import { vault } from "./store";
import type { Route } from "./target";

/** Runs one agent on the demo vault or the deployed vault, then alerts the owner about what changed. */
export async function runAgent(kind: string, b: Record<string, string>, route: Route, origin: string) {
  if (route.kind === "chain") {
    const cfg = route.cfg;
    const before = await readVault(cfg.rpc, cfg.vault);
    let out: Record<string, unknown>;
    if (kind === "revenue") {
      const token = b.token || before.agents.find((a) => a.kind === "Revenue")?.limits[0]?.token || "usdc.near";
      await chainRevenue(token, b.amount, b.reason || "Income received");
      out = { payments: [] };
    } else if (kind === "payables") {
      out = await runPayablesChain(b.invoice ?? "", before);
    } else if (kind === "ops") {
      if (!before.agents.some((a) => a.kind === "Ops")) throw new Error("This vault has no Ops agent yet. Run scripts\\upgrade-vault.ps1 to add one.");
      const calls = Math.min(Math.max(Number(b.calls ?? 1), 1), 5);
      const results = [];
      for (let i = 0; i < calls; i++) results.push(await callPaidChain(`${origin}/api/paid/weather?network=${cfg.network}`));
      out = { results };
    } else throw new Error("Unknown agent");
    const after = await readVault(cfg.rpc, cfg.vault);
    await alertChanges(before, after, origin);
    return { ...out, state: after };
  }

  const v = vault();
  const before: VaultState = structuredClone(v.state);
  const agentOf = (k: string) => {
    const a = v.state.agents.find((x) => x.kind.toLowerCase() === k);
    if (!a) throw new Error(`No ${k} agent`);
    return a.account;
  };
  let out: Record<string, unknown>;
  if (kind === "payables") out = await runPayables(v, agentOf("payables"), b.invoice ?? "");
  else if (kind === "ops") {
    const calls = Math.min(Math.max(Number(b.calls ?? 1), 1), 20);
    const results = [];
    for (let i = 0; i < calls; i++) results.push(await callPaid(v, agentOf("ops"), `${origin}/api/paid/weather`));
    out = { results };
  } else if (kind === "revenue") out = { payments: await runRevenue(v, agentOf("revenue"), b.token ?? "usdc.near", b.amount, b.reason || "Income received") };
  else throw new Error("Unknown agent");
  await alertChanges(before, v.state, origin);
  return { ...out, state: v.state };
}
