import { chainOwnerExecute } from "@/lib/near/chain";
import { readVault } from "@/lib/near/rpc";
import { ownerMessage, type OwnerAction } from "@/lib/owner/actions";
import { fail, ok } from "@/lib/server/http";
import { persist, vault } from "@/lib/server/store";
import { routeFor } from "@/lib/server/target";
import { signerOf } from "@/lib/server/verify";
import { VaultError } from "@/lib/vault/engine";

export const dynamic = "force-dynamic";

/** An owner action signed in MetaMask. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { action: string; signature: string; network?: string; vault?: string };
    const { action, signature } = b;
    if (typeof action !== "string" || action.length > 4000) throw new VaultError("Bad action");

    const route = routeFor(b);
    if (route.kind === "chain") {
      // The contract checks the signature itself. We only relay.
      await chainOwnerExecute(action, signature);
      return ok({ state: await readVault(route.cfg.rpc, route.cfg.vault) });
    }

    const v = vault();
    if (!v.state.ownerEth) throw new VaultError("This vault has no MetaMask owner yet. Claim it first.");
    const who = await signerOf(ownerMessage(v.state.vaultId, v.state.ownerNonce, action), signature);
    const isOwner = who !== null && who === v.state.ownerEth;
    const isCo = who !== null && (v.state.security?.coApprovers ?? []).includes(who);
    if (!isOwner && !isCo) throw new VaultError("Signature is not from the owner");
    const parsed = JSON.parse(action) as OwnerAction;
    v.state.ownerNonce += 1;
    await v.applyOwner(parsed, isOwner ? "owner" : (who as string));
    persist();
    return ok({ state: v.state });
  } catch (e) {
    return fail(e);
  }
}
