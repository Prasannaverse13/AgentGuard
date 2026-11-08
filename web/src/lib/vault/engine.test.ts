import assert from "node:assert/strict";
import { test } from "node:test";
import { VaultEngine } from "./engine";
import type { PaymentRequest } from "./types";

const USDC = "usdc.near";
const u = (n: number) => String(n * 1_000_000);
const req = (amount: string, to = "lumen.near"): PaymentRequest => ({
  token: USDC,
  amount,
  recipient: to,
  destinationChain: "near",
  transferTo: to,
  memo: "INV-1",
  reason: "Invoice due",
});

function make(now = { t: 1_000 }) {
  const sent: string[] = [];
  const e = new VaultEngine(VaultEngine.empty("owner.near", "guard.near"), {
    now: () => now.t,
    onSend: (p) => {
      sent.push(`${p.amount}>${p.transferTo}`);
      return true;
    },
  });
  e.deposit(USDC, u(50_000));
  e.addAgent("payables.near", "Payables", "Payables", [{ token: USDC, dailyCap: u(3_500), perTxLimit: u(1_000) }]);
  e.addAgent("revenue.near", "Revenue", "Revenue", [{ token: USDC, dailyCap: u(10_000), perTxLimit: u(5_000) }]);
  e.addKnownPayee("near", "lumen.near");
  return { e, sent, now };
}

test("small known payment goes to the guard then sends", async () => {
  const { e, sent } = make();
  const id = e.requestPayment("payables.near", req(u(400)));
  assert.equal(e.state.payments[id].status, "AwaitingGuard");
  await e.guardVerdict(id, "Approve", 4, []);
  assert.equal(e.state.payments[id].status, "Paid");
  assert.deepEqual(sent, [`${u(400)}>lumen.near`]);
  assert.equal(e.state.agents[0].limits[0].spentToday, u(400));
  assert.equal(e.state.balances[USDC], u(49_600));
});

test("over the per payment limit waits for the owner", async () => {
  const { e } = make();
  const id = e.requestPayment("payables.near", req(u(1_200)));
  assert.equal(e.state.payments[id].status, "NeedsApproval");
  assert.deepEqual(e.state.payments[id].flags, ["over per payment limit"]);
  await e.approvePayment(id, false);
  assert.equal(e.state.payments[id].status, "Paid");
});

test("daily cap counts across payments", async () => {
  const { e } = make();
  for (let i = 0; i < 3; i++) {
    const id = e.requestPayment("payables.near", req(u(1_000)));
    await e.guardVerdict(id, "Approve", 1, []);
  }
  const id = e.requestPayment("payables.near", req(u(600)));
  assert.equal(e.state.payments[id].status, "NeedsApproval");
  assert.deepEqual(e.state.payments[id].flags, ["over daily cap"]);
});

test("the cap resets on a new day", async () => {
  const { e, now } = make();
  for (let i = 0; i < 3; i++) {
    const id = e.requestPayment("payables.near", req(u(1_000)));
    await e.guardVerdict(id, "Approve", 1, []);
  }
  now.t += 86_400_000;
  const id = e.requestPayment("payables.near", req(u(900)));
  assert.equal(e.state.payments[id].status, "AwaitingGuard");
});

test("a token off the list is rejected and kept in the record", () => {
  const { e } = make();
  const id = e.requestPayment("payables.near", { ...req("5"), token: "evil.near" });
  assert.equal(e.state.payments[id].status, "Rejected");
});

test("a new payee needs approval and can be trusted", async () => {
  const { e } = make();
  const id = e.requestPayment("payables.near", req(u(100), "newco.near"));
  assert.deepEqual(e.state.payments[id].flags, ["new payee"]);
  await e.approvePayment(id, true);
  const id2 = e.requestPayment("payables.near", req(u(100), "newco.near"));
  assert.equal(e.state.payments[id2].status, "AwaitingGuard");
});

test("a block stops the money", async () => {
  const { e, sent } = make();
  const id = e.requestPayment("payables.near", req(u(100)));
  await e.guardVerdict(id, "Block", 97, ["wallet is one day old"]);
  assert.equal(e.state.payments[id].status, "Blocked");
  assert.equal(sent.length, 0);
  assert.equal(e.state.balances[USDC], u(50_000));
});

