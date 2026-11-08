import { NextResponse } from "next/server";
import { PAY_TO, PRICE_WEATHER, payToFor, verifyProof, verifyProofChain } from "@/lib/agents/ops";
import { chainConfig, chainView } from "@/lib/near/chain";
import { vault } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const answer = () => NextResponse.json({ city: "Lisbon", tempC: 17, sky: "clear", at: new Date().toISOString() });

/**
 * A paid API (x402 style). It answers 402 with a price until the caller pays.
 * ?network=testnet or mainnet: paid through the deployed vault on NEAR, checked on chain.
 * Otherwise: paid through the demo vault.
 */
export async function GET(req: Request) {
  const net = new URL(req.url).searchParams.get("network");
  const cfg = chainConfig();
  if (cfg && net === cfg.network) {
    const agents = await chainView<[string, { kind: string; limits: { token: string }[] }][]>("get_agents");
    const token = agents.find(([, a]) => a.kind === "Ops")?.[1].limits[0]?.token;
    if (!token) return NextResponse.json({ error: "The vault has no Ops agent" }, { status: 503 });
    const need = { price: PRICE_WEATHER, token, payTo: payToFor(cfg.network), resource: "/api/paid/weather" };
    if (!(await verifyProofChain(req.headers.get("x-payment"), need))) return NextResponse.json(need, { status: 402 });
    return answer();
  }
  const need = { price: PRICE_WEATHER, token: "usdc.near", payTo: PAY_TO, resource: "/api/paid/weather" };
  if (!verifyProof(vault(), req.headers.get("x-payment"), need)) {
    return NextResponse.json(need, { status: 402 });
  }
  return answer();
}
