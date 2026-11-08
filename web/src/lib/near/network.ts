/**
 * Which NEAR network the vault lives on. Testnet is the default.
 * "demo" is an offline sample vault and only used when the person picks it.
 */
export type NetworkId = "testnet" | "mainnet";
export type Target = NetworkId | "demo";

export interface Network {
  id: NetworkId;
  label: string;
  /** Public RPC used for reads when no override is set. */
  rpc: string;
  explorer: string;
  /** Aurora is NEAR's EVM network. MetaMask is pointed at it so the wallet sits on a NEAR network. */
  evm: {
    chainId: string;
    name: string;
    rpc: string;
    explorer: string;
  };
}

export const NETWORKS: Record<NetworkId, Network> = {
  testnet: {
    id: "testnet",
    label: "NEAR testnet",
    rpc: "https://test.rpc.fastnear.com",
    explorer: "https://testnet.nearblocks.io",
    evm: { chainId: "0x4e454153", name: "Aurora Testnet (NEAR EVM)", rpc: "https://testnet.aurora.dev", explorer: "https://explorer.testnet.aurora.dev" },
  },
  mainnet: {
    id: "mainnet",
    label: "NEAR mainnet",
    rpc: "https://free.rpc.fastnear.com",
    explorer: "https://nearblocks.io",
    evm: { chainId: "0x4e454152", name: "Aurora Mainnet (NEAR EVM)", rpc: "https://mainnet.aurora.dev", explorer: "https://explorer.aurora.dev" },
  },
};

export const DEFAULT_TARGET: Target = "testnet";

export const isTarget = (v: unknown): v is Target => v === "testnet" || v === "mainnet" || v === "demo";

/** A NEAR account id: 2 to 64 chars, lowercase letters, digits, - _ and dot separators. */
export const isAccountId = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 2 && v.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v);

type Env = Record<string, string | undefined>;

/** The network this server signs for. Set NEAR_NETWORK=mainnet to change it. */
export function serverNetwork(env: Env = process.env): NetworkId {
  return env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

/** RPC for a network. NEAR_<NET>_RPC_URL wins, then NEAR_RPC_URL for the server network, then the public one. */
export function rpcFor(net: NetworkId, env: Env = process.env): string {
  const own = env[`NEAR_${net.toUpperCase()}_RPC_URL`];
  if (own) return own;
  if (env.NEAR_RPC_URL && serverNetwork(env) === net) return env.NEAR_RPC_URL;
  return NETWORKS[net].rpc;
}

/** Vault set in env for a network, if any. */
export function vaultFor(net: NetworkId, env: Env = process.env): string | null {
  const own = env[`NEAR_${net.toUpperCase()}_VAULT_ID`];
  if (own) return own;
  if (env.NEAR_VAULT_ID && serverNetwork(env) === net) return env.NEAR_VAULT_ID;
  return null;
}

export interface Resolved {
  network: NetworkId;
  rpc: string;
  vault: string | null;
  /** True when this server holds the relayer and agent keys for this exact vault. */
  writable: boolean;
}

/**
 * Turns what the browser asked for into a network, RPC and vault.
 * A vault typed in the browser is allowed for reads. Writes only work for the vault in server env.
 */
export function resolve(net: NetworkId, requestedVault: string | null | undefined, env: Env = process.env): Resolved {
  const configured = vaultFor(net, env);
  const asked = requestedVault && isAccountId(requestedVault) ? requestedVault : null;
  const vault = asked ?? configured;
  const writable = Boolean(vault && configured && vault === configured && serverNetwork(env) === net);
  return { network: net, rpc: rpcFor(net, env), vault, writable };
}

export const explorerAddress = (net: NetworkId, id: string) => `${NETWORKS[net].explorer}/address/${id}`;
export const explorerTx = (net: NetworkId, hash: string) => `${NETWORKS[net].explorer}/txns/${hash}`;
