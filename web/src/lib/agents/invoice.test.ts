import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInvoice } from "./invoice";

test("reads a NEAR invoice", () => {
  const p = parseInvoice("Invoice INV-2041 from Lumen Studio. Amount: 840 USDC. Pay to lumen.near. Due 2026-11-20. Note: Brand design retainer.");
  assert.equal(p.number, "INV-2041");
  assert.equal(p.payee, "Lumen Studio");
  assert.equal(p.amount, "840000000");
  assert.equal(p.token, "usdc.near");
  assert.equal(p.recipient, "lumen.near");
  assert.equal(p.chain, "near");
  assert.equal(p.due, "2026-11-20");
  assert.equal(p.note, "Brand design retainer");
});

test("reads an EVM payee on Base", () => {
  const p = parseInvoice("Invoice 77 from Kite Labs, 1,250.50 USDC on Base to 0x52908400098527886E0F7030069857D2E4169EE7");
  assert.equal(p.chain, "base");
  assert.equal(p.amount, "1250500000");
  assert.equal(p.recipient, "0x52908400098527886E0F7030069857D2E4169EE7");
});

test("throws on a missing amount", () => {
  assert.throws(() => parseInvoice("Please pay lumen.near soon"), /No amount/);
});

test("throws on a missing payee", () => {
  assert.throws(() => parseInvoice("Pay 10 USDC please"), /No payee/);
});
