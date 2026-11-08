import { NETWORKS, DEFAULT_TARGET, isAccountId, isTarget, resolve } from "@/lib/near/network";
import { readVault } from "@/lib/near/rpc";
import { fail, ok } from "@/lib/server/http";
import { persist, vault } from "@/lib/server/store";
import { routeFor } from "@/lib/server/target";
import { VaultError } from "@/lib/vault/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/vault?network=testnet|mainnet|demo&vault=<account>
 * Testnet is the default. A vault account typed in the browser is read only unless this server holds its keys.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const n = q.get("network");
  const t = isTarget(n) ? n : DEFAULT_TARGET;
  if (t === "demo") return ok({ mode: "demo", network: "demo", state: vault().state, writable: true });

  const asked = q.get("vault");
  if (asked && !isAccountId(asked)) return fail(new VaultError("That is not a NEAR account id"));
  const r = resolve(t, asked);
  if (!r.vault) return ok({ mode: "near", network: t, state: null, vault: null, writable: false });
  try {
    return ok({ mode: "near", network: t, vault: r.vault, state: await readVault(r.rpc, r.vault), writable: r.writable });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|UnknownAccount|CodeDoesNotExist|no contract/i.test(msg)) {
      return fail(new VaultError(`${r.vault} is not a deployed AgentGuard vault on ${NETWORKS[t].label}`));
    }
    return fail(e);
  }
}

/** Demo only: add test funds. Every owner rule change goes through /api/owner with a signature. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { action: string; token: string; amount: string; network?: string };
    const route = routeFor(b);
    if (route.kind !== "demo") throw new VaultError("Fund a deployed vault by sending it tokens");
    if (b.action !== "deposit") throw new VaultError("Owner changes need a MetaMask signature");
    const v = vault();
    v.deposit(b.token, b.amount);
    persist();
    return ok({ state: v.state });
  } catch (e) {
    return fail(e);
  }
}
