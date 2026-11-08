import { DEFAULT_TARGET, isAccountId, isTarget, resolve } from "@/lib/near/network";
import { readVault } from "@/lib/near/rpc";
import { auditVault } from "@/lib/privacy/audit";
import { fail, ok } from "@/lib/server/http";
import { vault } from "@/lib/server/store";
import { VaultError } from "@/lib/vault/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/privacy { network, vault, useModel }
 * Runs the privacy audit on the public record of a vault. Read only: it never changes the vault.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { network?: string; vault?: string; useModel?: boolean };
    const t = isTarget(b.network) ? b.network : DEFAULT_TARGET;
    if (t === "demo") return ok({ audit: await auditVault(vault().state, "demo", { useModel: b.useModel }) });
    if (b.vault && !isAccountId(b.vault)) throw new VaultError("That is not a NEAR account id");
    const r = resolve(t, b.vault);
    if (!r.vault) throw new VaultError("Pick a vault first");
    return ok({ audit: await auditVault(await readVault(r.rpc, r.vault), t, { useModel: b.useModel }) });
  } catch (e) {
    return fail(e);
  }
}