test("a failed transfer gives the budget and the money back", async () => {
  const { e } = make();
  e.onSend = () => false;
  const id = e.requestPayment("payables.near", req(u(400)));
  await e.guardVerdict(id, "Approve", 1, []);
  assert.equal(e.state.payments[id].status, "Failed");
  assert.equal(e.state.agents[0].limits[0].spentToday, "0");
  assert.equal(e.state.balances[USDC], u(50_000));
});

test("revenue split follows the rules and puts dust on the last leg", async () => {
  const { e } = make();
  e.setSplits([
    { label: "Savings", recipient: "savings.near", bps: 4000 },
    { label: "Tax", recipient: "tax.near", bps: 2500 },
    { label: "Team", recipient: "team.near", bps: 3500 },
  ]);
  const ids = await e.distributeRevenue("revenue.near", USDC, "1000001", "Client payment");
  assert.deepEqual(ids.map((i) => e.state.payments[i].amount), ["400000", "250000", "350001"]);
  assert.ok(ids.every((i) => e.state.payments[i].status === "Paid"));
});

test("splits must add up", () => {
  const { e } = make();
  assert.throws(() => e.setSplits([{ label: "Half", recipient: "a.near", bps: 5000 }]), /10000/);
});

test("a stranger cannot ask for a payment", () => {
  const { e } = make();
  assert.throws(() => e.requestPayment("stranger.near", req("1")), /not an agent/);
});

test("a paused agent is rejected", () => {
  const { e } = make();
  e.state.agents[0].paused = true;
  const id = e.requestPayment("payables.near", req(u(10)));
  assert.equal(e.state.payments[id].status, "Rejected");
});

test("owner can dismiss", () => {
  const { e } = make();
  const id = e.requestPayment("payables.near", req(u(1_200)));
  e.dismissPayment(id, "not expected");
  assert.equal(e.state.payments[id].status, "Dismissed");
});

test("three stopped payments in a row pause the agent, a paid one resets the count", async () => {
  const { e } = make();
  for (let i = 0; i < 2; i++) e.dismissPayment(e.requestPayment("payables.near", req(u(1_200))));
  assert.equal(e.state.security?.strikes["payables.near"], 2);
  const ok = e.requestPayment("payables.near", req(u(100)));
  await e.guardVerdict(ok, "Approve", 1, []);
  assert.equal(e.state.security?.strikes["payables.near"], undefined);
  for (let i = 0; i < 3; i++) {
    const id = e.requestPayment("payables.near", req(u(100)));
    await e.guardVerdict(id, "Block", 95, []);
  }
  assert.equal(e.state.agents[0].paused, true);
  assert.equal(e.state.payments[e.requestPayment("payables.near", req(u(10)))].status, "Rejected");
});

test("large payments need two different approvers", async () => {
  const { e, sent } = make();
  e.setCoApprovers(["0x00000000000000000000000000000000000000Cf"]);
  e.setDualRules([{ token: USDC, above: u(1_500) }]);
  const id = e.requestPayment("payables.near", req(u(2_000)));
  await e.approvePayment(id, false, "owner");
  await e.approvePayment(id, false, "owner");
  assert.equal(e.state.payments[id].status, "NeedsApproval");
  assert.ok(e.state.payments[id].flags.includes("waiting for a second approval"));
  await e.approvePayment(id, false, "0x00000000000000000000000000000000000000cf");
  assert.equal(e.state.payments[id].status, "Paid");
  assert.equal(sent.length, 1);
});

test("a co-approver cannot change rules", async () => {
  const { e } = make();
  e.setCoApprovers(["0x00000000000000000000000000000000000000cf"]);
  await assert.rejects(() => e.applyOwner({ method: "set_paused", args: { paused: true } }, "0x00000000000000000000000000000000000000cf"), /only approve or dismiss/);
});

test("payments to a private payee are flagged", () => {
  const { e } = make();
  e.setPayeePrivate("near", "lumen.near", true);
  const id = e.requestPayment("payables.near", req(u(100)));
  assert.deepEqual(e.state.payments[id].flags, ["private payout"]);
});
