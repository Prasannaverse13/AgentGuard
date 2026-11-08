"use client";

import { useState } from "react";
import { Card } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import type { AuditResult, Finding, Verdict } from "@/lib/privacy/audit";

const GROUPS: { verdict: Verdict; title: string; sub: string }[] = [
  { verdict: "confirmed", title: "Confirmed", sub: "Traced to a public field and re-checked by a separate verifier." },
  { verdict: "needs-validation", title: "Needs validation", sub: "A lead with one open fact. No severity until that fact is known." },
  { verdict: "rejected", title: "Rejected", sub: "Disproved by the verifier, or a hardening note another layer already covers." },
];

function save(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}

export default function Privacy() {
  const { state, call, busy, target } = useVault();
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [running, setRunning] = useState(false);
  if (!state) return <p className="ag-muted">Loading the vault</p>;
  const privateSet = new Set(state.security?.privatePayees ?? []);

  async function run() {
    setRunning(true);
    const j = await call<{ audit: AuditResult }>("/api/privacy", {}, (r) => `Audit done. Privacy score ${r.audit.summary.score} of 100.`);
    if (j) setAudit(j.audit);
    setRunning(false);
  }

  async function fix(f: Finding) {
    const p = f.fix?.payeePrivate;
    if (!p) return;
    const done = await call("/api/vault", { action: "payeePrivate", chain: p.chain, recipient: p.recipient, private: true }, "Payouts to this payee go the private route");
    if (done) await run();
  }

  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Privacy</h1>
          <p>Every payment your agents make is public on chain. This checks what that record gives away.</p>
        </div>
        <button type="button" className="ag-btn primary" disabled={running || busy} onClick={run}>
          {running ? "Auditing" : audit ? "Run again" : "Run privacy audit"}
        </button>
      </div>

      <div className="ag-grid c3">
        <Card title="Privacy shield" sub="On for every new payment.">
          <p className="ag-muted pv-note">Emails, phone numbers, bank and card numbers in an invoice are masked before the agent writes its reason on chain.</p>
        </Card>
        <Card title="Private payouts" sub={`${privateSet.size} payee${privateSet.size === 1 ? "" : "s"} marked private.`}>
          <p className="ag-muted pv-note">Paid through NEAR Intents confidential settlement, so the link between you and the payee is not public. Settles on mainnet.</p>
        </Card>
        <Card title="Audit method" sub="Built on the Cloudflare security audit skill.">
          <p className="ag-muted pv-note">Map every public surface, hunt in isolation, let a separate verifier try to disprove each lead, report only what survives.</p>
        </Card>
      </div>

      {!audit && (
        <Card>
          <p className="ag-muted" style={{ margin: 0 }}>
            No audit yet for {state.vaultId} on {target}. Run one to see what the public record shows about your business.
          </p>
        </Card>
      )}

      {audit && (
        <>
          <Card
            title={`Privacy score ${audit.summary.score} of 100`}
            sub={`${audit.summary.confirmed} confirmed, ${audit.summary.needsValidation} need validation, ${audit.summary.rejected} rejected. ${audit.summary.coverage}% of ${audit.ledger.length} public surfaces checked. Model: ${audit.model ?? "none, rules only"}.`}
            action={
              <div className="pv-actions">
                <button type="button" className="ag-btn" onClick={() => save(`privacy-audit-${audit.vaultId}.md`, audit.report, "text/markdown")}>Report</button>
                <button type="button" className="ag-btn" onClick={() => save(`findings-${audit.vaultId}.json`, JSON.stringify(audit.findings, null, 2), "application/json")}>Findings JSON</button>
              </div>
            }
          >
            <ol className="pv-phases">
              {audit.phases.map((p) => (
                <li key={p.name}>
                  <b>{p.name}</b> <span className="ag-muted">{p.detail}</span>
                </li>
              ))}
            </ol>
          </Card>

          {GROUPS.map((g) => {
            const rows = audit.findings.filter((f) => f.verdict === g.verdict);
            if (rows.length === 0) return null;
            return (
              <Card key={g.verdict} title={`${g.title} (${rows.length})`} sub={g.sub}>
                <ul className="pv-list">
                  {rows.map((f) => {
                    const p = f.fix?.payeePrivate;
                    const already = p && privateSet.has(`${p.chain}:${p.recipient}`);
                    return (
                      <li key={f.id} className={`pv-item ${f.verdict}`}>
                        <div className="pv-head">
                          <span className="pv-id">{f.id}</span>
                          <b>{f.title}</b>
                          {f.severity && <span className={`ag-chip ${f.severity === "high" ? "bad" : f.severity === "medium" ? "needs" : ""}`}>{f.severity}</span>}
                        </div>
                        <p className="pv-ev">
                          <code>{f.evidence.path}</code> shows <code>{f.evidence.quote}</code>
                        </p>
                        <p>{f.impact}</p>
                        {f.openFact && <p className="ag-muted">Open fact: {f.openFact}</p>}
                        <p className="ag-muted">Verifier: {f.verifier}</p>
                        {f.fix && f.verdict !== "rejected" && (
                          p && !already ? (
                            <button type="button" className="ag-btn primary" disabled={busy} onClick={() => fix(f)}>{f.fix.label}</button>
                          ) : (
                            <p className="ag-muted">Fix: {already ? "already private" : f.fix.label}</p>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}
