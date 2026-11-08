import { VaultEngine } from "../vault/engine";
import type { VaultState } from "../vault/types";
import { fmt } from "../units";
import { explain } from "./llm";
import { parseInvoice } from "./invoice";
import { routePayout } from "./intents";
import { submitPayment } from "../server/pipeline";
import { redact } from "../privacy/redact";

export async function runPayables(v: VaultEngine, agent: string, invoiceText: string) {
  const inv = parseInvoice(invoiceText);
  const route = await routePayout({
    token: inv.token,
    amount: inv.amount,
    chain: inv.chain,
    recipient: inv.recipient,
    refundTo: v.state.owner,
    private: v.state.security?.privatePayees.includes(VaultEngine.payeeKey(inv.chain, inv.recipient)),
  });
  const plain = `Pay ${inv.number ? "invoice " + inv.number : "an invoice"}${inv.payee ? " from " + inv.payee : ""}${inv.due ? ", due " + inv.due : ""}.`;
  const reason = await explain(
    `Invoice ${inv.number ?? ""} from ${inv.payee ?? "a vendor"} for ${fmt(inv.amount, inv.token)}. ${inv.note}`,
    plain,
  );
  const payment = await submitPayment(v, agent, {
    token: inv.token,
    amount: inv.amount,
    recipient: inv.recipient,
    destinationChain: inv.chain,
    transferTo: route.transferTo,
    // The record is public. Mask personal data before it is written.
    memo: redact(inv.number ?? inv.note.slice(0, 60)).text,
    reason: redact(reason).text,
  });
  return { payment, parsed: inv, route };
}

/** Same as runPayables, but the payment goes to the deployed NEAR vault. */
export async function runPayablesChain(invoiceText: string, before?: VaultState) {
  const vaultToken = before?.agents.find((a) => a.kind === "Payables")?.limits[0]?.token;
  const { chainPayment } = await import("../near/chain");
  const owner = process.env.NEAR_OWNER_ID ?? "";
  const inv = parseInvoice(invoiceText);
  // On testnet the USDC contract is not usdc.near. Use the token this vault actually allows.
  if (vaultToken && inv.token === "usdc.near") inv.token = vaultToken;
  const { chainConfig } = await import("../near/chain");
  const route = await routePayout({
    token: inv.token,
    amount: inv.amount,
    chain: inv.chain,
    recipient: inv.recipient,
    refundTo: owner,
    private: before?.security?.privatePayees.includes(VaultEngine.payeeKey(inv.chain, inv.recipient)),
    network: chainConfig()?.network,
  });
  const reason = await explain(`Invoice ${inv.number ?? ""} from ${inv.payee ?? "a vendor"}. ${inv.note}`, `Pay ${inv.number ? "invoice " + inv.number : "an invoice"}${inv.payee ? " from " + inv.payee : ""}.`);
  const payment = await chainPayment("PAYABLES", {
    token: inv.token,
    amount: inv.amount,
    recipient: inv.recipient,
    destinationChain: inv.chain,
    transferTo: route.transferTo,
    // The record is public. Mask personal data before it is written.
    memo: redact(inv.number ?? inv.note.slice(0, 60)).text,
    reason: redact(reason).text,
  });
  return { payment, parsed: inv, route };
}
