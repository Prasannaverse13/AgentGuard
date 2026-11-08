import assert from "node:assert/strict";
import { test } from "node:test";
import { VaultEngine } from "../vault/engine";
import { changesWorthAlerting, sendAlert } from "./alerts";

test("alerts for new held payments, blocks and auto pauses only", async () => {
  const e = new VaultEngine(VaultEngine.empty("o.near", "g.near"));
  e.deposit("usdc.near", "100000000000");
  e.addAgent("p.near", "Payables", "Payables", [{ token: "usdc.near", dailyCap: "5000000000", perTxLimit: "1000000000" }]);
  const before = structuredClone(e.state);
  const id = e.requestPayment("p.near", { token: "usdc.near", amount: "2000000000", recipient: "x.near", destinationChain: "near", transferTo: "x.near", memo: "", reason: "Invoice" });
  let msgs = changesWorthAlerting(before, e.state, "http://app");
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /waiting for you/);
  assert.match(msgs[0], /http:\/\/app\/app\/approvals/);
  const mid = structuredClone(e.state);
  e.dismissPayment(id);
  for (let i = 0; i < 2; i++) e.dismissPayment(e.requestPayment("p.near", { token: "usdc.near", amount: "2000000000", recipient: "x.near", destinationChain: "near", transferTo: "x.near", memo: "", reason: "Invoice" }));
  msgs = changesWorthAlerting(mid, e.state);
  assert.ok(msgs.some((m) => /paused Payables after 3/.test(m)));
});

test("sends to every channel that is set", async () => {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    return { ok: true } as Response;
  }) as unknown as typeof fetch;
  const r = await sendAlert("hi", { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1", ALERT_WEBHOOK_URL: "https://hook.example/x", RESEND_API_KEY: "k", ALERT_EMAIL_TO: "a@b.c" }, f);
  assert.equal(r.sent, 3);
  assert.ok(calls.some((u) => u.includes("api.telegram.org/bott/sendMessage")));
  assert.ok(calls.includes("https://api.resend.com/emails"));
});
