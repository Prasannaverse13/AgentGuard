import { TOKENS } from "../vault/types";
import { toBase } from "../units";

export interface ParsedInvoice {
  number: string | null;
  payee: string | null;
  amount: string; // base units
  token: string;
  recipient: string;
  chain: string;
  due: string | null;
  note: string;
}

const CHAINS: Record<string, string> = {
  base: "base",
  ethereum: "eth",
  eth: "eth",
  arbitrum: "arb",
  solana: "sol",
  bitcoin: "btc",
  near: "near",
};

/**
 * Reads a plain text invoice or email. Deterministic on purpose: the same text always
 * gives the same payment, so the owner can audit it. Throws when a field is missing
 * rather than guessing.
 */
export function parseInvoice(text: string): ParsedInvoice {
  const t = text.replace(/\s+/g, " ").trim();
  const amt = /(\d[\d,]*(?:\.\d+)?)\s*(USDC|NEAR)\b/i.exec(t);
  if (!amt) throw new Error("No amount found. Write it like 840 USDC.");
  const sym = amt[2].toUpperCase();
  const token = TOKENS.find((x) => x.symbol === sym)!;

  const evm = /\b0x[a-fA-F0-9]{40}\b/.exec(t);
  const sol = /\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/.exec(t);
  const near = /\b[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:near|testnet)\b/.exec(t);
  let recipient = "";
  let chain = "near";
  const chainWord = /\bon (base|ethereum|eth|arbitrum|solana|bitcoin|near)\b/i.exec(t)?.[1]?.toLowerCase();
  if (evm) {
    recipient = evm[0];
    chain = CHAINS[chainWord ?? "base"] ?? "base";
  } else if (near) {
    recipient = near[0];
    chain = "near";
  } else if (sol) {
    recipient = sol[0];
    chain = "sol";
  } else throw new Error("No payee address found. Add a NEAR account or a wallet address.");

  const number = /\b(?:invoice|inv)[\s#:-]*([A-Z0-9][\w-]{1,20})/i.exec(t)?.[1] ?? null;
  const payee = /\bfrom ([A-Z][\w&.' -]{1,40}?)(?:[.,;]| amount| pay| due| for | -)/.exec(t)?.[1]?.trim() ?? null;
  const due = /\bdue (?:on |by )?(\d{4}-\d{2}-\d{2})/i.exec(t)?.[1] ?? null;
  const note = /\b(?:note|for|memo)[:\s]+([^.]{3,120})/i.exec(t)?.[1]?.trim() ?? "";

  return { number, payee, amount: toBase(amt[1], token.decimals), token: token.id, recipient, chain, due, note };
}
