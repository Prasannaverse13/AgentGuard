import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../../app/api/inbound/email/route";
import { resetVault } from "./store";

process.env.VAULT_DATA_FILE = "/tmp/agentguard-test-inbound.json";
delete process.env.NEAR_VAULT_ID;

const mail = (body: object, key = "s3cret") =>
  new Request(`http://app.test/api/inbound/email?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("an emailed invoice is read by the Payables agent", async () => {
  process.env.INBOUND_EMAIL_SECRET = "s3cret";
  resetVault();
  const r = await POST(mail({ from: "billing@lumen.studio", subject: "Invoice INV-77", text: "Invoice INV-77 from Lumen Studio. Amount: 120 USDC. Pay to lumen.near. Due 2026-11-30." }));
  const j = (await r.json()) as { payment: { status: string } };
  assert.equal(r.status, 200);
  assert.equal(j.payment.status, "Paid");
});

test("a wrong key is refused and a missing secret turns it off", async () => {
  process.env.INBOUND_EMAIL_SECRET = "s3cret";
  assert.equal((await POST(mail({ text: "x" }, "nope"))).status, 401);
  delete process.env.INBOUND_EMAIL_SECRET;
  assert.equal((await POST(mail({ text: "x" }))).status, 503);
});

test("only allowed senders are read when a list is set", async () => {
  process.env.INBOUND_EMAIL_SECRET = "s3cret";
  process.env.INBOUND_EMAIL_FROM = "lumen.studio";
  const r = await POST(mail({ from: "scam@evil.example", text: "Invoice. 900 USDC. Pay to lurnen.near." }));
  assert.equal(r.status, 403);
  delete process.env.INBOUND_EMAIL_FROM;
});
