import assert from "node:assert/strict";
import { test } from "node:test";
import { VaultEngine } from "../vault/engine";
import { defaultSecurity, type Payment, type VaultState } from "../vault/types";
import { auditVault, validFinding } from "./audit";
import { findLeaks, luhn, redact } from "./redact";

delete process.env.OPENAI_API_KEY;
delete process.env.NEAR_AI_API_KEY;

test("masks emails, phones, ibans and real card numbers", () => {
  const r = redact("Pay jane.doe@mail.com, call +91 98765 43210, IBAN DE89 3704 0044 0532 0130 00, card 4111 1111 1111 1111.");
  assert.deepEqual(r.hidden.map((h) => h.kind).sort(), ["card", "email", "iban", "phone"]);
  assert.ok(!r.text.includes("jane.doe"));
  assert.ok(r.text.includes("[email hidden]"));
});

test("masks a phone number at the end of a sentence", () => {
  const r = redact("Contact billing@kite-labs.dev or +91 98765 43210. IBAN DE89 3704 0044 0532 0130 00.");
  assert.deepEqual(r.hidden.map((h) => h.kind).sort(), ["email", "iban", "phone"]);
  assert.ok(!r.text.includes("98765"));
});

test("does not mask dates, amounts or invoice numbers", () => {
  assert.deepEqual(findLeaks("Invoice INV-2041. Amount 840 USDC. Due 2026-11-20."), []);
  assert.equal(luhn("4111111111111112"), false);
});

function state(payments: Partial<Payment>[], extra: Partial<VaultState> = {}): VaultState {
  const s = VaultEngine.empty("o.near", "g.near", "v.near");
  s.payments = payments.map((p, i) => ({
    id: i, agent: "p.near", kind: "Payment", token: "usdc.near", amount: "1000000", recipient: "lumen.near",
    destinationChain: "near", transferTo: "lumen.near", memo: "", reason: "Pay invoice.", status: "Paid",
    flags: [], riskScore: 0, createdAt: i, updatedAt: i, ...p,
  }));
  return { ...s, security: defaultSecurity(), ...extra };
}

test("confirms a public email and repeated payments, with a full trace", async () => {
  const s = state([{ reason: "Pay invoice, contact jane@lumen.studio" }, {}, {}]);
  const r = await auditVault(s, "testnet");
  const email = r.findings.find((f) => f.hunter === "personal-data");
  assert.equal(email?.verdict, "confirmed");
  assert.equal(email?.evidence.quote, "jane@lumen.studio");
  const link = r.findings.find((f) => f.hunter === "linkability");
  assert.equal(link?.verdict, "confirmed");
  assert.deepEqual(link?.fix?.payeePrivate, { chain: "near", recipient: "lumen.near" });
  assert.ok(r.findings.every(validFinding));
  assert.ok(r.summary.score < 100);
  assert.match(r.report, /## Confirmed/);
});

test("a payee already private is not reported as linkable, and testnet private needs validation", async () => {
  const s = state([{}, {}]);
  s.security!.privatePayees = ["near:lumen.near"];
  const r = await auditVault(s, "testnet");
  assert.equal(r.findings.find((f) => f.hunter === "linkability"), undefined);
  const pr = r.findings.find((f) => f.hunter === "private-route");
  assert.equal(pr?.verdict, "needs-validation");
  assert.equal(pr?.severity, undefined);
  assert.ok(pr?.openFact);
});

test("a private payout sent in the open is a high finding", async () => {
  const s = state([{ flags: ["private payout"] }]);
  s.security!.privatePayees = ["near:lumen.near"];
  const r = await auditVault(s, "mainnet");
  const f = r.findings.find((x) => x.hunter === "private-route");
  assert.equal(f?.verdict, "confirmed");
  assert.equal(f?.severity, "high");
});

test("salary in a reason needs validation, co-approvers are a rejected hardening note", async () => {
  const s = state([{ reason: "Monthly salary for design work" }]);
  s.security!.coApprovers = ["0xabc"];
  const r = await auditVault(s, "testnet");
  assert.equal(r.findings.find((f) => f.hunter === "sensitive-purpose")?.verdict, "needs-validation");
  assert.equal(r.findings.find((f) => f.title.startsWith("Co-approver"))?.verdict, "rejected");
  assert.equal(r.summary.coverage, 100);
});
