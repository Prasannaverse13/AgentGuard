/**
 * Privacy audit of a vault. Everything an agent does is public on chain, so this looks for what
 * that record gives away. The method follows Cloudflare's security-audit skill, scaled down:
 *
 *   1. Recon     map every public surface into a coverage ledger
 *   2. Hunt      isolated hunters each check only their own ledger units
 *   3. Verify    a separate verifier re-reads the raw record and tries to disprove each candidate
 *   4. Output    structured findings: confirmed, needs validation, or rejected
 *   5. Report    a markdown report built only from verified records
 *
 * Confirmed needs a full trace to a public field. Needs validation names the one fact still open
 * and carries no severity. A hardening note that another layer already covers is rejected, not inflated.
 */
import { chat, firstJson, modelName } from "../agents/llm";
import { fmt } from "../units";
import { FLAGS, type Payment, type VaultState } from "../vault/types";
import { findLeaks } from "./redact";

export type Verdict = "confirmed" | "needs-validation" | "rejected";
export type Severity = "high" | "medium" | "low";

export interface Unit {
  id: string;
  surface: string;
  hunters: string[];
  checked: boolean;
}

export interface Fix {
  label: string;
  payeePrivate?: { chain: string; recipient: string };
}

export interface Finding {
  id: string;
  hunter: string;
  title: string;
  verdict: Verdict;
  severity?: Severity;
  unit: string;
  /** Path into the public record and the exact text found there. */
  evidence: { path: string; quote: string };
  impact: string;
  /** For needs validation: the one fact that would settle it. */
  openFact?: string;
  fix?: Fix;
  verifier: string;
}

export interface AuditResult {
  vaultId: string;
  network: string;
  ranAt: number;
  model: string | null;
  phases: { name: string; detail: string }[];
  ledger: Unit[];
  findings: Finding[];
  summary: { confirmed: number; needsValidation: number; rejected: number; coverage: number; score: number };
  report: string;
}

type Candidate = Omit<Finding, "verdict" | "verifier"> & { verdict: Verdict; check: (s: VaultState) => string | null };

const SENSITIVE = /\b(salary|payroll|wage|bonus|severance|medical|hospital|doctor|therapy|rent|loan|lawyer|legal fees?|settlement|fine|tax id|ssn|passport)\b/i;
const sent = (p: Payment) => p.status === "Paid" || p.status === "Sending";
const payeeKey = (p: Payment) => `${p.destinationChain}:${p.recipient}`;

/* Phase 1: recon. Every public surface becomes a ledger unit with the hunters that own it. */
function recon(s: VaultState): Unit[] {
  const units: Unit[] = [];
  for (const p of s.payments) {
    units.push({ id: `payment#${p.id}.reason`, surface: `Reason on payment #${p.id}`, hunters: ["personal-data", "sensitive-purpose", "ai-review"], checked: false });
    if (p.memo) units.push({ id: `payment#${p.id}.memo`, surface: `Memo on payment #${p.id}`, hunters: ["personal-data"], checked: false });
  }
  const payees = new Set(s.payments.filter((p) => p.kind === "Payment").map(payeeKey));
  for (const k of payees) units.push({ id: `payee:${k}`, surface: `Payment history to ${k}`, hunters: ["linkability", "private-route"], checked: false });
  units.push({ id: "rules.splits", surface: "Revenue split rules", hunters: ["business-map"], checked: false });
  units.push({ id: "rules.coApprovers", surface: "Co-approver list", hunters: ["business-map"], checked: false });
  return units;
}

