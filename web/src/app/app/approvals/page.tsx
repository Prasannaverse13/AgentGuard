"use client";

import { Card, Flags, timeAgo } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import { fmt } from "@/lib/units";
import type { Payment, VaultState } from "@/lib/vault/types";

/** Approved once but needs a second person, or sent. Read from the vault after the call. */
const approvedMessage = (id: number, sentText: string) => (r: Res) => {
  const p = r.state?.payments[id];
  if (p?.status === "NeedsApproval") return `Your approval is recorded. It needs one more approver (${p.approvals?.length ?? 1} of 2).`;
  return sentText;
};

const needsTwo = (p: Payment, s: VaultState) =>
  Boolean(s.security?.coApprovers.length) && Boolean(s.security?.dualRules.some((r) => r.token === p.token && BigInt(p.amount) > BigInt(r.above)));

type Res = { state?: VaultState };

export default function Approvals() {
  const { state, call, busy, isCoApprover } = useVault();
  if (!state) return <p className="ag-muted">Loading the vault</p>;
  const pending = state.payments.filter((p) => p.status === "NeedsApproval").reverse();
  const agentName = (acc: string) => state.agents.find((a) => a.account === acc)?.name ?? acc;
  const known = new Set(state.knownPayees);

  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Approvals</h1>
          <p>Payments your rules held for you. Nothing here has been sent.{isCoApprover ? " You are signed in as a co-approver." : ""}</p>
        </div>
      </div>
      {pending.length === 0 ? (
        <Card>
          <div className="ag-empty">All clear. Payments that go over a limit or reach a new payee will wait here.</div>
        </Card>
      ) : (
        <div className="ag-stack">
          {pending.map((p) => {
            const trusted = known.has(`${p.destinationChain}:${p.recipient}`);
            const two = needsTwo(p, state);
            const got = p.approvals ?? [];
            return (
              <article className="ag-item" key={p.id}>
                <div className="ag-row ag-between ag-wrap">
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }} className="ag-mono">
                      {fmt(p.amount, p.token, 3)}
                    </div>
                    <div className="ag-muted">
                      to <b style={{ color: "var(--color-ink)", fontWeight: 500 }}>{p.recipient}</b> on {p.destinationChain}
                    </div>
                  </div>
                  <div className="ag-small ag-muted" style={{ textAlign: "right" }}>
                    Asked by {agentName(p.agent)}
                    <br />
                    {timeAgo(p.createdAt)}
                  </div>
                </div>
                <p className="ag-reason">
                  <span className="ag-muted">Agent&apos;s reason: </span>
                  {p.reason}
                </p>
                <Flags flags={p.flags} risk={p.riskScore} />
                {two && (
                  <p className="ag-small" style={{ margin: 0 }}>
                    <b style={{ fontWeight: 550 }}>Two person approval.</b>{" "}
                    <span className="ag-muted">
                      {got.length === 0 ? "Needs 2 different approvers." : `${got.length} of 2 approved (${got.map((g) => (g === "owner" ? "owner" : g.length > 20 ? `${g.slice(0, 6)}…${g.slice(-4)}` : g)).join(", ")}).`}
                    </span>
                  </p>
                )}
                <div className="ag-row ag-wrap ag-gap8">
                  <button type="button" className="ag-btn primary" disabled={busy} onClick={() => call(`/api/payments/${p.id}`, { action: "approve" }, approvedMessage(p.id, `Approved. ${fmt(p.amount, p.token, 3)} sent.`))}>
                    Approve and send
                  </button>
                  {!trusted && !isCoApprover && (
                    <button type="button" className="ag-btn" disabled={busy} onClick={() => call(`/api/payments/${p.id}`, { action: "approve", trust: true }, approvedMessage(p.id, "Approved. Payee is now trusted."))}>
                      Approve and trust payee
                    </button>
                  )}
                  <button type="button" className="ag-btn danger" disabled={busy} onClick={() => call(`/api/payments/${p.id}`, { action: "dismiss" }, "Dismissed. Nothing was paid.")}>
                    Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
