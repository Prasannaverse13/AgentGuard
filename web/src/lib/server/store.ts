import fs from "node:fs";
import path from "node:path";
import { VaultEngine } from "../vault/engine";
import type { Payment, VaultState } from "../vault/types";

const FILE = process.env.VAULT_DATA_FILE ?? path.join(process.cwd(), ".data", "vault.json");
const USDC = "usdc.near";
const u = (n: number) => String(Math.round(n * 1_000_000));

export const DEMO = {
  owner: "owner.demo.near",
  guard: "guard.demo.near",
  payables: "payables.demo.near",
  ops: "ops.demo.near",
  revenue: "revenue.demo.near",
};

export function seedState(): VaultState {
  const e = new VaultEngine(VaultEngine.empty(DEMO.owner, DEMO.guard), { now: () => Date.now() });
  e.deposit(USDC, u(12_480));
  e.addAgent(DEMO.payables, "Payables", "Payables", [{ token: USDC, dailyCap: u(3_500), perTxLimit: u(1_000) }]);
  e.addAgent(DEMO.ops, "Ops", "Ops", [{ token: USDC, dailyCap: u(20), perTxLimit: u(0.5) }]);
  e.addAgent(DEMO.revenue, "Revenue", "Revenue", [{ token: USDC, dailyCap: u(10_000), perTxLimit: u(5_000) }]);
  for (const p of ["lumen.near", "kite-labs.near", "cloudhost.near", "api.weather.near"]) e.addKnownPayee("near", p);
  e.setSplits([
    { label: "Savings", recipient: "savings.demo.near", bps: 4000 },
    { label: "Tax", recipient: "tax.demo.near", bps: 2500 },
    { label: "Team", recipient: "team.demo.near", bps: 3500 },
  ]);
  return e.state;
}

type G = typeof globalThis & { __vault?: VaultEngine; __usedProofs?: Set<number> };
const g = globalThis as G;

function load(): VaultState {
  try {
    const s = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ FILE, "utf8")) as Partial<VaultState>;
    if (!s.agents) throw new Error("old file");
    return { ...seedState(), ...s, vaultId: s.vaultId ?? "demo.agentguard", ownerEth: s.ownerEth ?? null, ownerNonce: s.ownerNonce ?? 0 } as VaultState;
  } catch {
    return seedState();
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(/*turbopackIgnore: true*/ FILE, JSON.stringify(g.__vault!.state));
    } catch {
      /* read only disk: state stays in memory */
    }
  }, 150);
}

/** Demo transfer. In a NEAR deployment this is the ft_transfer receipt. */
const demoSend = (_p: Payment) => true;

export function vault(): VaultEngine {
  if (!g.__vault) g.__vault = new VaultEngine(load(), { onSend: demoSend });
  return g.__vault;
}

export function resetVault() {
  g.__vault = new VaultEngine(seedState(), { onSend: demoSend });
  g.__usedProofs = new Set();
  persist();
  return g.__vault;
}

export function usedProofs() {
  return (g.__usedProofs ??= new Set());
}
