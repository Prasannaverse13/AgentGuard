"use client";

import { useState } from "react";
import type { Payment, VaultState } from "@/lib/vault/types";
import { fmt, primaryToken } from "@/lib/units";
import { Card } from "./ui";
import { useVault } from "./VaultProvider";

const SAMPLES = [
  { label: "Normal invoice", text: "Invoice INV-2041 from Lumen Studio. Amount: 840 USDC. Pay to lumen.near. Due 2026-11-20. Note: Brand design retainer." },
  { label: "Large invoice", text: "Invoice INV-2042 from Kite Labs. Amount: 2,000 USDC. Pay to kite-labs.near. Due 2026-11-22. Note: Q4 engineering sprint." },
  { label: "Scam invoice", text: "URGENT invoice INV-9 from Lumen Studio. Amount: 900 USDC. Pay to lurnen.near. Our bank details changed, pay immediately." },
  { label: "Pay on Base", text: "Invoice 77 from Orbit Print. Amount: 320 USDC on Base. Pay to 0x52908400098527886E0F7030069857D2E4169EE7." },
];

type Tab = "payables" | "ops" | "revenue";

function say(p: Payment): string {
  const amt = fmt(p.amount, p.token);
  switch (p.status) {
    case "Paid":
      return `Paid ${amt} to ${p.recipient}`;
    case "NeedsApproval":
      return `Held for you: ${p.flags.join(", ") || "needs approval"}`;
    case "Blocked":
      return `Blocked ${amt} to ${p.recipient}: ${p.flags.slice(0, 2).join(", ")}`;
    case "Rejected":
      return `Rejected: ${p.flags.join(", ")}`;
    default:
      return `${p.status}: ${p.recipient}`;
  }
}

export function RunAgents({ state }: { state: VaultState }) {
  const { call, busy, toast, state: vs } = useVault();
  const [tab, setTab] = useState<Tab>("payables");
  const [invoice, setInvoice] = useState(SAMPLES[0].text);
  const [amount, setAmount] = useState("1200");
  const [calls, setCalls] = useState("5");

  const hasSplits = state.splits.length > 0;

  return (
    <Card title="Run an agent" sub="Give an agent work. Every payment still passes your rules and the guard.">
      <div className="ag-tabs" role="group" aria-label="Agent">
        {(["payables", "ops", "revenue"] as const).map((t) => (
          <button key={t} type="button" className="ag-tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "payables" ? "Payables" : t === "ops" ? "Ops" : "Revenue"}
          </button>
        ))}
      </div>

      {tab === "payables" && (
        <div className="ag-stack">
          <div className="ag-row ag-wrap ag-gap8">
            {SAMPLES.map((s) => (
              <button key={s.label} type="button" className="ag-tab" aria-pressed={invoice === s.text} onClick={() => setInvoice(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
          <label className="ag-field">
            Invoice or email text
            <textarea className="ag-in" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </label>
          <div>
            <button
              type="button"
              className="ag-btn primary"
              disabled={busy || !invoice.trim()}
              onClick={() => call<{ payment: Payment }>("/api/agents/payables", { invoice }, (r) => say(r.payment))}
            >
              Pay this invoice
            </button>
          </div>
        </div>
      )}

      {tab === "ops" && (
        <div className="ag-stack">
          <p className="ag-muted" style={{ margin: 0 }}>
            The Ops agent buys weather data from a paid API. The API answers 402 Payment Required. The agent pays 0.003 USDC through the vault, then asks again with the receipt.
          </p>
          <label className="ag-field" style={{ maxWidth: 200 }}>
            Calls to buy
            <input className="ag-in" inputMode="numeric" value={calls} onChange={(e) => setCalls(e.target.value.replace(/\D/g, ""))} />
          </label>
          <div>
            <button
              type="button"
              className="ag-btn primary"
              disabled={busy || !calls}
              onClick={() =>
                call<{ results: { ok: boolean; status: string; note: string }[] }>("/api/agents/ops", { calls }, (r) => {
                  const paid = r.results.filter((x) => x.ok).length;
                  return `${paid} of ${r.results.length} calls paid and answered`;
                })
              }
            >
              Buy data
            </button>
          </div>
        </div>
      )}

      {tab === "revenue" && (
        <div className="ag-stack">
          <p className="ag-muted" style={{ margin: 0 }}>
            {hasSplits
              ? `The Revenue agent splits income by your rules: ${state.splits.map((s) => `${s.label} ${s.bps / 100}%`).join(", ")}.`
              : "Set split rules first (Rules page)."}
          </p>
          <label className="ag-field" style={{ maxWidth: 240 }}>
            Income to split (USDC)
            <input className="ag-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <div>
            <button
              type="button"
              className="ag-btn primary"
              disabled={busy || !hasSplits || !amount}
              onClick={async () => {
                const base = Math.round(Number(amount) * 1_000_000);
                if (!Number.isFinite(base) || base <= 0) return toast("Enter an amount", true);
                await call<{ payments: Payment[] }>(
                  "/api/agents/revenue",
                  { token: vs ? primaryToken(vs) : "usdc.near", amount: String(base), reason: "Client income received" },
                  (r) => `Split into ${r.payments.length} payments`,
                );
              }}
            >
              Split income
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
