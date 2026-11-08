import { fail, ok } from "@/lib/server/http";
import { resetVault } from "@/lib/server/store";
import { routeFor } from "@/lib/server/target";
import { VaultError } from "@/lib/vault/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { network?: string };
    if (routeFor(b).kind !== "demo") throw new VaultError("A deployed vault cannot be reset");
    return ok({ state: resetVault().state });
  } catch (e) {
    return fail(e);
  }
}
