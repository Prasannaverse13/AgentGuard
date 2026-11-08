"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { fmt, primaryToken } from "@/lib/units";
import { shortAddr } from "@/lib/wallet/metamask";
import { ConnectVault } from "./ConnectVault";
import { MetaMaskIcon } from "./MetaMaskIcon";
import { NetworkBar } from "./NetworkBar";
import { Icon } from "./ui";
import { useVault } from "./VaultProvider";

const NAV = [
  { href: "/app", label: "Overview", icon: "home" },
  { href: "/app/approvals", label: "Approvals", icon: "inbox" },
  { href: "/app/activity", label: "Activity", icon: "list" },
  { href: "/app/agents", label: "Agents", icon: "bot" },
  { href: "/app/rules", label: "Rules", icon: "shield" },
  { href: "/app/privacy", label: "Privacy", icon: "eye" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { state, error, call, target, needsVault, wallet, isOwner, connect, disconnect, claim, busy } = useVault();
  const setup = target !== "demo" && !state && (needsVault || Boolean(error));
  const pending = state?.payments.filter((p) => p.status === "NeedsApproval").length ?? 0;

  return (
    <div className="ag">
      <aside className="ag-side">
        <Link href="/" className="ag-brand">
          <Icon name="shield" />
          AgentGuard
        </Link>
        <nav className="ag-nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.href === "/app/approvals" && pending > 0 && <span className="count">{pending}</span>}
            </Link>
          ))}
        </nav>
        <div className="ag-side-foot">
          {wallet ? (
            <>
              <span className="ag-row" style={{ gap: 8 }}>
                <MetaMaskIcon size={18} />
                {shortAddr(wallet)}
              </span>
              <span>{isOwner ? "You are the owner." : state?.ownerEth ? `Owner is ${shortAddr(state.ownerEth)}. Switch account to approve.` : "No owner yet."}</span>
              {!state?.ownerEth && target === "demo" && (
                <button className="ag-btn primary" type="button" disabled={busy} onClick={() => void claim()}>
                  Claim this vault
                </button>
              )}
              <button className="ag-btn" type="button" onClick={() => void disconnect().then(() => router.push("/"))}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <span>Connect MetaMask to approve payments and change rules.</span>
              <button className="ag-btn primary" type="button" onClick={() => void connect()}>
                <MetaMaskIcon size={18} />
                Connect MetaMask
              </button>
            </>
          )}
          {target === "demo" && (
            <button className="ag-btn" type="button" onClick={() => call("/api/reset", {}, "Demo vault reset")}>
              Reset demo
            </button>
          )}
        </div>
      
      </aside>
      <main className="ag-main">
        <NetworkBar />
        {target === "mainnet" && (
          <div className="ag-banner paused">
            <b>Mainnet.</b> Real money moves here. Test the same flow on testnet first.
          </div>
        )}
        {target === "demo" && state && (
          <div className="ag-banner">
            <b>Demo data.</b> This is an offline sample vault. Pick NEAR testnet above to use a deployed vault.
          </div>
        )}
        {state?.paused && (
          <div className="ag-banner paused">
            <b>Vault paused.</b> Every agent payment is refused until you resume it in Rules.
          </div>
        )}
        {state && (
          <div className="ag-row ag-small ag-muted" style={{ justifyContent: "flex-end" }}>
            Vault holds {fmt(state.balances[primaryToken(state)] ?? "0", primaryToken(state))}
          </div>
        )}
        {setup ? <ConnectVault /> : children}
      </main>
    </div>
  );
}
