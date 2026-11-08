"use client";

import { useState } from "react";
import { NETWORKS, explorerAddress, type Target } from "@/lib/near/network";
import { useVault } from "./VaultProvider";

const TABS: { id: Target; label: string }[] = [
  { id: "testnet", label: "NEAR testnet" },
  { id: "mainnet", label: "NEAR mainnet" },
  { id: "demo", label: "Demo" },
];

/** Always visible: which network the vault is on, which vault, and whether this server can write to it. */
export function NetworkBar() {
  const { target, setTarget, vaultId, setVaultId, writable, state } = useVault();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="ag-netbar">
      <div className="ag-tabs" role="group" aria-label="Network" style={{ margin: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className="ag-tab" aria-pressed={target === t.id} onClick={() => setTarget(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {target !== "demo" && vaultId && !editing && (
        <div className="ag-row ag-gap8 ag-wrap ag-small">
          <a className="ag-vaultlink" href={explorerAddress(target, vaultId)} target="_blank" rel="noreferrer">
            {vaultId}
          </a>
          {state && <span className={`ag-chip ${writable ? "paid" : ""}`}>{writable ? "Live" : "Read only"}</span>}
          <button
            type="button"
            className="ag-btn"
            style={{ padding: "4px 12px", fontSize: 13 }}
            onClick={() => {
              setDraft(vaultId);
              setEditing(true);
            }}
          >
            Change vault
          </button>
        </div>
      )}
      {target !== "demo" && editing && (
        <form
          className="ag-row ag-gap8 ag-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setVaultId(draft.trim().toLowerCase() || null);
            setEditing(false);
          }}
        >
          <input className="ag-in" style={{ width: 280 }} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Vault account" placeholder={`agentguard.you.${target === "testnet" ? "testnet" : "near"}`} />
          <button className="ag-btn primary" type="submit">
            Use this vault
          </button>
          <button className="ag-btn" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      )}
      {target === "demo" && <span className="ag-small ag-muted">Offline sample vault. Nothing here is on {NETWORKS.testnet.label}.</span>}
    </div>
  );
}
