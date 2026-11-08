/* eslint-disable @typescript-eslint/no-explicit-any */
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { checkPayment } from "../guard/scam";
import { lookupIntel } from "../server/intel";
import type { Payment, PaymentRequest } from "../vault/types";
import { rpcFor, serverNetwork, vaultFor } from "./network";
import { readVault, view } from "./rpc";

/**
 * Server side calls to a deployed vault. Agent and guard keys come from env.
 * NOT TESTED against a live node from this build environment. Typechecked only.
 */
export const chainConfig = () => {
  const network = serverNetwork();
  const vault = vaultFor(network);
  return vault ? { network, rpc: rpcFor(network), vault } : null;
};

type Role = "PAYABLES" | "OPS" | "REVENUE" | "GUARD" | "RELAYER";

function account(role: Role): Account {
  const cfg = chainConfig();
  const id = process.env[`NEAR_${role}_ID`];
  const key = process.env[`NEAR_${role}_KEY`];
  if (!cfg || !id || !key) throw new Error(`Set NEAR_${role}_ID and NEAR_${role}_KEY`);
  return new Account(id, new JsonRpcProvider({ url: cfg.rpc }), KeyPairSigner.fromSecretKey(key as `ed25519:${string}`));
}

async function call<T = unknown>(role: Role, method: string, args: object): Promise<T> {
  const cfg = chainConfig()!;
  return account(role).callFunction<any>({
    contractId: cfg.vault,
    methodName: method,
    args,
    gas: 100_000_000_000_000n,
    deposit: 0n,
  }) as Promise<T>;
}

export async function chainPayment(role: "PAYABLES" | "OPS", req: PaymentRequest): Promise<Payment> {
  const cfg = chainConfig()!;
  const id = await call<number>(role, "request_payment", {
    token: req.token,
    amount: req.amount,
    recipient: req.recipient,
    destination_chain: req.destinationChain,
    transfer_to: req.transferTo,
    memo: req.memo,
    reason: req.reason,
  });
  const state = await readVault(cfg.rpc, cfg.vault);
  const p = state.payments[id];
  if (p.status === "AwaitingGuard" || p.status === "NeedsApproval") {
    const history = state.payments
      .filter((x) => x.token === req.token && x.status === "Paid" && x.kind === "Payment" && x.agent === p.agent)
      .map((x) => BigInt(x.amount));
    const res = checkPayment(p, { knownPayees: state.knownPayees, history, intel: await lookupIntel(req.recipient) });
    const verdict = p.status === "NeedsApproval" && res.verdict === "Approve" ? "Escalate" : res.verdict;
    await call("GUARD", "guard_verdict", { id, verdict, risk_score: res.riskScore, flags: res.flags });
  }
  return (await readVault(cfg.rpc, cfg.vault)).payments[id];
}

export async function chainRevenue(token: string, amount: string, reason: string): Promise<number[]> {
  return call<number[]>("REVENUE", "distribute_revenue", { token, amount, reason });
}

export const chainView = <T,>(method: string, args: object = {}) => {
  const cfg = chainConfig()!;
  return view<T>(cfg.rpc, cfg.vault, method, args);
};

/** Submits an owner action signed in MetaMask. The relayer only pays gas; the contract checks the signature. */
export async function chainOwnerExecute(action: string, signature: string): Promise<void> {
  await call("RELAYER", "owner_execute", { action, signature });
}
