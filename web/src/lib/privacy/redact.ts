/**
 * Privacy shield. Agent reasons and memos are written to a public chain, so personal data
 * in an invoice (emails, phone numbers, bank and card numbers) is masked before it leaves the server.
 */
export interface Leak {
  kind: "email" | "phone" | "iban" | "card" | "account number";
  match: string;
}

const PATTERNS: { kind: Leak["kind"]; re: RegExp; check?: (m: string) => boolean }[] = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g },
  { kind: "card", re: /\b(?:\d[ -]?){13,19}\b/g, check: (m) => luhn(m.replace(/\D/g, "")) },
  { kind: "phone", re: /(?<![\w.])\+?\d[\d ()-]{8,16}\d(?![\w.])/g, check: (m) => m.replace(/\D/g, "").length >= 9 && !/^\d{4}-\d{2}-\d{2}$/.test(m.trim()) },
  { kind: "account number", re: /\b(?:acct|account|a\/c|routing|sort code|ifsc)[\s:#.no]*([A-Z0-9-]{6,20})\b/gi },
];

export function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Every piece of personal data found in the text, in order. */
export function findLeaks(text: string): Leak[] {
  const out: Leak[] = [];
  const taken: [number, number][] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      if (p.check && !p.check(m[0])) continue;
      taken.push([start, end]);
      out.push({ kind: p.kind, match: m[0] });
    }
  }
  return out;
}

const mask = (kind: Leak["kind"]) => `[${kind} hidden]`;

/** The text with personal data masked, and what was masked. */
export function redact(text: string): { text: string; hidden: Leak[] } {
  const hidden = findLeaks(text);
  let out = text;
  for (const l of hidden) out = out.split(l.match).join(mask(l.kind));
  return { text: out, hidden };
}
