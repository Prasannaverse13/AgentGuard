"use client";

import { useState } from "react";
import { Card } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import { fmt, fromBase, toBase, tokenInfo } from "@/lib/units";
import type { Agent } from "@/lib/vault/types";

const ROLE: Record<Agent["kind"], string> = {
  Payables: "Reads invoices and pays them. Can pay other chains through NEAR Intents.",
  Ops: "Buys APIs and data one call at a time using pay per call (x402).",
  Revenue: "Splits income by your rules. It cannot pick who gets paid.",
};

function LimitEditor({ agent }: { agent: Agent }) {
  const { call, busy } = useVault();
  const l = agent.limits[0];
  const dec = l ? (tokenInfo(l.token)?.decimals ?? 6) : 6;
  const [cap, setCap] = useState(l ? fromBase(l.dailyCap, dec, 6) .replace(/,/g, "") : "");
  const [per, setPer] = useState(l ? fromBase(l.perTxLimit, dec, 6).replace(/,/g, "") : "");
  if (!l) return <p className="ag-muted">No tokens allowed. This agent cannot spend.</p>;
  return (
    <div className="ag-stack">
      <div className="ag-grid c2">
        <label className="ag-field">
          Daily cap (USDC)
          <input className="ag-in" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <label className="ag-field">
          Per payment limit (USDC)
          <input className="ag-in" inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
      </div>
      <div>
        <button
          type="button"
          className="ag-btn"
          disabled={busy}
          onClick={() => {
            try {
              void call(
                "/api/vault",
                { action: "limits", agent: agent.account, limits: [{ token: l.token, dailyCap: toBase(cap, dec), perTxLimit: toBase(per, dec) }] },
                "Limits saved",
              );
            } catch {
              /* shown by call */
            }
          }}
        >
          Save limits
        </button>
      </div>
    </div>
  );
}

export default function Agents() {
  const { state, call, busy } = useVault();
  if (!state) return <p className="ag-muted">Loading the vault</p>;
  const sec = state.security;
  return (
    <>
      <div className="ag-top">
        <div>
          <h1>Agents</h1>
          <p>Each agent is its own account with its own limits. Pause one and it stops at once.</p>
        </div>
      </div>
      <div className="ag-stack">
        {state.agents.map((a) => (
          <Card
            key={a.account}
            title={a.name}
            sub={ROLE[a.kind]}
            action={
              <div className="ag-row">
                <span className="ag-small ag-muted">
                  {a.paused ? (sec && sec.autoPauseAfter > 0 && (sec.strikes[a.account] ?? 0) >= sec.autoPauseAfter ? "Auto paused" : "Paused") : "Active"}
                </span>
                <button
                  type="button"
                  className="ag-switch"
                  role="switch"
                  aria-checked={!a.paused}
                  aria-label={`${a.name} active`}
                  disabled={busy}
                  onClick={() => call("/api/vault", { action: "agentPause", agent: a.account, paused: !a.paused }, a.paused ? `${a.name} resumed` : `${a.name} paused`)}
                />
              </div>
            }
          >
            <div className="ag-small ag-muted" style={{ marginBottom: 16 }}>
              Account {a.account}. Spent today {a.limits[0] ? fmt(a.limits[0].spentToday, a.limits[0].token, 3) : "nothing"}.
              {sec && (sec.strikes[a.account] ?? 0) > 0 && sec.autoPauseAfter > 0 && ` Stopped ${sec.strikes[a.account]} of ${sec.autoPauseAfter} in a row before auto pause.`}
            </div>
            <LimitEditor key={a.limits[0]?.dailyCap + ":" + a.limits[0]?.perTxLimit} agent={a} />
          </Card>
        ))}
      </div>
    </>
  );
}
