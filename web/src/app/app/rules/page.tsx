"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { AlertsCard, AutoPauseCard, EmailCard, TwoPersonCard } from "@/components/app/SecurityCards";
import { useVault } from "@/components/app/VaultProvider";
import { toBase } from "@/lib/units";
import type { SplitRule } from "@/lib/vault/types";

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" className="ag-switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

export default function Rules() {
  const { state, call, busy, toast, target } = useVault();
  const [payee, setPayee] = useState("");
  const [chain, setChain] = useState("near");
  const [splits, setSplits] = useState<SplitRule[]>([]);
  const [deposit, setDeposit] = useState("1000");

  useEffect(() => {
    if (state) setSplits((cur) => (cur.length ? cur : state.splits));
  }, [state]);

  if (!state) return <p className="ag-muted">Loading the vault</p>;
  const total = splits.reduce((s, r) => s + (Number(r.bps) || 0), 0);
  const privateSet = new Set(state.security?.privatePayees ?? []);

  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Rules</h1>
          <p>Your rules are the only authority. Agents work inside them.</p>
        </div>
      </div>

      <div className="ag-grid c2" style={{ alignItems: "start" }}>
        <Card title="Safety switches">
          <div className="ag-stack" style={{ gap: 20 }}>
            <div className="ag-row ag-between">
              <div>
                <b style={{ fontWeight: 550 }}>Pause the whole vault</b>
                <div className="ag-small ag-muted">Every agent payment is refused while this is on.</div>
              </div>
              <Switch on={state.paused} label="Pause the vault" disabled={busy} onChange={(v) => call("/api/vault", { action: "pause", paused: v }, v ? "Vault paused" : "Vault resumed")} />
            </div>
            <div className="ag-row ag-between">
              <div>
                <b style={{ fontWeight: 550 }}>New payees need my approval</b>
                <div className="ag-small ag-muted">First payment to anyone you have not trusted waits for you.</div>
              </div>
              <Switch on={state.newPayeeNeedsApproval} label="New payees need approval" disabled={busy} onChange={(v) => call("/api/vault", { action: "newPayeeRule", value: v }, "Saved")} />
            </div>
          </div>
        </Card>

        <Card title="Trusted payees" sub="Payments to these skip the new payee hold. The guard still checks them. Pay privately routes payouts through NEAR Intents so who you pay stays private (mainnet).">
          <div className="ag-row ag-gap8" style={{ marginBottom: 12 }}>
            <select className="ag-in" style={{ width: 110 }} value={chain} onChange={(e) => setChain(e.target.value)} aria-label="Chain">
              {["near", "base", "eth", "arb", "sol"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input className="ag-in" placeholder="Account or address" value={payee} onChange={(e) => setPayee(e.target.value.trim())} />
            <button
              type="button"
              className="ag-btn"
              disabled={busy || !payee}
              onClick={async () => {
                const r = await call("/api/vault", { action: "addPayee", chain, recipient: payee }, "Payee added");
                if (r) setPayee("");
              }}
            >
              Add
            </button>
          </div>
          <div className="ag-stack" style={{ gap: 8 }}>
            {state.knownPayees.length === 0 && <div className="ag-muted">None yet.</div>}
            {state.knownPayees.map((k) => {
              const i = k.indexOf(":");
              return (
                <div key={k} className="ag-row ag-between">
                  <span className="ag-small">
                    <span className="ag-chip" style={{ marginRight: 8 }}>{k.slice(0, i)}</span>
                    {k.slice(i + 1)}
                  </span>
                  <span className="ag-row ag-gap8">
                    {state.security && (
                      <button
                        type="button"
                        className={`ag-btn ${privateSet.has(k) ? "primary" : ""}`}
                        aria-pressed={privateSet.has(k)}
                        disabled={busy}
                        onClick={() => call("/api/vault", { action: "payeePrivate", chain: k.slice(0, i), recipient: k.slice(i + 1), private: !privateSet.has(k) }, privateSet.has(k) ? "Paid normally from now on" : "Payouts to this payee go the private route")}
                      >
                        {privateSet.has(k) ? "Private" : "Pay privately"}
                      </button>
                    )}
                    <button type="button" className="ag-btn" disabled={busy} onClick={() => call("/api/vault", { action: "removePayee", chain: k.slice(0, i), recipient: k.slice(i + 1) }, "Removed")}>
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="ag-grid c2" style={{ alignItems: "start" }}>
        <AutoPauseCard />
        <TwoPersonCard />
      </div>

      <div className="ag-grid c2" style={{ alignItems: "start" }}>
        <AlertsCard />
        <EmailCard />
      </div>

      <Card title="Revenue split" sub="How the Revenue agent divides income. It must add up to 100%.">
        <div className="ag-stack">
          {splits.map((r, i) => (
            <div className="ag-split" key={i}>
              <input className="ag-in" aria-label="Label" value={r.label} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="ag-in" aria-label="Recipient" value={r.recipient} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, recipient: e.target.value.trim() } : x)))} />
              <input
                className="ag-in"
                aria-label="Percent"
                inputMode="decimal"
                value={r.bps / 100}
                onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, bps: Math.round((Number(e.target.value) || 0) * 100) } : x)))}
              />
              <button type="button" className="ag-btn" aria-label="Remove rule" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <div className="ag-row ag-between ag-wrap">
            <button type="button" className="ag-btn" onClick={() => setSplits([...splits, { label: "", recipient: "", bps: 0 }])}>
              Add rule
            </button>
            <div className="ag-row">
              <span className={`ag-small ${total === 10000 ? "ag-muted" : ""}`} style={total === 10000 ? undefined : { color: "var(--color-loss)" }}>
                Total {total / 100}%
              </span>
              <button type="button" className="ag-btn primary" disabled={busy || total !== 10000 || splits.some((s) => !s.label || !s.recipient)} onClick={() => call("/api/vault", { action: "splits", splits }, "Split rules saved")}>
                Save split
              </button>
            </div>
          </div>
        </div>
      </Card>

      {target === "demo" && (
      <Card title="Add demo funds" sub="The demo vault only. A NEAR vault is funded by sending it tokens.">
        <div className="ag-row ag-gap8" style={{ maxWidth: 420 }}>
          <input className="ag-in" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d.]/g, ""))} aria-label="USDC amount" />
          <button
            type="button"
            className="ag-btn"
            disabled={busy || !deposit}
            onClick={() => {
              try {
                void call("/api/vault", { action: "deposit", token: "usdc.near", amount: toBase(deposit, 6) }, "Funds added");
              } catch {
                toast("Enter a number", true);
              }
            }}
          >
            Add USDC
          </button>
        </div>
      </Card>
      )}
    </>
  );
}
