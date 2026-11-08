/**
 * Deploys the AgentGuard vault to NEAR using Node only (no Rust, no native programs).
 * Needs the wasm from the "Build contract" GitHub Action.
 *
 *   set NEAR_OWNER_ID=you.testnet
 *   set NEAR_OWNER_KEY=ed25519:...        (key of a funded testnet account you own)
 *   set OWNER_ETH=0xYourMetaMaskAddress
 *   npx tsx scripts/deploy.ts path\to\agentguard_vault.wasm
 *
 * It creates the vault, guard, payables, revenue and relayer accounts, deploys and
 * initialises the vault, adds the two agents, and writes web/.env.local for the app.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, teraToGas } from "near-api-js";

const NET = process.env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const RPC = process.env.NEAR_RPC_URL ?? (NET === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};

const ownerId = need("NEAR_OWNER_ID");
const ownerKey = need("NEAR_OWNER_KEY") as `ed25519:${string}`;
const ownerEth = need("OWNER_ETH").toLowerCase();
const token = process.env.TOKEN ?? "usdc.fakes.testnet";
const wasmPath = process.argv[2];
if (!wasmPath || !existsSync(wasmPath)) throw new Error("Pass the path to agentguard_vault.wasm");
if (NET === "mainnet" && process.env.CONFIRM_MAINNET !== "yes") throw new Error("Mainnet moves real money. Set CONFIRM_MAINNET=yes if you mean it.");

const provider = new JsonRpcProvider({ url: RPC });
const owner = new Account(ownerId, provider, KeyPairSigner.fromSecretKey(ownerKey));
const id = (name: string) => `${name}.${ownerId}`;
const keys: Record<string, { id: string; key: string }> = {};

async function make(name: string, deposit: bigint) {
  const kp = KeyPair.fromRandom("ed25519");
  const accountId = id(name);
  await owner.createSubAccount({ accountOrPrefix: name, publicKey: kp.getPublicKey(), nearToTransfer: deposit });
  keys[name] = { id: accountId, key: kp.toString() };
  console.log("created", accountId);
  return accountId;
}
const near = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;

const vault = await make("agentguard", near(6));
const guard = await make("guard", near(1));
const payables = await make("payables", near(1));
const revenue = await make("revenue", near(1));
await make("relayer", near(2));

const vaultAcc = new Account(vault, provider, KeyPairSigner.fromSecretKey(keys.agentguard.key as `ed25519:${string}`));
await vaultAcc.deployContract(readFileSync(wasmPath));
console.log("deployed wasm");
await vaultAcc.callFunction({ contractId: vault, methodName: "new", args: { owner: ownerId, guard, owner_eth: ownerEth }, gas: teraToGas("30"), deposit: 0n });
console.log("vault initialised");

const limits = [{ token, daily_cap: "3500000000", per_tx_limit: "1000000000" }];
for (const [account, name] of [
  [payables, "Payables"],
  [revenue, "Revenue"],
] as const) {
  await owner.callFunction({ contractId: vault, methodName: "add_agent", args: { account, name, kind: name, limits }, gas: teraToGas("30"), deposit: 0n });
  console.log("agent added", name);
}

const env = [
  "",
  `NEAR_NETWORK=${NET}`,
  `NEAR_VAULT_ID=${vault}`,
  `NEAR_OWNER_ID=${ownerId}`,
  `NEAR_PAYABLES_ID=${keys.payables.id}`,
  `NEAR_PAYABLES_KEY=${keys.payables.key}`,
  `NEAR_REVENUE_ID=${keys.revenue.id}`,
  `NEAR_REVENUE_KEY=${keys.revenue.key}`,
  `NEAR_GUARD_ID=${keys.guard.id}`,
  `NEAR_GUARD_KEY=${keys.guard.key}`,
  `NEAR_RELAYER_ID=${keys.relayer.id}`,
  `NEAR_RELAYER_KEY=${keys.relayer.key}`,
  "",
].join("\n");
appendFileSync(".env.local", env);
console.log(`\nDone. Vault ${vault}. Keys were written to web/.env.local (never commit that file). Restart npm run dev.`);
