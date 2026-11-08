import { claimMessage } from "@/lib/owner/actions";
import { fail, ok } from "@/lib/server/http";
import { persist, vault } from "@/lib/server/store";
import { routeFor } from "@/lib/server/target";
import { signerOf } from "@/lib/server/verify";
import { VaultError } from "@/lib/vault/engine";

export const dynamic = "force-dynamic";

/** Demo vault only: the first MetaMask account to sign becomes its owner. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { address: string; signature: string; network?: string };
    if (routeFor(b).kind !== "demo") throw new VaultError("A deployed vault sets its owner at deploy time");
    const { address, signature } = b;
    const v = vault();
    if (v.state.ownerEth) throw new VaultError("This demo vault already has an owner. Reset the demo to claim it.");
    const who = await signerOf(claimMessage(v.state.vaultId, address), signature);
    if (!who || who !== address.toLowerCase()) throw new VaultError("Signature does not match this address");
    v.state.ownerEth = who;
    v.state.ownerNonce = 0;
    persist();
    return ok({ state: v.state });
  } catch (e) {
    return fail(e);
  }
}
