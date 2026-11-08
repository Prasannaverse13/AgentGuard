import type { Payment, Verdict } from "../vault/types";

export interface PayeeIntel {
  /** Days since the account was created, when known. */
  accountAgeDays?: number;
  /** True when a public scam list names this address. */
  listedAsScam?: boolean;
}

export interface GuardContext {
  /** Payees the owner already trusts, as "chain:address". */
  knownPayees: string[];
  /** Earlier paid amounts for the same token (base units), used to spot odd sizes. */
  history: bigint[];
  intel?: PayeeIntel;
}

export interface GuardResult {
  verdict: Verdict;
  riskScore: number;
  flags: string[];
}

const URGENT = [
  "urgent",
  "immediately",
  "asap",
  "right now",
  "act now",
  "wire now",
  "gift card",
  "new bank details",
  "changed account",
  "changed my wallet",
  "do not tell",
  "keep this secret",
  "ceo asked",
];

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const ADDRESS_RULES: Record<string, RegExp> = {
  near: /^([a-f0-9]{64}|[a-z\d._-]{2,64})$/,
  eth: /^0x[a-fA-F0-9]{40}$/,
  base: /^0x[a-fA-F0-9]{40}$/,
  arb: /^0x[a-fA-F0-9]{40}$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  btc: /^(bc1[a-z0-9]{20,80}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
};

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** A payee name that is almost, but not exactly, one the owner trusts. */
function lookalike(recipient: string, chain: string, known: string[]): string | null {
  const r = recipient.toLowerCase();
  for (const k of known) {
    const [c, addr] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    if (c !== chain.toLowerCase() || addr.toLowerCase() === r) continue;
    if (editDistance(addr.toLowerCase(), r) <= 2 && Math.abs(addr.length - r.length) <= 2) return addr;
  }
  return null;
}

export function median(xs: bigint[]): bigint | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return s[Math.floor(s.length / 2)];
}

/**
 * The scam check. Plain rules the owner can read. Each rule adds to a 0 to 100 score
 * and leaves a flag that says why. 70 and over is blocked. 35 to 69 goes to the owner.
 */
export function checkPayment(p: Pick<Payment, "amount" | "recipient" | "destinationChain" | "memo" | "reason">, ctx: GuardContext): GuardResult {
  let score = 0;
  const flags: string[] = [];
  const add = (n: number, why: string) => {
    score += n;
    flags.push(why);
  };

  const chain = p.destinationChain.toLowerCase();
  const rule = ADDRESS_RULES[chain];
  if (rule && !rule.test(p.recipient) && !(chain === "near" && NEAR_ACCOUNT.test(p.recipient))) {
    add(70, `address is not a valid ${chain} address`);
  }

  if (ctx.intel?.listedAsScam) add(100, "address is on a public scam list");

  if (typeof ctx.intel?.accountAgeDays === "number") {
    const d = ctx.intel.accountAgeDays;
    if (d < 2) add(55, `wallet is ${d <= 0 ? "less than a day" : d + " day"} old`);
    else if (d < 14) add(30, `wallet is only ${d} days old`);
  }

  const look = lookalike(p.recipient, chain, ctx.knownPayees);
  if (look) add(60, `looks like your trusted payee ${look}`);

  const text = `${p.memo} ${p.reason}`.toLowerCase();
  const hit = URGENT.filter((w) => text.includes(w));
  if (hit.length) add(Math.min(40, 20 * hit.length), `pressure language: ${hit.slice(0, 2).join(", ")}`);

  const amt = BigInt(p.amount);
  const med = median(ctx.history);
  if (med && med > 0n) {
    if (amt >= med * 10n) add(35, "amount is over 10 times your usual payment");
    else if (amt >= med * 4n) add(20, "amount is over 4 times your usual payment");
  }

  const known = ctx.knownPayees.includes(`${chain}:${p.recipient.startsWith("0x") ? p.recipient.toLowerCase() : p.recipient}`);
  if (!known) add(8, "first payment to this payee");

  score = Math.min(100, score);
  const verdict: Verdict = score >= 70 ? "Block" : score >= 35 ? "Escalate" : "Approve";
  return { verdict, riskScore: score, flags };
}
