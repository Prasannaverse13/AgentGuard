"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MetaMaskIcon } from "@/components/app/MetaMaskIcon";
import { DEFAULT_TARGET, NETWORKS, isTarget } from "@/lib/near/network";
import { connect, switchToNear } from "@/lib/wallet/metamask";

/** Connects MetaMask directly, then opens the dashboard. */
export function ConnectWallet({ className, label }: { className: string; label: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <button
        type="button"
        className={className}
        disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            await connect();
            // Put MetaMask on NEAR's EVM network for the chosen NEAR network (testnet unless changed).
            let t = DEFAULT_TARGET as string;
            try {
              t = localStorage.getItem("ag.net") ?? t;
            } catch {
              /* private mode */
            }
            if (isTarget(t) && t !== "demo") await switchToNear(NETWORKS[t].evm);
            router.push("/app");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not connect");
          } finally {
            setBusy(false);
          }
        }}
      >
        <MetaMaskIcon size={22} />
        {busy ? "Check MetaMask" : label}
      </button>
      {err && (
        <span role="alert" style={{ color: "var(--color-loss)", fontSize: 14, maxWidth: 360 }}>
          {err}
        </span>
      )}
    </span>
  );
}
