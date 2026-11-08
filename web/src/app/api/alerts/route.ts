import { alertChannels, sendAlert } from "@/lib/server/alerts";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Which alert channels this server has. No secrets are returned. */
export async function GET() {
  return ok({ channels: alertChannels() });
}

let last = 0;
/** Sends one test alert. Limited to one every 10 seconds. */
export async function POST() {
  try {
    if (!Object.values(alertChannels()).some(Boolean)) throw new Error("No alert channel is set. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or ALERT_WEBHOOK_URL, or RESEND_API_KEY and ALERT_EMAIL_TO) to web/.env and restart.");
    if (Date.now() - last < 10_000) throw new Error("Wait a few seconds before the next test.");
    last = Date.now();
    const r = await sendAlert("AgentGuard test alert. Alerts reach you here when a payment waits for you, a payment is blocked or an agent is paused.");
    if (!r.sent) throw new Error(`Alert failed: ${r.failed.join("; ")}`);
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}
