"use client";

import { useState } from "react";
import { NETWORKS } from "@/lib/near/network";
import { Card } from "./ui";
import { useVault } from "./VaultProvider";

/** Shown when the chosen NEAR network has no vault yet, or the account typed is not a vault. */
export function ConnectVault() {
  const { target, setVaultId, setTarget, error, loading } = useVault();
  const [id, setId] = useState("");
  if (target === "demo") return null;
  const net = NETWORKS[target];
  const suffix = target === "testnet" ? "testnet" : "near";

  return (
    <div className="ag-stack" style={{ maxWidth: 720 }}>
      <div className="ag-top">
        <div>
          <h1>Connect your vault</h1>
          <p>Your vault is a contract on {net.label}. Tell the app which account it lives on.</p>
        </div>
      </div>
      {error && <div className="ag-banner paused">{error}</div>}
      <Card title="Vault account" sub={`The account you deployed to, like agentguard.you.${suffix}.`}>
        <form
          className="ag-row ag-gap8 ag-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setVaultId(id.trim().toLowerCase() || null);
          }}
        >
          <input className="ag-in" style={{ flex: "1 1 260px" }} value={id} onChange={(e) => setId(e.target.value)} aria-label="Vault account" placeholder={`agentguard.you.${suffix}`} autoComplete="off" spellCheck={false} />
          <button className="ag-btn primary" type="submit" disabled={!id.trim() || loading}>
            Connect vault
          </button>
        </form>
      </Card>
      <Card title="No vault yet?" sub="Deploy one in three steps. The README has the full commands.">
        <ol className="ag-steps">
          <li>Build the contract with <code>cargo near build</code>.</li>
          <li>Run <code>scripts/deploy-testnet.sh</code> with your MetaMask address as <code>OWNER_ETH</code>.</li>
          <li>Come back here and enter the vault account.</li>
        </ol>
        <div className="ag-row ag-gap8" style={{ marginTop: 16 }}>
          <button className="ag-btn" type="button" onClick={() => setTarget("demo")}>
            Look around with demo data
          </button>
        </div>
      </Card>
    </div>
  );
}
