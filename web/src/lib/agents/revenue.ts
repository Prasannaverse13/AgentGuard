import type { VaultEngine } from "../vault/engine";
import { persist } from "../server/store";

export async function runRevenue(v: VaultEngine, agent: string, token: string, amount: string, reason: string) {
  const ids = await v.distributeRevenue(agent, token, amount, reason);
  persist();
  return ids.map((i) => v.state.payments[i]);
}
