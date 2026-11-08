import { chainConfig } from "../near/chain";
import { DEFAULT_TARGET, NETWORKS, isTarget, resolve } from "../near/network";
import { VaultError } from "../vault/engine";

export type Route = { kind: "demo" } | { kind: "chain"; cfg: NonNullable<ReturnType<typeof chainConfig>> };

/**
 * Decides where a write goes. The browser says which network it is looking at.
 * Demo writes stay in the demo vault. Chain writes only go to the vault this server has keys for.
 */
export function routeFor(body: { network?: unknown; vault?: unknown } | null | undefined): Route {
  const t = isTarget(body?.network) ? body.network : DEFAULT_TARGET;
  if (t === "demo") return { kind: "demo" };
  const r = resolve(t, typeof body?.vault === "string" ? body.vault : null);
  const cfg = chainConfig();
  const label = NETWORKS[t].label;
  if (!r.vault) throw new VaultError(`No vault is set for ${label}. Add the vault account in the app first.`);
  if (!r.writable || !cfg) {
    throw new VaultError(`This server cannot send transactions to ${r.vault} on ${label}. Set NEAR_NETWORK=${t} and NEAR_VAULT_ID=${r.vault} with the relayer and agent keys in web/.env, then restart.`);
  }
  return { kind: "chain", cfg };
}
