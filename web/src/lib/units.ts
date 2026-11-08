import { TOKENS } from "./vault/types";

export const tokenInfo = (id: string) => TOKENS.find((t) => t.id === id);
export const symbolOf = (id: string) => tokenInfo(id)?.symbol ?? id.split(".")[0].toUpperCase();

/** "1,234.5" to base units, without float maths. */
export function toBase(amount: string, decimals: number): string {
  const clean = amount.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error(`Bad amount: ${amount}`);
  const [whole, frac = ""] = clean.split(".");
  const f = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(f || "0")).toString();
}

export function fromBase(base: string, decimals: number, maxFrac = 2): string {
  const v = BigInt(base);
  const d = 10n ** BigInt(decimals);
  const whole = v / d;
  const frac = (v % d).toString().padStart(decimals, "0").slice(0, maxFrac);
  const w = whole.toLocaleString("en-US");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${w}.${trimmed}` : w;
}

export function fmt(base: string, token: string, maxFrac = 2): string {
  const t = tokenInfo(token);
  const dec = t?.decimals ?? 6;
  return `${fromBase(base, dec, maxFrac)} ${symbolOf(token)}`;
}

/** The token the vault mostly deals in: the first one an agent has a limit for. */
export const primaryToken = (s: { agents: { limits: { token: string }[] }[] }) => s.agents.flatMap((a) => a.limits)[0]?.token ?? "usdc.near";
