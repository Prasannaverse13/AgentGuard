import type { PayeeIntel } from "../guard/scam";

/**
 * Demo payee intelligence. In the demo vault these addresses are known to be new or listed,
 * so the scam check has something to find. A production deployment replaces this with a
 * chain indexer lookup and a maintained scam list.
 */
const DEMO: Record<string, PayeeIntel> = {
  "fresh-payments.near": { accountAgeDays: 1 },
  "urgent-invoice.near": { accountAgeDays: 0 },
  "lurnen.near": { accountAgeDays: 2 },
  "drainer-9x.near": { listedAsScam: true },
  "lumen.near": { accountAgeDays: 912 },
  "kite-labs.near": { accountAgeDays: 540 },
  "api.weather.near": { accountAgeDays: 700 },
  "cloudhost.near": { accountAgeDays: 1400 },
};

export async function lookupIntel(recipient: string): Promise<PayeeIntel> {
  return DEMO[recipient.toLowerCase()] ?? {};
}
