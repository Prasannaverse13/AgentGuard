import assert from "node:assert/strict";
import { test } from "node:test";
import { readVault } from "./rpc";

const answers: Record<string, unknown> = {
  get_config: { owner: "o.near", guard: "g.near", paused: false, new_payee_needs_approval: true, payments_count: 1, owner_eth: "0xabc", owner_nonce: 3 },
  get_agents: [["p.near", { name: "Payables", kind: "Payables", paused: false, limits: [{ token: "usdc.near", daily_cap: "3500000000", per_tx_limit: "1000000000", spent_today: "0", day: 5 }] }]],
  get_known_payees: ["near:lumen.near"],
  get_splits: [],
  get_payments_count: 1,
  get_payments: [
    { id: 0, agent: "p.near", kind: "Payment", token: "usdc.near", amount: "5", recipient: "lumen.near", destination_chain: "near", transfer_to: "lumen.near", memo: "", reason: "x", status: "NeedsApproval", flags: ["new payee"], risk_score: null, created_at: 2_000_000_000, updated_at: 3_000_000_000 },
  ],
};

test("maps the contract JSON to vault state", async () => {
  const f = (async (_u: unknown, init: { body: string }) => {
    const m = JSON.parse(init.body).params.method_name as string;
    if (m === "ft_balance_of") return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify("42000000"))] } }) };
    return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(answers[m]))] } }) };
  }) as unknown as typeof fetch;
  const s = await readVault("http://rpc", "vault.near", f);
  assert.equal(s.owner, "o.near");
  assert.equal(s.ownerEth, "0xabc");
  assert.equal(s.ownerNonce, 3);
  assert.equal(s.vaultId, "vault.near");
  assert.equal(s.agents[0].limits[0].dailyCap, "3500000000");
  assert.equal(s.payments[0].destinationChain, "near");
  assert.equal(s.payments[0].createdAt, 2000);
  assert.equal(s.payments[0].status, "NeedsApproval");
  assert.equal(s.balances["usdc.near"], "42000000");
});

test("reads the security settings and approvals of an upgraded vault", async () => {
  const more: Record<string, unknown> = {
    ...answers,
    get_security: { auto_pause_after: 3, co_approvers: ["0xcfo"], dual_rules: [{ token: "usdc.near", above: "1500000000" }], private_payees: ["near:lumen.near"], strikes: [["p.near", 2]] },
    get_approvals: [[0, ["owner"]]],
  };
  const f = (async (_u: unknown, init: { body: string }) => {
    const m = JSON.parse(init.body).params.method_name as string;
    if (m === "ft_balance_of") return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify("1"))] } }) };
    return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(more[m]))] } }) };
  }) as unknown as typeof fetch;
  const s = await readVault("http://rpc", "vault.near", f);
  assert.equal(s.security?.autoPauseAfter, 3);
  assert.deepEqual(s.security?.strikes, { "p.near": 2 });
  assert.deepEqual(s.payments[0].approvals, ["owner"]);
});

test("an older vault without security still loads", async () => {
  const f = (async (_u: unknown, init: { body: string }) => {
    const m = JSON.parse(init.body).params.method_name as string;
    if (m === "get_security") return { ok: true, json: async () => ({ error: { message: "MethodNotFound" } }) };
    if (m === "ft_balance_of") return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify("1"))] } }) };
    return { ok: true, json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(answers[m]))] } }) };
  }) as unknown as typeof fetch;
  const s = await readVault("http://rpc", "vault.near", f);
  assert.equal(s.security, undefined);
  assert.equal(s.payments.length, 1);
});
