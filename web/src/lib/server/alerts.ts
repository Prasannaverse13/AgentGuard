import { fmt } from "../units";
import type { VaultState } from "../vault/types";

/**
 * Alerts to the owner. Any of these work, all optional:
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   message from your Telegram bot
 *   ALERT_WEBHOOK_URL                       POST {text, content} (Slack and Discord webhooks accept this)
 *   RESEND_API_KEY + ALERT_EMAIL_TO         email through Resend (ALERT_EMAIL_FROM optional)
 */
export function alertChannels(env: Record<string, string | undefined> = process.env) {
  return {
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    webhook: Boolean(env.ALERT_WEBHOOK_URL),
    email: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_TO),
  };
}

export async function sendAlert(text: string, env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch) {
  const on = alertChannels(env);
  const jobs: Promise<unknown>[] = [];
  const post = (url: string, body: object, headers: Record<string, string> = {}) =>
    f(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => {
      if (!r.ok) throw new Error(`${url.split("/")[2]} said ${r.status}`);
    });
  if (on.telegram) jobs.push(post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: env.TELEGRAM_CHAT_ID, text }));
  if (on.webhook) jobs.push(post(env.ALERT_WEBHOOK_URL!, { text, content: text }));
  if (on.email) {
    jobs.push(
      post(
        "https://api.resend.com/emails",
        { from: env.ALERT_EMAIL_FROM ?? "AgentGuard <onboarding@resend.dev>", to: env.ALERT_EMAIL_TO, subject: text.split("\n")[0].slice(0, 120), text },
        { authorization: `Bearer ${env.RESEND_API_KEY}` },
      ),
    );
  }
  const res = await Promise.allSettled(jobs);
  return { sent: res.filter((r) => r.status === "fulfilled").length, failed: res.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason)) };
}

/** What changed between two snapshots that the owner should hear about. */
export function changesWorthAlerting(before: VaultState | null, after: VaultState, appUrl = ""): string[] {
  const out: string[] = [];
  const was = new Map((before?.payments ?? []).map((p) => [p.id, p.status]));
  for (const p of after.payments) {
    if (was.get(p.id) === p.status) continue;
    const who = after.agents.find((a) => a.account === p.agent)?.name ?? p.agent;
    const what = `${fmt(p.amount, p.token)} to ${p.recipient}`;
    if (p.status === "NeedsApproval") out.push(`AgentGuard: ${who} wants to pay ${what}. It is waiting for you.\nWhy held: ${p.flags.join(", ") || "guard asked you"}\nAgent's reason: ${p.reason}${appUrl ? `\nReview: ${appUrl}/app/approvals` : ""}`);
    if (p.status === "Blocked") out.push(`AgentGuard blocked a payment: ${who} tried to pay ${what}.\nFlags: ${p.flags.join(", ")}`);
  }
  const pausedBefore = new Set((before?.agents ?? []).filter((a) => a.paused).map((a) => a.account));
  for (const a of after.agents) {
    if (a.paused && !pausedBefore.has(a.account) && before) {
      const n = after.security?.strikes[a.account];
      out.push(`AgentGuard paused ${a.name}${n ? ` after ${n} stopped payments in a row` : ""}. Nothing it asks for will be paid until you resume it.`);
    }
  }
  return out;
}

/** Sends alerts for what changed. Never throws: an alert failing must not fail the payment. */
export async function alertChanges(before: VaultState | null, after: VaultState, appUrl = "") {
  try {
    if (!Object.values(alertChannels()).some(Boolean)) return;
    for (const text of changesWorthAlerting(before, after, appUrl)) await sendAlert(text);
  } catch {
    /* alerts are best effort */
  }
}
