/**
 * Cross chain payouts through NEAR Intents (1Click API).
 * The vault sends tokens on NEAR to a deposit address. Intents delivers them to the
 * real payee on the other chain. This file only builds the quote. The vault still
 * checks the payment against the owner's rules before anything moves.
 *
 * NOT TESTED against the live API from this build environment (network blocked).
 * Set INTENTS_JWT for production use. Without it, quote() returns a clearly marked demo address.
 */
const API = process.env.INTENTS_API ?? "https://1click.chaindefuser.com";

const ASSETS: Record<string, Record<string, string>> = {
  "usdc.near": {
    near: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    base: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    eth: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
    arb: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  },
};

export interface PayoutRoute {
  transferTo: string;
  live: boolean;
  note: string;
}

export function supported(token: string, chain: string) {
  return chain === "near" || Boolean(ASSETS[token]?.[chain]);
}

export async function routePayout(opts: {
  token: string;
  amount: string;
  chain: string;
  recipient: string;
  refundTo: string;
  /** Payee is marked private. 1Click settles confidentially (NEAR Intents, since 2026-10-27). */
  private?: boolean;
  /** NEAR network of the vault. Private and cross chain routes need mainnet. */
  network?: "testnet" | "mainnet";
}): Promise<PayoutRoute> {
  const net = opts.network ?? "mainnet";
  if (opts.chain === "near" && !opts.private) return { transferTo: opts.recipient, live: true, note: "Direct on NEAR" };
  if (opts.chain === "near" && opts.private && (net !== "mainnet" || !ASSETS[opts.token])) {
    return { transferTo: opts.recipient, live: true, note: "Private route needs NEAR Intents on mainnet. Sent directly on this network." };
  }
  const from = ASSETS[opts.token]?.near;
  const to = ASSETS[opts.token]?.[opts.chain];
  if (!from || !to) throw new Error(`Cannot pay ${opts.token} on ${opts.chain} yet`);
  const jwt = process.env.INTENTS_JWT;
  if (!jwt) {
    return {
      transferTo: `demo-intents-${opts.chain}.near`,
      live: false,
      note: "Demo deposit address. Set INTENTS_JWT to get a real one.",
    };
  }
  const res = await fetch(`${API}/v0/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: 50,
      originAsset: from,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: to,
      amount: opts.amount,
      refundTo: opts.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: opts.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Intents quote failed: ${res.status}`);
  const data = (await res.json()) as { quote?: { depositAddress?: string } };
  const addr = data.quote?.depositAddress;
  if (!addr) throw new Error("Intents gave no deposit address");
  return { transferTo: addr, live: true, note: opts.private ? "Private payout through NEAR Intents" : "Delivered by NEAR Intents" };
}
