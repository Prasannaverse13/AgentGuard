import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPayment, editDistance, type GuardContext } from "./scam";

const ctx = (o: Partial<GuardContext> = {}): GuardContext => ({
  knownPayees: ["near:lumen.near"],
  history: [400_000_000n, 500_000_000n, 450_000_000n],
  ...o,
});
const pay = (o: Record<string, string> = {}) => ({
  amount: "420000000",
  recipient: "lumen.near",
  destinationChain: "near",
  memo: "INV-12",
  reason: "Monthly design retainer",
  ...o,
});

test("known payee with a normal amount is approved", () => {
  const r = checkPayment(pay(), ctx());
  assert.equal(r.verdict, "Approve");
  assert.equal(r.riskScore, 0);
});

test("a new payee alone is still approved with a small score", () => {
  const r = checkPayment(pay({ recipient: "newco.near" }), ctx());
  assert.equal(r.verdict, "Approve");
  assert.ok(r.riskScore > 0 && r.riskScore < 35);
});

test("a one day old wallet goes to the owner", () => {
  const r = checkPayment(pay({ recipient: "fresh.near" }), ctx({ intel: { accountAgeDays: 1 } }));
  assert.equal(r.verdict, "Escalate");
  assert.ok(r.flags.some((f) => f.includes("day old")));
});

test("a lookalike of a trusted payee is blocked with pressure language", () => {
  const r = checkPayment(pay({ recipient: "lumen-studio.near".replace("-studio", "x"), reason: "Urgent. New bank details attached" }), ctx());
  assert.equal(r.verdict, "Block");
  assert.ok(r.flags.some((f) => f.startsWith("looks like your trusted payee")));
});

test("a scam list hit is always blocked", () => {
  const r = checkPayment(pay(), ctx({ intel: { listedAsScam: true } }));
  assert.equal(r.verdict, "Block");
  assert.equal(r.riskScore, 100);
});

test("a bad evm address is blocked", () => {
  const r = checkPayment(pay({ recipient: "0x123", destinationChain: "base" }), ctx());
  assert.equal(r.verdict, "Block");
});

test("an amount far above the usual goes to the owner", () => {
  const r = checkPayment(pay({ amount: "5000000000", recipient: "newco.near" }), ctx());
  assert.equal(r.verdict, "Escalate");
  assert.ok(r.flags.some((f) => f.includes("10 times")));
});

test("edit distance", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("a", "a"), 0);
});