/* Phase 2: hunters. Each one reads only the units it owns. */
function huntPersonalData(s: VaultState, units: Unit[]): Candidate[] {
  const out: Candidate[] = [];
  for (const u of units.filter((x) => x.hunters.includes("personal-data"))) {
    const [, idStr, field] = u.id.match(/^payment#(\d+)\.(reason|memo)$/) ?? [];
    const p = s.payments.find((x) => x.id === Number(idStr));
    if (!p) continue;
    const text = field === "memo" ? p.memo : p.reason;
    for (const leak of findLeaks(text)) {
      out.push({
        id: "",
        hunter: "personal-data",
        title: `A ${leak.kind} is public in payment #${p.id}`,
        verdict: "confirmed",
        severity: leak.kind === "email" ? "medium" : "high",
        unit: u.id,
        evidence: { path: `payments[${p.id}].${field}`, quote: leak.match },
        impact: `Anyone reading the chain can see this ${leak.kind} and tie it to a ${fmt(p.amount, p.token)} payment.`,
        fix: { label: "New payments mask this automatically. Old records on chain cannot be changed." },
        check: (st) => {
          const q = st.payments.find((x) => x.id === p.id);
          const t = q ? (field === "memo" ? q.memo : q.reason) : "";
          return t.includes(leak.match) ? null : "The quoted text is not in the record";
        },
      });
    }
  }
  return out;
}

function huntSensitivePurpose(s: VaultState, units: Unit[]): Candidate[] {
  const out: Candidate[] = [];
  for (const u of units.filter((x) => x.id.endsWith(".reason"))) {
    const p = s.payments.find((x) => `payment#${x.id}.reason` === u.id);
    const m = p?.reason.match(SENSITIVE);
    if (!p || !m) continue;
    out.push({
      id: "",
      hunter: "sensitive-purpose",
      title: `Payment #${p.id} says it is for ${m[0].toLowerCase()}`,
      verdict: "needs-validation",
      unit: u.id,
      evidence: { path: `payments[${p.id}].reason`, quote: m[0] },
      impact: `If ${p.recipient} is one person, the public record shows what they are paid and why.`,
      openFact: `Whether ${p.recipient} belongs to a single person.`,
      fix: { label: "Mark this payee private", payeePrivate: { chain: p.destinationChain, recipient: p.recipient } },
      check: (st) => {
        if (st.security?.privatePayees.includes(payeeKey(p))) return "This payee is already private";
        return st.payments.find((x) => x.id === p.id)?.reason.match(SENSITIVE) ? null : "The word is not in the reason";
      },
    });
  }
  return out;
}

function huntLinkability(s: VaultState, units: Unit[]): Candidate[] {
  const out: Candidate[] = [];
  for (const u of units.filter((x) => x.id.startsWith("payee:"))) {
    const key = u.id.slice("payee:".length);
    const paid = s.payments.filter((p) => p.kind === "Payment" && payeeKey(p) === key && sent(p));
    if (paid.length < 2 || s.security?.privatePayees.includes(key)) continue;
    const total = paid.reduce((a, p) => a + BigInt(p.amount), 0n);
    const token = paid[0].token;
    const [chain, recipient] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    out.push({
      id: "",
      hunter: "linkability",
      title: `Your full history with ${recipient} is public`,
      verdict: "confirmed",
      severity: paid.length >= 5 ? "medium" : "low",
      unit: u.id,
      evidence: { path: `payments where recipient = ${recipient}`, quote: `${paid.length} payments, ${fmt(total.toString(), token)} in total` },
      impact: "Competitors can see who you pay, how much and how often.",
      fix: { label: "Pay privately from now on", payeePrivate: { chain, recipient } },
      check: (st) => {
        if (st.security?.privatePayees.includes(key)) return "This payee is already private";
        const n = st.payments.filter((p) => p.kind === "Payment" && payeeKey(p) === key && sent(p)).length;
        return n >= 2 ? null : "Fewer than two payments on record";
      },
    });
  }
  return out;
}

function huntPrivateRoute(s: VaultState, units: Unit[], network: string): Candidate[] {
  const out: Candidate[] = [];
  for (const key of s.security?.privatePayees ?? []) {
    const unit = units.find((u) => u.id === `payee:${key}`)?.id ?? `payee:${key}`;
    const recipient = key.slice(key.indexOf(":") + 1);
    const direct = s.payments.filter((p) => payeeKey(p) === key && sent(p) && p.transferTo === p.recipient && p.flags.includes(FLAGS.private));
    if (direct.length > 0) {
      const p = direct[0];
      out.push({
        id: "",
        hunter: "private-route",
        title: `A private payout to ${recipient} went out in the open`,
        verdict: "confirmed",
        severity: "high",
        unit,
        evidence: { path: `payments[${p.id}].transferTo`, quote: p.transferTo },
        impact: `The payee is marked private, but payment #${p.id} was sent straight to them, not through NEAR Intents.`,
        fix: { label: "Keep this payee private and pay on mainnet where the private route settles" },
        check: (st) => (st.payments.find((x) => x.id === p.id)?.transferTo === p.recipient ? null : "The transfer did not go direct"),
      });
    } else if (network !== "mainnet") {
      out.push({
        id: "",
        hunter: "private-route",
        title: `Private payouts to ${recipient} only settle privately on mainnet`,
        verdict: "needs-validation",
        unit,
        evidence: { path: "security.privatePayees", quote: key },
        impact: "On testnet the private route has no liquidity, so a payout would fall back or fail.",
        openFact: "Whether a mainnet NEAR Intents confidential quote succeeds for this payee.",
        check: (st) => (st.security?.privatePayees.includes(key) ? null : "The payee is no longer private"),
      });
    }
  }
  return out;
}

function huntBusinessMap(s: VaultState): Candidate[] {
  const out: Candidate[] = [];
  if (s.splits.length > 0) {
    out.push({
      id: "",
      hunter: "business-map",
      title: "Your revenue split is readable by anyone",
      verdict: "confirmed",
      severity: "low",
      unit: "rules.splits",
      evidence: { path: "splits", quote: s.splits.map((r) => `${r.label} ${r.bps / 100}%`).join(", ") },
      impact: "It shows how income is divided and which accounts receive it.",
      fix: { label: "Point split legs at accounts that do not reveal names" },
      check: (st) => (st.splits.length > 0 ? null : "No split rules on record"),
    });
  }
  if ((s.security?.coApprovers.length ?? 0) > 0) {
    out.push({
      id: "",
      hunter: "business-map",
      title: "Co-approver addresses are public",
      verdict: "rejected",
      unit: "rules.coApprovers",
      evidence: { path: "security.coApprovers", quote: `${s.security!.coApprovers.length} address(es)` },
      impact: "Hardening note only. Knowing an address does not let anyone approve: every approval is a signature checked on chain.",
      check: () => null,
    });
  }
  return out;
}

/* Optional model hunter. Reads reasons only and must quote exact text, which the verifier re-checks. */
async function huntWithModel(s: VaultState): Promise<Candidate[]> {
  const rows = s.payments.slice(-60).map((p) => ({ id: p.id, reason: p.reason, memo: p.memo }));
  if (rows.length === 0) return [];
  const answer = await chat(
    "You audit public blockchain payment notes for privacy leaks: names of private people, home addresses, health, salary of a named person, account or contact details. Reply with JSON only: an array of {\"id\": number, \"field\": \"reason\" or \"memo\", \"quote\": exact text copied from the note, \"why\": short reason}. Return [] when nothing leaks. Never guess.",
    JSON.stringify(rows),
    800,
  );
  const found = firstJson<{ id: number; field: string; quote: string; why: string }[]>(answer) ?? [];
  return found
    .filter((f) => f && typeof f.quote === "string" && f.quote.length > 1 && (f.field === "reason" || f.field === "memo"))
    .slice(0, 20)
    .map((f) => ({
      id: "",
      hunter: "ai-review",
      title: `Possible personal detail in payment #${f.id}`,
      verdict: "needs-validation" as Verdict,
      unit: `payment#${f.id}.${f.field}`,
      evidence: { path: `payments[${f.id}].${f.field}`, quote: f.quote },
      impact: String(f.why ?? "").slice(0, 200),
      openFact: "Whether this text names a real private person.",
      check: (st: VaultState) => {
        const p = st.payments.find((x) => x.id === f.id);
        const t = p ? (f.field === "memo" ? p.memo : p.reason) : "";
        return t.includes(f.quote) ? null : "The model quoted text that is not in the record";
      },
    }));
}

/* Phase 3: verify. A fresh pass that only has the raw record and the candidate, and tries to disprove it. */
async function verify(s: VaultState, cands: Candidate[]): Promise<Finding[]> {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    const dedupe = `${c.unit}|${c.evidence.quote}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const { check, ...rest } = c;
    const disproved = check(s);
    if (disproved) {
      out.push({ ...rest, verdict: "rejected", severity: undefined, verifier: `Disproved: ${disproved}.` });
      continue;
    }
    if (c.hunter === "ai-review") {
      const second = await chat(
        "You are a strict reviewer. Another reviewer flagged this text from a public payment note as a privacy leak. Try to disprove it. Reply with JSON only: {\"leak\": true or false, \"why\": short reason}. A business or company name is not a leak.",
        JSON.stringify({ quote: c.evidence.quote, claim: c.impact }),
        200,
      );
      const v = firstJson<{ leak: boolean; why: string }>(second);
      if (v && v.leak === false) {
        out.push({ ...rest, verdict: "rejected", verifier: `Disproved by a second model pass: ${String(v.why).slice(0, 160)}` });
        continue;
      }
      out.push({ ...rest, verifier: v ? "Quote found in the record. A second model pass could not disprove it." : "Quote found in the record. No second pass ran." });
      continue;
    }
    out.push({ ...rest, verifier: c.verdict === "rejected" ? "Kept as a hardening note." : "Re-read the public record and found the same text." });
  }
  return out.map((f, i) => ({ ...f, id: `PA-${String(i + 1).padStart(3, "0")}` }));
}

/* Phase 4: every record must be well formed before it reaches the report. */
export function validFinding(f: Finding): boolean {
  if (!f.id || !f.title || !f.evidence?.path || !f.evidence.quote || !f.verifier) return false;
  if (f.verdict === "confirmed") return !!f.severity;
  if (f.verdict === "needs-validation") return !f.severity && !!f.openFact;
  return f.verdict === "rejected";
}

const WEIGHT: Record<Severity, number> = { high: 25, medium: 12, low: 5 };

/* Phase 5: the report, built only from verified records. */
function report(r: Omit<AuditResult, "report">): string {
  const by = (v: Verdict) => r.findings.filter((f) => f.verdict === v);
  const line = (f: Finding) =>
    [
      `### ${f.id} ${f.title}`,
      f.severity ? `Severity: ${f.severity}` : "",
      `Evidence: \`${f.evidence.path}\` contains \`${f.evidence.quote}\``,
      `Impact: ${f.impact}`,
      f.openFact ? `Open fact: ${f.openFact}` : "",
      f.fix ? `Fix: ${f.fix.label}` : "",
      `Verifier: ${f.verifier}`,
      "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `# Privacy audit of ${r.vaultId}`,
    "",
    `Network: ${r.network}. Run at ${new Date(r.ranAt).toISOString()}. Model: ${r.model ?? "none, rules only"}.`,
    `Privacy score: ${r.summary.score} of 100. Coverage: ${r.summary.coverage}% of ledger units checked.`,
    "",
    "## Method",
    ...r.phases.map((p, i) => `${i + 1}. ${p.name}: ${p.detail}`),
    "",
    `## Confirmed (${by("confirmed").length})`,
    ...by("confirmed").map(line),
    `## Needs validation (${by("needs-validation").length})`,
    ...by("needs-validation").map(line),
    `## Rejected (${by("rejected").length})`,
    ...by("rejected").map(line),
  ].join("\n");
}

