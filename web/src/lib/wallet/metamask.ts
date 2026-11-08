"use client";

/**
 * Direct MetaMask connection (EIP-1193 provider found through EIP-6963).
 * No third party connector, no popup page. MetaMask is the only thing that sees the key.
 */
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...a: unknown[]) => void): void;
  removeListener?(event: string, cb: (...a: unknown[]) => void): void;
  isMetaMask?: boolean;
}

interface Announced {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
}

let found: Announced | null = null;
const waiters = new Set<(a: Announced) => void>();

function listen() {
  if (typeof window === "undefined" || (window as unknown as { __agMM?: boolean }).__agMM) return;
  (window as unknown as { __agMM?: boolean }).__agMM = true;
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = (e as CustomEvent<Announced>).detail;
    if (d?.info?.rdns === "io.metamask") {
      found = d;
      waiters.forEach((w) => w(d));
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Finds MetaMask. Waits briefly for the extension to announce itself. */
export async function findMetaMask(timeoutMs = 600): Promise<Announced | null> {
  listen();
  if (found) return found;
  const viaEvent = await new Promise<Announced | null>((res) => {
    const t = setTimeout(() => {
      waiters.delete(done);
      res(null);
    }, timeoutMs);
    const done = (a: Announced) => {
      clearTimeout(t);
      waiters.delete(done);
      res(a);
    };
    waiters.add(done);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });
  if (viaEvent) return viaEvent;
  const eth = (window as unknown as { ethereum?: Eip1193 & { providers?: Eip1193[] } }).ethereum;
  const legacy = eth?.providers?.find((p) => p.isMetaMask) ?? (eth?.isMetaMask ? eth : undefined);
  return legacy ? { info: { uuid: "legacy", name: "MetaMask", icon: "", rdns: "io.metamask" }, provider: legacy } : null;
}

export class WalletError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

function explain(e: unknown): WalletError {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return new WalletError("You cancelled the request in MetaMask.", 4001);
  if (err?.code === -32002) return new WalletError("MetaMask already has a request waiting. Click the MetaMask icon in your browser bar and finish or cancel it.", -32002);
  if (err?.code === 4100) return new WalletError("MetaMask is locked or this site is not connected. Unlock MetaMask and try again.", 4100);
  return new WalletError(err?.message ?? "MetaMask request failed", err?.code);
}

async function provider(): Promise<Eip1193> {
  const mm = await findMetaMask();
  if (!mm) throw new WalletError("MetaMask was not found. Install it from metamask.io, then reload this page.");
  return mm.provider;
}

/** Asks MetaMask to connect. Shows the MetaMask popup. */
export async function connect(): Promise<string> {
  const p = await provider();
  try {
    const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts?.[0]) throw new WalletError("MetaMask returned no account.");
    remember(true);
    return accounts[0].toLowerCase();
  } catch (e) {
    throw e instanceof WalletError ? e : explain(e);
  }
}

/** The connected account, without any popup. */
export async function currentAccount(): Promise<string | null> {
  if (!remembered()) return null;
  const mm = await findMetaMask(400);
  if (!mm) return null;
  try {
    const a = (await mm.provider.request({ method: "eth_accounts" })) as string[];
    return a?.[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** personal_sign. MetaMask shows the plain text to the user. */
export async function signText(address: string, text: string): Promise<string> {
  const p = await provider();
  const hex = "0x" + Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
  const sign = () => p.request({ method: "personal_sign", params: [hex, address] }) as Promise<string>;
  try {
    return await sign();
  } catch (e) {
    // 4100: MetaMask auto locked or lost this site. Ask it to unlock and reconnect, then try once more.
    if ((e as { code?: number })?.code === 4100) {
      try {
        const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
        if (!accounts?.some((a) => a.toLowerCase() === address.toLowerCase())) {
          throw new WalletError("Pick the owner account in MetaMask (" + shortAddr(address) + ") and try again.");
        }
        return await sign();
      } catch (e2) {
        throw e2 instanceof WalletError ? e2 : explain(e2);
      }
    }
    throw explain(e);
  }
}

export async function onAccountsChanged(cb: (a: string | null) => void): Promise<() => void> {
  const mm = await findMetaMask(400);
  if (!mm?.provider.on) return () => {};
  const h = (...args: unknown[]) => {
    const a = args[0] as string[];
    cb(a?.[0]?.toLowerCase() ?? null);
  };
  mm.provider.on("accountsChanged", h);
  return () => mm.provider.removeListener?.("accountsChanged", h);
}

/** Forget this site's session. MetaMask itself keeps its own permission list. */
export async function disconnect() {
  remember(false);
  const mm = await findMetaMask(400);
  try {
    await mm?.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    /* older MetaMask has no revoke. The local flag is enough. */
  }
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem("ag.mm", "1");
    else localStorage.removeItem("ag.mm");
  } catch {
    /* private mode */
  }
}
function remembered() {
  try {
    return localStorage.getItem("ag.mm") === "1";
  } catch {
    return false;
  }
}

export interface EvmChain {
  chainId: string;
  name: string;
  rpc: string;
  explorer: string;
}

/**
 * Puts MetaMask on NEAR's EVM network (Aurora) for the chosen NEAR network.
 * Signing owner messages costs no gas, so this is only so the wallet shows a NEAR network.
 * Never throws: a refusal must not block the dashboard.
 */
export async function switchToNear(chain: EvmChain): Promise<boolean> {
  const mm = await findMetaMask(400);
  if (!mm) return false;
  try {
    const now = (await mm.provider.request({ method: "eth_chainId" })) as string;
    if (now?.toLowerCase() === chain.chainId.toLowerCase()) return true;
    try {
      await mm.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
    } catch (e) {
      if ((e as { code?: number })?.code !== 4902) throw e;
      await mm.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain.chainId,
            chainName: chain.name,
            rpcUrls: [chain.rpc],
            blockExplorerUrls: [chain.explorer],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    }
    return true;
  } catch {
    return false;
  }
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
