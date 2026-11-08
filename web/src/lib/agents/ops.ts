import type { VaultEngine } from "../vault/engine";
import { submitPayment } from "../server/pipeline";
import { persist, usedProofs } from "../server/store";

/** What an x402 style server says when it wants payment. */
export interface PaymentRequired {
  price: string; // base units
  token: string;
  payTo: string;
  resource: string;
}

export const PRICE_WEATHER = "3000"; // 0.003 USDC
export const PAY_TO = "api.weather.near";

/** The seller side. Checks that a payment really happened in the vault, and only once. */
export function verifyProof(v: VaultEngine, header: string | null, need: PaymentRequired): boolean {
  if (!header) return false;
  try {
    const { paymentId } = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { paymentId: number };
    const p = v.state.payments[paymentId];
    if (!p || p.status !== "Paid") return false;
    if (p.token !== need.token || p.transferTo !== need.payTo) return false;
    if (BigInt(p.amount) < BigInt(need.price)) return false;
    if (usedProofs().has(paymentId)) return false;
    usedProofs().add(paymentId);
    return true;
  } catch {
    return false;
  }
}

export interface OpsResult {
  ok: boolean;
  status: "Paid" | "NeedsApproval" | "Blocked" | "Rejected" | "Failed" | string;
  data?: unknown;
  paymentId?: number;
  note: string;
}

/** Seller side for a deployed vault: the payment must be Paid on chain, to us, in full, and used once. */
export async function verifyProofChain(header: string | null, need: PaymentRequired): Promise<boolean> {
  if (!header) return false;
  try {
    const { paymentId } = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { paymentId: number };
    if (!Number.isInteger(paymentId) || usedProofs().has(paymentId)) return false;
    const { chainView } = await import("../near/chain");
    const p = await chainView<{ status: string; token: string; transfer_to: string; amount: string } | null>("get_payment", { id: paymentId });
    if (!p || p.status !== "Paid" || p.token !== need.token || p.transfer_to !== need.payTo || BigInt(p.amount) < BigInt(need.price)) return false;
    usedProofs().add(paymentId);
    return true;
  } catch {
    return false;
  }
}

/** Where the paid API is paid on each network. A plain account, so no registration is needed. */
export const payToFor = (net: "testnet" | "mainnet") => process.env.NEAR_OPS_PAY_TO ?? (net === "mainnet" ? PAY_TO : "weather-api.testnet");

/** Buyer side on a deployed vault. Same flow, the vault on NEAR pays. */
export async function callPaidChain(url: string): Promise<OpsResult> {
  const { chainPayment, chainConfig } = await import("../near/chain");
  const { readVault } = await import("../near/rpc");
  const cfg = chainConfig();
  if (!cfg) throw new Error("No vault is set on this server");
  const first = await fetch(url);
  if (first.status !== 402) return { ok: first.ok, status: "Paid", data: await first.json(), note: "No payment needed" };
  const need = (await first.json()) as PaymentRequired;
  let p = await chainPayment("OPS", {
    token: need.token,
    amount: need.price,
    recipient: need.payTo,
    destinationChain: "near",
    transferTo: need.payTo,
    memo: `x402 ${need.resource}`,
    reason: `Pay for one call to ${need.resource}`,
  });
  // The transfer settles in a later receipt. Wait a few seconds for it.
  for (let i = 0; i < 6 && p.status === "Sending"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    p = (await readVault(cfg.rpc, cfg.vault)).payments[p.id];
  }
  if (p.status !== "Paid") return { ok: false, status: p.status, paymentId: p.id, note: `Payment is ${p.status}. ${p.flags.join(", ")}` };
  const proof = Buffer.from(JSON.stringify({ paymentId: p.id })).toString("base64");
  const second = await fetch(url, { headers: { "x-payment": proof } });
  return {
    ok: second.ok,
    status: "Paid",
    paymentId: p.id,
    data: second.ok ? await second.json() : undefined,
    note: second.ok ? "Paid on NEAR and received" : `Paid but server said ${second.status}`,
  };
}

/** The buyer side. Asks, gets a 402, pays through the vault, then asks again with proof. */
export async function callPaid(v: VaultEngine, agent: string, url: string): Promise<OpsResult> {
  const first = await fetch(url);
  if (first.status !== 402) return { ok: first.ok, status: "Paid", data: await first.json(), note: "No payment needed" };
  const need = (await first.json()) as PaymentRequired;
  const p = await submitPayment(v, agent, {
    token: need.token,
    amount: need.price,
    recipient: need.payTo,
    destinationChain: "near",
    transferTo: need.payTo,
    memo: `x402 ${need.resource}`,
    reason: `Pay for one call to ${need.resource}`,
  });
  persist();
  if (p.status !== "Paid") return { ok: false, status: p.status, paymentId: p.id, note: `Payment is ${p.status}. ${p.flags.join(", ")}` };
  const proof = Buffer.from(JSON.stringify({ paymentId: p.id })).toString("base64");
  const second = await fetch(url, { headers: { "x-payment": proof } });
  return {
    ok: second.ok,
    status: "Paid",
    paymentId: p.id,
    data: second.ok ? await second.json() : undefined,
    note: second.ok ? "Paid and received" : `Paid but server said ${second.status}`,
  };
}
