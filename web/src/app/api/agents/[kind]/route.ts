import { fail, ok } from "@/lib/server/http";
import { runAgent } from "@/lib/server/run";
import { routeFor } from "@/lib/server/target";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await ctx.params;
    const b = (await req.json()) as Record<string, string>;
    return ok(await runAgent(kind, b, routeFor(b), new URL(req.url).origin));
  } catch (e) {
    return fail(e);
  }
}
