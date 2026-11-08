export type AgentKind = "Payables" | "Ops" | "Revenue";

export type PaymentStatus =
  | "AwaitingGuard"
  | "NeedsApproval"
  | "Sending"
  | "Paid"
  | "Blocked"
  | "Rejected"
  | "Dismissed"
  | "Failed";

export type Verdict = "Approve" | "Block" | "Escalate";

/** Amounts are base units as decimal strings so they survive JSON. */
export interface TokenLimit {
  token: string;
  dailyCap: string;
  perTxLimit: string;
  spentToday: string;
  day: number;
}

export interface Agent {
  account: string;
  name: string;
  kind: AgentKind;
  paused: boolean;
  limits: TokenLimit[];
}

export interface SplitRule {
  label: string;
  recipient: string;
  bps: number;
}

export interface Payment {
  id: number;
  agent: string;
  kind: "Payment" | "Split";
  token: string;
  amount: string;
  recipient: string;
  destinationChain: string;
  transferTo: string;
  memo: string;
  reason: string;
  status: PaymentStatus;
  flags: string[];
  riskScore: number | null;
  createdAt: number;
  updatedAt: number;
  /** Who approved so far, when a payment needs two approvers. "owner" or a co-approver id. */
  approvals?: string[];
}

export interface DualRule {
  token: string;
  /** Base units. Payments above this need two different approvers. */
  above: string;
}

export interface Security {
  /** Pause an agent after this many blocked or dismissed payments in a row. 0 is off. */
  autoPauseAfter: number;
  /** Ethereum addresses (0x, lower case) or NEAR accounts that can give a second approval. */
  coApprovers: string[];
  dualRules: DualRule[];
  /** Payee keys ("chain:recipient") whose payouts go through the private route. */
  privatePayees: string[];
  /** Blocked or dismissed payments in a row, per agent account. */
  strikes: Record<string, number>;
}

export const defaultSecurity = (): Security => ({ autoPauseAfter: 3, coApprovers: [], dualRules: [], privatePayees: [], strikes: {} });

export interface PaymentRequest {
  token: string;
  amount: string;
  recipient: string;
  destinationChain: string;
  transferTo: string;
  memo: string;
  reason: string;
}

export interface LimitInput {
  token: string;
  dailyCap: string;
  perTxLimit: string;
}

export interface VaultState {
  /** Account id of the vault ("demo.agentguard" for the demo vault). */
  vaultId: string;
  owner: string;
  /** Ethereum address that acts as owner by signing in MetaMask. Null until set or claimed. */
  ownerEth: string | null;
  ownerNonce: number;
  guard: string;
  paused: boolean;
  newPayeeNeedsApproval: boolean;
  balances: Record<string, string>;
  agents: Agent[];
  knownPayees: string[];
  splits: SplitRule[];
  payments: Payment[];
  /** Missing on vaults deployed before the security upgrade. */
  security?: Security;
}

export interface TokenInfo {
  id: string;
  symbol: string;
  decimals: number;
}

export const TOKENS: TokenInfo[] = [
  { id: "usdc.near", symbol: "USDC", decimals: 6 },
  { id: "near", symbol: "NEAR", decimals: 24 },
];

export const FLAGS = {
  token: "token not allowed",
  agentPaused: "agent paused",
  vaultPaused: "vault paused",
  perTx: "over per payment limit",
  daily: "over daily cap",
  newPayee: "new payee",
  private: "private payout",
  second: "waiting for a second approval",
} as const;

/** The storage surface both the in-browser vault and the NEAR vault satisfy. */
export interface VaultClient {
  mode: "local" | "near";
  getState(): Promise<VaultState>;
  requestPayment(agent: string, req: PaymentRequest): Promise<number>;
  guardVerdict(id: number, verdict: Verdict, riskScore: number, flags: string[]): Promise<void>;
  approvePayment(id: number, trustPayee: boolean): Promise<void>;
  dismissPayment(id: number, note?: string): Promise<void>;
  distributeRevenue(agent: string, token: string, amount: string, reason: string): Promise<number[]>;
  setPaused(paused: boolean): Promise<void>;
  setAgentPaused(agent: string, paused: boolean): Promise<void>;
  setAgentLimits(agent: string, limits: LimitInput[]): Promise<void>;
  setNewPayeeRule(value: boolean): Promise<void>;
  addKnownPayee(chain: string, recipient: string): Promise<void>;
  removeKnownPayee(chain: string, recipient: string): Promise<void>;
  setSplits(splits: SplitRule[]): Promise<void>;
  deposit(token: string, amount: string): Promise<void>;
}