export async function auditVault(s: VaultState, network: string, opts: { useModel?: boolean } = {}): Promise<AuditResult> {
  const ledger = recon(s);
  const model = opts.useModel === false ? null : modelName();
  const cands: Candidate[] = [
    ...huntPersonalData(s, ledger),
    ...huntSensitivePurpose(s, ledger),
    ...huntLinkability(s, ledger),
    ...huntPrivateRoute(s, ledger, network),
    ...huntBusinessMap(s),
    ...(model ? await huntWithModel(s) : []),
  ];
  for (const u of ledger) u.checked = u.hunters.some((h) => h !== "ai-review" || !!model);
  const findings = (await verify(s, cands)).filter(validFinding);
  const confirmed = findings.filter((f) => f.verdict === "confirmed");
  const base = {
    vaultId: s.vaultId,
    network,
    ranAt: Date.now(),
    model,
    phases: [
      { name: "Recon", detail: `mapped ${ledger.length} public surfaces into a coverage ledger` },
      { name: "Hunt", detail: `${model ? 6 : 5} isolated hunters checked their own units and raised ${cands.length} candidates` },
      { name: "Verify", detail: "a separate pass re-read the raw record and tried to disprove each candidate" },
      { name: "Output", detail: "kept only well formed records as confirmed, needs validation or rejected" },
      { name: "Report", detail: "built this report from verified records only" },
    ],
    ledger,
    findings,
    summary: {
      confirmed: confirmed.length,
      needsValidation: findings.filter((f) => f.verdict === "needs-validation").length,
      rejected: findings.filter((f) => f.verdict === "rejected").length,
      coverage: ledger.length ? Math.round((100 * ledger.filter((u) => u.checked).length) / ledger.length) : 100,
      score: Math.max(0, 100 - confirmed.reduce((a, f) => a + WEIGHT[f.severity!], 0)),
    },
  };
  return { ...base, report: report(base) };
}
