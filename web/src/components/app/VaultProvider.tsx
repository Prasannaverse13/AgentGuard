"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TARGET, NETWORKS, isAccountId, isTarget, type Target } from "@/lib/near/network";
import { CO_APPROVER_METHODS, claimMessage, describe, ownerMessage, toOwnerAction } from "@/lib/owner/actions";
import type { VaultState } from "@/lib/vault/types";
import * as mm from "@/lib/wallet/metamask";

interface Ctx {
  state: VaultState | null;
  mode: "demo" | "near";
  /** NEAR testnet by default. The person can switch to mainnet or the offline demo. */
  target: Target;
  setTarget: (t: Target) => void;
  /** Vault account for the chosen network (typed in the app or set on the server). */
  vaultId: string | null;
  setVaultId: (id: string | null) => void;
  /** True when this server can send transactions for this vault. */
  writable: boolean;
  /** True while there is no vault for this network yet. */
  needsVault: boolean;
  loading: boolean;
  wallet: string | null;
  /** True when the connected MetaMask account is the vault owner. */
  isOwner: boolean;
  /** The connected wallet may give the second approval. */
  isCoApprover: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  claim: () => Promise<void>;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  /** POST to the API. Owner actions are signed in MetaMask first. */
  call: <T = unknown>(url: string, body: unknown, okMessage?: string | ((r: T) => string)) => Promise<T | null>;
  toast: (msg: string, err?: boolean) => void;
}

const VaultCtx = createContext<Ctx | null>(null);
export const useVault = () => {
  const c = useContext(VaultCtx);
  if (!c) throw new Error("useVault outside provider");
  return c;
};

