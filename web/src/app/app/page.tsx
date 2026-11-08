"use client";

import Link from "next/link";
import { RunAgents } from "@/components/app/RunAgents";
import { Card, Flags, StatusChip, timeAgo } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import { fmt, primaryToken, symbolOf } from "@/lib/units";

export default function Overview() {
  const { state } = useVault();
  if (!state) return <p className="ag-muted">Loading the vault</p>;

  const usdc = primaryToken(state);
  const pending = state.payments.filter((p) => p.status === "NeedsApproval");
  const paidToday = state.payments.filter((p) => p.status === "Paid" && Date.now() - p.updatedAt < 86_400_000);
  const blocked = state.payments.filter((p) => p.status === "Blocked" || p.status === "Rejected").length;
  const recent = [...state.payments].reverse().slice(0, 6);

  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Overview</h1>
          <p>What your agents are doing with your money.</p>
        </div>
      </div>

      <div className="ag-grid c3">
        <Card>
          <div className="ag-label">Vault balance</div>
          <div className="ag-big">{fmt(state.balances[usdc] ?? "0", usdc)}</div>
          <div className="ag-small ag-muted" style={{ marginTop: 8 }}>
            Agents never hold this money. The vault sends it.
          </div>
        </Card>
        <Card>
          <div className="ag-label">Waiting for you</div>
          <div className="ag-big">{pending.length}</div>
          <div className="ag-small" style={{ marginTop: 8 }}>
            <Link href="/app/approvals" style={{ color: "var(--color-ember-deep)" }}>
              {pending.length ? "Review payments" : "Nothing to review"}
            </Link>
          </div>
        </Card>
        <Card>
          <div className="ag-label">Last 24 hours</div>
          <div className="ag-big">{paidToday.length} paid</div>
          <div className="ag-small ag-muted" style={{ marginTop: 8 }}>
            {blocked} blocked or rejected in total
          </div>
        </Card>
      </div>

      <div className="ag-grid c2" style={{ alignItems: "start" }}>
        <RunAgents state={state} />
        <Card title="Agents" sub="Spent today against each daily cap.">
          <div className="ag-stack" style={{ gap: 20 }}>
            {state.agents.map((a) => {
              const l = a.limits[0];
              const cap = l ? Number(BigInt(l.dailyCap)) : 0;
              const spent = l ? Number(BigInt(l.spentToday)) : 0;
              const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
              return (
                <div key={a.account}>
                  <div className="ag-row ag-between">
                    <b style={{ fontWeight: 550 }}>
                      {a.name}
                      {a.paused && <span className="ag-chip bad" style={{ marginLeft: 8 }}>paused</span>}
                    </b>
                    <span className="ag-mono ag-small">
                      {l ? `${fmt(l.spentToday, l.token, 3)} of ${fmt(l.dailyCap, l.token)}` : "No tokens allowed"}
                    </span>
                  </div>
                  <div className={`ag-bar ${pct > 90 ? "warn" : ""}`} style={{ marginTop: 8 }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="ag-small ag-muted" style={{ marginTop: 6 }}>
                    {l ? `Up to ${fmt(l.perTxLimit, l.token)} per payment in ${symbolOf(l.token)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Recent activity" action={<Link href="/app/activity" className="ag-small" style={{ color: "var(--color-ember-deep)" }}>See all</Link>}>
        {recent.length === 0 ? (
          <div className="ag-empty">No payments yet. Run an agent above.</div>
        ) : (
          <div className="ag-scroll">
            <table className="ag-table">
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td style={{ width: 120 }}>
                      <StatusChip status={p.status} />
                    </td>
                    <td>
                      <div>
                        {fmt(p.amount, p.token, 3)} to {p.recipient}
                      </div>
                      <div className="ag-small ag-muted">{p.reason}</div>
                      <div style={{ marginTop: 6 }}>
                        <Flags flags={p.flags} risk={p.riskScore} />
                      </div>
                    </td>
                    <td className="ag-small ag-muted" style={{ width: 100, textAlign: "right" }}>
                      {timeAgo(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
