import assert from "node:assert/strict";
import { test } from "node:test";
import { runPayables } from "../agents/payables";
import { runRevenue } from "../agents/revenue";
import { DEMO, resetVault } from "./store";

process.env.VAULT_DATA_FILE = "/tmp/agentguard-test-vault.json";

test("a normal invoice is paid", async () => {
  const v = resetVault();
  const r = await runPayables(v, DEMO.payables, "Invoice INV-1 from Lumen Studio. 840 USDC. Pay to lumen.near. Due 2026-11-20.");
  assert.equal(r.payment.status, "Paid");
  assert.equal(r.payment.riskScore, 0);
});

test("an invoice to a lookalike of a trusted payee is blocked", async () => {
  const v = resetVault();
  const r = await runPayables(v, DEMO.payables, "URGENT invoice 9 from Lumen Studio. 900 USDC. Pay to lurnen.near. New bank details attached.");
  assert.equal(r.payment.status, "Blocked");
  assert.ok(r.payment.flags.length > 0);
});

test("an invoice on the scam list is blocked after the vault rules", async () => {
  const v = resetVault();
  v.addKnownPayee("near", "drainer-9x.near");
  const r = await runPayables(v, DEMO.payables, "Invoice 3 from X. 100 USDC. Pay to drainer-9x.near.");
  assert.equal(r.payment.status, "Blocked");
});

test("a large invoice waits for the owner and then pays", async () => {
  const v = resetVault();
  const r = await runPayables(v, DEMO.payables, "Invoice 12 from Kite Labs. 2,000 USDC. Pay to kite-labs.near.");
  assert.equal(r.payment.status, "NeedsApproval");
  await v.approvePayment(r.payment.id, false);
  assert.equal(v.state.payments[r.payment.id].status, "Paid");
});

test("revenue is split by the owner's rules", async () => {
  const v = resetVault();
  const pays = await runRevenue(v, DEMO.revenue, "usdc.near", "1200000000", "Client payment");
  assert.deepEqual(pays.map((p) => p.amount), ["480000000", "300000000", "420000000"]);
  assert.ok(pays.every((p) => p.status === "Paid"));
});