const stored = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const store = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Server said ${r.status}`);
  return j;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VaultState | null>(null);
  const [mode, setMode] = useState<"demo" | "near">("near");
  const [target, setTargetState] = useState<Target>(DEFAULT_TARGET);
  const [vaultId, setVaultState] = useState<string | null>(null);
  const [writable, setWritable] = useState(false);
  const [needsVault, setNeedsVault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const seq = useRef(0);
  const ctxRef = useRef({ target, vaultId });
  ctxRef.current = { target, vaultId };
  const walletRef = useRef<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<VaultState | null>(null);
  stateRef.current = state;

  const toast = useCallback((text: string, err = false) => {
    setMsg({ text, err });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), err ? 7000 : 4000);
  }, []);

  // Restore the last network and vault from this browser. Testnet unless the person chose otherwise.
  useEffect(() => {
    const t = stored("ag.net");
    const next = isTarget(t) ? t : DEFAULT_TARGET;
    setTargetState(next);
    setVaultState(next === "demo" ? null : stored(`ag.vault.${next}`));
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    const { target: t, vaultId: v } = ctxRef.current;
    const mine = ++seq.current;
    try {
      const qs = new URLSearchParams({ network: t });
      if (v) qs.set("vault", v);
      const r = await fetch(`/api/vault?${qs}`, { cache: "no-store" });
      const j = (await r.json()) as { state?: VaultState | null; mode?: "demo" | "near"; writable?: boolean; vault?: string | null; error?: string };
      if (mine !== seq.current) return; // a newer request took over
      if (!r.ok) throw new Error(j.error ?? `Server said ${r.status}`);
      setState(j.state ?? null);
      setMode(j.mode ?? "near");
      setWritable(Boolean(j.writable));
      setNeedsVault(!j.state && !j.vault);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setState(null);
      setNeedsVault(false);
      setError(e instanceof Error ? e.message : "Cannot reach the vault");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => clearInterval(t);
  }, [ready, target, vaultId, refresh]);

  const setTarget = useCallback((t: Target) => {
    store("ag.net", t);
    setState(null);
    setError(null);
    setNeedsVault(false);
    setTargetState(t);
    setVaultState(t === "demo" ? null : stored(`ag.vault.${t}`));
    if (t !== "demo" && walletRef.current) void mm.switchToNear(NETWORKS[t].evm);
  }, []);

  const setVaultId = useCallback((id: string | null) => {
    const { target: t } = ctxRef.current;
    if (t === "demo") return;
    if (id && !isAccountId(id)) {
      toast("That is not a NEAR account id. Example: agentguard.you.testnet", true);
      return;
    }
    store(`ag.vault.${t}`, id);
    setState(null);
    setError(null);
    setVaultState(id);
  }, [toast]);

  // Restore the MetaMask session without a popup, and follow account switches.
  useEffect(() => {
    let off = () => {};
    void mm.currentAccount().then(setWallet);
    void mm.onAccountsChanged(setWallet).then((f) => (off = f));
    return () => off();
  }, []);

  const connect = useCallback(async () => {
    try {
      setWallet(await mm.connect());
      const t = ctxRef.current.target;
      if (t !== "demo") await mm.switchToNear(NETWORKS[t].evm);
    } catch (e) {
      toast(e instanceof Error ? e.message : "MetaMask failed", true);
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    await mm.disconnect();
    setWallet(null);
  }, []);

  const claim = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    setBusy(true);
    try {
      const addr = wallet ?? (await mm.connect());
      setWallet(addr);
      const signature = await mm.signText(addr, claimMessage(s.vaultId, addr));
      const j = await post<{ state: VaultState }>("/api/owner/claim", { address: addr, signature, network: "demo" });
      setState(j.state);
      toast("You own this demo vault now. Your MetaMask signs every owner action.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Claim failed", true);
    } finally {
      setBusy(false);
    }
  }, [wallet, toast]);

  const call = useCallback<Ctx["call"]>(
    async (url, body, okMessage) => {
      setBusy(true);
      try {
        const action = toOwnerAction(url, body as Record<string, unknown>);
        let j: unknown;
        if (action) {
          const s = stateRef.current;
          if (!s) throw new Error("Vault not loaded");
          if (!ctxRef.current.vaultId && ctxRef.current.target !== "demo" && !s.vaultId) throw new Error("No vault selected");
          if (!writable) throw new Error("This server has no keys for this vault, so it is read only. Set the relayer and agent keys in web/.env.");
          if (!s.ownerEth) throw new Error(ctxRef.current.target === "demo" ? "Claim the vault with MetaMask first (left menu)." : "This vault has no MetaMask owner set. Deploy it with OWNER_ETH.");
          const addr = wallet ?? (await mm.connect());
          setWallet(addr);
          const co = (s.security?.coApprovers ?? []).includes(addr);
          if (addr !== s.ownerEth && !co) throw new Error(`Switch MetaMask to the owner account ${mm.shortAddr(s.ownerEth)}.`);
          if (addr !== s.ownerEth && !(CO_APPROVER_METHODS as readonly string[]).includes(action.method)) {
            throw new Error("A co-approver can only approve or dismiss payments. Switch MetaMask to the owner account to change rules.");
          }
          const text = JSON.stringify(action);
          toast(`Sign in MetaMask: ${describe(action)}`);
          const signature = await mm.signText(addr, ownerMessage(s.vaultId, s.ownerNonce, text));
          j = await post("/api/owner", { action: text, signature, network: ctxRef.current.target, vault: ctxRef.current.vaultId ?? s.vaultId });
        } else {
          j = await post(url, { ...(body as object), network: ctxRef.current.target, vault: ctxRef.current.vaultId ?? stateRef.current?.vaultId });
        }
        const st = (j as { state?: VaultState }).state;
        if (st) setState(st);
        if (okMessage) toast(typeof okMessage === "function" ? okMessage(j as never) : okMessage);
        return j as never;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Request failed", true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast, wallet, writable],
  );

  const isOwner = Boolean(wallet && state?.ownerEth && wallet === state.ownerEth);
  const isCoApprover = Boolean(wallet && state?.security?.coApprovers.includes(wallet));
  const value = useMemo(
    () => ({ state, mode, target, setTarget, vaultId: vaultId ?? state?.vaultId ?? null, setVaultId, writable, needsVault, loading, wallet, isOwner, isCoApprover, connect, disconnect, claim, error, busy, refresh, call, toast }),
    [state, mode, target, setTarget, vaultId, setVaultId, writable, needsVault, loading, wallet, isOwner, isCoApprover, connect, disconnect, claim, error, busy, refresh, call, toast],
  );
  return (
    <VaultCtx.Provider value={value}>
      {children}
      {msg && (
        <div className={`ag-toast ${msg.err ? "err" : ""}`} role="status" aria-live="polite">
          {msg.text}
        </div>
      )}
    </VaultCtx.Provider>
  );
}
