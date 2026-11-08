"use client";

import { Fragment, useState } from "react";
import { Card, Flags, StatusChip, timeAgo } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import { activityCsv } from "@/lib/csv";
import { fmt } from "@/lib/units";
import type { PaymentStatus } from "@/lib/vault/types";

const FILTERS: { label: string; match: (s: PaymentStatus) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Paid", match: (s) => s === "Paid" },
  { label: "Needs you", match: (s) => s === "NeedsApproval" },
  { label: "Stopped", match: (s) => s === "Blocked" || s === "Rejected" || s === "Dismissed" || s === "Failed" },
];

export default function Activity() {
  const { state } = useVault();
  const [f, setF] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  if (!state) return <p className="ag-muted">Loading the vault</p>;
  const rows = [...state.payments].reverse().filter((p) => FILTERS[f].match(p.status));
  const agentName = (acc: string) => state.agents.find((a) => a.account === acc)?.name ?? acc;

  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Activity</h1>
          <p>Every payment and every attempt, with the agent&apos;s reason. This is the audit record.</p>
        </div>
        <button
          type="button"
          className="ag-btn"
          disabled={state.payments.length === 0}
          onClick={() => {
            const blob = new Blob([activityCsv(state)], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `agentguard-${state.vaultId}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        >
          Export CSV
        </button>
      </div>
      <Card>
        <div className="ag-tabs">
          {FILTERS.map((x, i) => (
            <button key={x.label} type="button" className="ag-tab" aria-pressed={f === i} onClick={() => setF(i)}>
              {x.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="ag-empty">Nothing here yet.</div>
        ) : (
          <div className="ag-scroll">
            <table className="ag-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Agent</th>
                  <th style={{ textAlign: "right" }}>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Fragment key={p.id}>
                    <tr className={open === p.id ? "open" : ""} onClick={() => setOpen(open === p.id ? null : p.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <StatusChip status={p.status} />
                      </td>
                      <td>
                        <div className="ag-mono">
                          {fmt(p.amount, p.token, 3)} to {p.recipient}
                        </div>
                        <div className="ag-small ag-muted">{p.kind === "Split" ? `Split: ${p.memo}` : p.memo}</div>
                      </td>
                      <td>{agentName(p.agent)}</td>
                      <td className="ag-small ag-muted" style={{ textAlign: "right" }}>
                        {timeAgo(p.updatedAt)}
                      </td>
                    </tr>
                    {open === p.id && (
                      <tr className="open">
                        <td colSpan={4}>
                          <div className="ag-stack" style={{ gap: 8 }}>
                            <div>
                              <span className="ag-muted">Reason: </span>
                              {p.reason}
                            </div>
                            <Flags flags={p.flags} risk={p.riskScore} />
                            <div className="ag-small ag-muted">
                              Payment #{p.id} on {p.destinationChain}. Sent to {p.transferTo}. Created {new Date(p.createdAt).toLocaleString()}.
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
