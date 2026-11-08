import { checkPayment } from "../guard/scam";
import type { VaultEngine } from "../vault/engine";
import type { Payment, PaymentRequest } from "../vault/types";
import { lookupIntel } from "./intel";
import { persist } from "./store";

/** One payment, start to finish: the vault rules, then the scam check, then the verdict. */
export async function submitPayment(v: VaultEngine, agent: string, req: PaymentRequest): Promise<Payment> {
  const id = v.requestPayment(agent, req);
  const p = v.state.payments[id];
  if (p.status === "AwaitingGuard") {
    const history = v.state.payments
      .filter((x) => x.token === req.token && x.status === "Paid" && x.kind === "Payment" && x.agent === agent)
      .map((x) => BigInt(x.amount));
    const intel = await lookupIntel(req.recipient);
    const res = checkPayment(p, { knownPayees: v.state.knownPayees, history, intel });
    await v.guardVerdict(id, res.verdict, res.riskScore, res.flags);
  } else if (p.status === "NeedsApproval") {
    // Already waiting for the owner. Still give the owner the guard's view.
    const intel = await lookupIntel(req.recipient);
    const res = checkPayment(p, { knownPayees: v.state.knownPayees, history: [], intel });
    await v.guardVerdict(id, res.verdict === "Block" ? "Block" : "Escalate", res.riskScore, res.flags);
  }
  persist();
  return v.state.payments[id];
}
