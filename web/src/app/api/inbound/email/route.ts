import { timingSafeEqual } from "node:crypto";
import { fail, ok } from "@/lib/server/http";
import { runAgent } from "@/lib/server/run";
import { routeFor } from "@/lib/server/target";
import { serverNetwork, vaultFor } from "@/lib/near/network";

export const dynamic = "force-dynamic";

/**
 * Invoice by email. Point your inbound email provider (Postmark, SendGrid Inbound Parse,
 * Mailgun routes, a Cloudflare Email Worker, Zapier) at
 *   POST /api/inbound/email?key=INBOUND_EMAIL_SECRET
 * JSON or form posts both work. The Payables agent reads the email like a pasted invoice.
 * Every rule still applies: limits, new payee hold, the guard and your approval.
 * INBOUND_EMAIL_FROM (comma separated) limits which senders are read.
 */
const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
  return "";
};

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  try {
    const secret = process.env.INBOUND_EMAIL_SECRET;
    if (!secret) return Response.json({ error: "Invoice by email is off. Set INBOUND_EMAIL_SECRET in web/.env." }, { status: 503 });
    const url = new URL(req.url);
    const given = url.searchParams.get("key") ?? req.headers.get("x-inbound-secret") ?? "";
    if (!same(given, secret)) return Response.json({ error: "Wrong key" }, { status: 401 });

    const type = req.headers.get("content-type") ?? "";
    const body: Record<string, unknown> = type.includes("application/json")
      ? ((await req.json()) as Record<string, unknown>)
      : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

    const from = pick(body, ["from", "From", "sender", "envelope_from"]).toLowerCase();
    const subject = pick(body, ["subject", "Subject"]);
    const text = pick(body, ["text", "TextBody", "body-plain", "plain", "body", "stripped-text"]);
    if (!text && !subject) throw new Error("The email has no text");

    const allowed = (process.env.INBOUND_EMAIL_FROM ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.some((a) => from.includes(a))) return Response.json({ error: "Sender is not on the allowed list" }, { status: 403 });

    // Goes to the deployed vault when this server has one, otherwise to the demo vault.
    const net = serverNetwork();
    const target = { network: vaultFor(net) ? net : "demo" };
    const invoice = `${subject}\n${text}`.slice(0, 4000);
    const r = (await runAgent("payables", { invoice, reason: `Invoice emailed by ${from || "unknown sender"}` }, routeFor(target), url.origin)) as {
      payment?: { id: number; status: string; flags: string[] };
    };
    return ok({ read: true, from, payment: r.payment ? { id: r.payment.id, status: r.payment.status, flags: r.payment.flags } : null });
  } catch (e) {
    return fail(e);
  }
}

/** Whether invoice by email is on. The secret itself is never returned. */
export async function GET() {
  const allowed = (process.env.INBOUND_EMAIL_FROM ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Response.json({ enabled: Boolean(process.env.INBOUND_EMAIL_SECRET), allowedSenders: allowed });
}
