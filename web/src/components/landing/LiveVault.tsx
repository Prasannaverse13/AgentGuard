"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NETWORKS } from "@/lib/near/network";
import { fmt, primaryToken } from "@/lib/units";
import type { Payment, VaultState } from "@/lib/vault/types";

const STATUS: Record<string, { label: string; tone: string }> = {
  Paid: { label: "Paid", tone: "gain" },
  Blocked: { label: "Blocked", tone: "loss" },
  Dismissed: { label: "Dismissed", tone: "loss" },
  Rejected: { label: "Rejected", tone: "loss" },
  Failed: { label: "Failed", tone: "loss" },
  NeedsApproval: { label: "Waiting for owner", tone: "ember" },
  AwaitingGuard: { label: "Checking", tone: "" },
  Sending: { label: "Sending", tone: "" },
};

function ago(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const setText = (id: string, v: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
};

/** Reads the real vault on NEAR testnet and shows it on the landing page. Falls back to nothing if the chain is not reachable. */
export function LiveVault() {
  const [s, setS] = useState<VaultState | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/vault?network=testnet");
        const j = (await r.json()) as { state?: VaultState | null; vault?: string };
        if (stop || !j.state) return;
        setS(j.state);
        setVaultId(j.vault ?? j.state.vaultId);
      } catch {
        /* keep the static page */
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // Put the real numbers in the hero cards.
  useEffect(() => {
    if (!s) return;
    const tok = primaryToken(s);
    setText("vault-bal", fmt(s.balances[tok] ?? "0", tok));
    const agent = (k: string) => s.agents.find((a) => a.kind === k);
    const short = (b: string) => fmt(b, tok).replace(/ [A-Z]+$/, "");
    const pay = agent("Payables")?.limits[0];
    if (pay) {
      setText("hero-pay-v", short(pay.spentToday));
      setText("hero-pay-cap", `of ${short(pay.dailyCap)}`);
    }
    const ops = agent("Ops")?.limits[0];
    if (ops) {
      setText("hero-ops-v", short(ops.spentToday));
      setText("hero-ops-cap", `of ${short(ops.dailyCap)}`);
    }
    const rev = s.payments.filter((p) => p.kind === "Split" && p.status === "Paid").reduce((a, p) => a + BigInt(p.amount), 0n);
    setText("hero-rev-v", `+${short(rev.toString())}`);
  }, [s]);

  if (!s || !vaultId) return null;
  const tok = primaryToken(s);
  const last: Payment[] = [...s.payments].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const paid = s.payments.filter((p) => p.status === "Paid").length;
  const stopped = s.payments.filter((p) => ["Blocked", "Dismissed", "Rejected"].includes(p.status)).length;
  const paused = s.agents.filter((a) => a.paused).map((a) => a.name);

  return (
    <section className="live" id="live" aria-labelledby="live-title">
      <div className="wrap">
        <div className="live-head">
          <div>
            <p className="live-dot">Live on NEAR testnet</p>
            <h2 id="live-title">This vault is running right now</h2>
          </div>
          <div className="live-links">
            <a className="btn btn-ghost" href={`${NETWORKS.testnet.explorer}/address/${vaultId}`} target="_blank" rel="noopener noreferrer">
              See it on NearBlocks
            </a>
            <Link className="btn btn-primary" href="/app">Open the dashboard</Link>
          </div>
        </div>
        <div className="live-grid">
          <div className="live-stat">
            <span className="live-label">Vault balance</span>
            <span className="live-big">{fmt(s.balances[tok] ?? "0", tok)}</span>
            <span className="live-label">{vaultId}</span>
          </div>
          <div className="live-stat">
            <span className="live-label">Payments sent</span>
            <span className="live-big">{paid}</span>
            <span className="live-label">by {s.agents.length} agents</span>
          </div>
          <div className="live-stat">
            <span className="live-label">Stopped by the guard or the owner</span>
            <span className="live-big">{stopped}</span>
            <span className="live-label">{paused.length ? `${paused.join(" and ")} auto paused` : "No agent paused"}</span>
          </div>
        </div>
        <ul className="live-feed">
          {last.map((p) => {
            const st = STATUS[p.status] ?? { label: p.status, tone: "" };
            return (
              <li key={p.id}>
                <span className={`live-chip ${st.tone}`}>{st.label}</span>
                <span className="live-what">
                  <b>{fmt(p.amount, p.token, 3)}</b> to {p.recipient}
                  <span className="live-why">{p.reason}</span>
                </span>
                <span className="live-when">{ago(p.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
