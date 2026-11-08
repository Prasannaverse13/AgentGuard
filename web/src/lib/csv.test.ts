import assert from "node:assert/strict";
import { test } from "node:test";
import { activityCsv } from "./csv";
import { VaultEngine } from "./vault/engine";

test("activity CSV has one row per payment, plain amounts and safe cells", () => {
  const e = new VaultEngine(VaultEngine.empty("o.near", "g.near"), { now: () => 0 });
  e.addAgent("p.near", "Payables", "Payables", [{ token: "usdc.near", dailyCap: "5000000000", perTxLimit: "2000000000" }]);
  e.requestPayment("p.near", { token: "usdc.near", amount: "1234500000", recipient: "x.near", destinationChain: "near", transferTo: "x.near", memo: "INV, 7", reason: '=HYPERLINK("evil")' });
  const lines = activityCsv(e.state).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"1234.5"'));
  assert.ok(lines[1].includes('"INV, 7"'));
  assert.ok(lines[1].includes(`"'=HYPERLINK(""evil"")"`));
  assert.ok(lines[1].includes('"Payables"'));
});
