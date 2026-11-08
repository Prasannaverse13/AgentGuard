//! AgentGuard vault.
//!
//! One vault holds a business's funds on NEAR. AI agents (each one a NEAR account)
//! ask the vault to pay. The vault enforces the owner's rules on chain:
//!
//! * which tokens an agent may spend, with a daily cap and a per payment limit
//! * whether a first time payee needs a human to say yes
//! * a guard account (the scam check service) must clear every payment
//! * anything over a limit waits in a queue for the owner to approve or dismiss
//! * every payment keeps its status, flags and the agent's reason as an audit record
//!
//! Money only leaves through `execute`. Agents never hold keys to the funds.

use near_sdk::json_types::U128;
use std::cell::{Cell, RefCell};
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, IterableSet, LookupMap, Vector};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

const NS_PER_DAY: u64 = 86_400_000_000_000;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const NATIVE: &str = "near";
const MAX_TEXT: usize = 500;
const MAX_ID: usize = 128;
const MAX_LIMITS: usize = 16;
const MAX_SPLITS: usize = 12;
const PAGE_MAX: u32 = 100;

pub const FLAG_TOKEN: &str = "token not allowed";
pub const FLAG_PAUSED_AGENT: &str = "agent paused";
pub const FLAG_PAUSED_VAULT: &str = "vault paused";
pub const FLAG_PER_TX: &str = "over per payment limit";
pub const FLAG_DAILY: &str = "over daily cap";
pub const FLAG_NEW_PAYEE: &str = "new payee";
pub const FLAG_PRIVATE: &str = "private payout";
pub const FLAG_SECOND: &str = "waiting for a second approval";
const MAX_CO_APPROVERS: usize = 5;

thread_local! {
    /// True only while `owner_execute` runs an action the owner signed with their Ethereum key.
    static ETH_OWNER_OK: Cell<bool> = const { Cell::new(false) };
    /// Set while `owner_execute` runs an approval signed by a co-approver's Ethereum key.
    static ETH_CO_SIGNER: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// An owner action, signed in MetaMask and checked on chain with ecrecover.
#[near(serializers = [json])]
#[serde(tag = "method", content = "args", rename_all = "snake_case")]
#[derive(Clone, Debug)]
pub enum OwnerAction {
    ApprovePayment { id: u32, trust_payee: bool },
    DismissPayment { id: u32, note: Option<String> },
    SetPaused { paused: bool },
    SetAgentPaused { account: AccountId, paused: bool },
    SetAgentLimits { account: AccountId, limits: Vec<LimitInput> },
    SetNewPayeeNeedsApproval { value: bool },
    AddKnownPayee { destination_chain: String, recipient: String },
    RemoveKnownPayee { destination_chain: String, recipient: String },
    SetSplits { splits: Vec<SplitRule> },
    SetCoApprovers { approvers: Vec<String> },
    SetDualRules { rules: Vec<DualRule> },
    SetAutoPauseAfter { count: u8 },
    SetPayeePrivate { destination_chain: String, recipient: String, private: bool },
}

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AgentKind {
    /// Pays invoices and payroll.
    Payables,
    /// Pays for APIs and data, a little at a time.
    Ops,
    /// Splits incoming revenue by the owner's rules.
    Revenue,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PaymentStatus {
    /// Inside every rule. Waiting for the guard to clear it.
    AwaitingGuard,
    /// Over a limit, a new payee or escalated by the guard. Waiting for the owner.
    NeedsApproval,
    /// Cleared and the transfer is in flight.
    Sending,
    Paid,
    /// The guard refused it.
    Blocked,
    /// A hard rule failed (token not allowed, agent or vault paused).
    Rejected,
    /// The owner said no.
    Dismissed,
    /// The transfer failed. The budget was given back.
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PaymentKind {
    Payment,
    Split,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Verdict {
    Approve,
    Block,
    Escalate,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct TokenLimit {
    /// "near" for native NEAR or a NEP-141 token contract id.
    pub token: String,
    pub daily_cap: U128,
    pub per_tx_limit: U128,
    pub spent_today: U128,
    /// Day index (block time / 24h) that `spent_today` belongs to.
    pub day: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LimitInput {
    pub token: String,
    pub daily_cap: U128,
    pub per_tx_limit: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Agent {
    pub name: String,
    pub kind: AgentKind,
    pub paused: bool,
    pub limits: Vec<TokenLimit>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SplitRule {
    pub label: String,
    pub recipient: AccountId,
    /// Basis points. All rules together must add up to 10000.
    pub bps: u16,
}

/// Payments of `token` above `above` need two different approvers.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct DualRule {
    pub token: String,
    pub above: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SecurityConfig {
    /// An agent is paused after this many blocked or dismissed payments in a row. 0 means off.
    pub auto_pause_after: u8,
    /// Ethereum addresses (0x) or NEAR accounts that can give the second approval.
    pub co_approvers: Vec<String>,
    pub dual_rules: Vec<DualRule>,
    pub private_payees: Vec<String>,
    /// Blocked or dismissed payments in a row, per agent.
    pub strikes: Vec<(AccountId, u8)>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Payment {
    pub id: u32,
    pub agent: AccountId,
    pub kind: PaymentKind,
    pub token: String,
    pub amount: U128,
    /// Who is finally paid. Can be an address on another chain.
    pub recipient: String,
    pub destination_chain: String,
    /// The NEAR account that gets the tokens now. Same as the recipient on NEAR,
    /// or a NEAR Intents deposit address for a cross chain payout.
    pub transfer_to: AccountId,
    pub memo: String,
    /// Why the agent wants to pay. Part of the audit record.
    pub reason: String,
    pub status: PaymentStatus,
    pub flags: Vec<String>,
    pub risk_score: Option<u8>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct VaultConfig {
    pub owner: AccountId,
    pub guard: AccountId,
    pub paused: bool,
    pub new_payee_needs_approval: bool,
    pub payments_count: u32,
    pub owner_eth: Option<String>,
    pub owner_nonce: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    guard: AccountId,
    paused: bool,
    new_payee_needs_approval: bool,
    agents: IterableMap<AccountId, Agent>,
    known_payees: IterableSet<String>,
    splits: Vec<SplitRule>,
    payments: Vector<Payment>,
    /// Ethereum address (0x, lower case) that may act as owner by signing in MetaMask.
    owner_eth: Option<String>,
    owner_nonce: u64,
    co_approvers: Vec<String>,
    dual_rules: Vec<DualRule>,
    auto_pause_after: u8,
    strikes: IterableMap<AccountId, u8>,
    approvals: LookupMap<u32, Vec<String>>,
    private_payees: IterableSet<String>,
}

/// The first released state layout. Only used by `migrate`.
#[near(serializers = [borsh])]
pub struct VaultV1 {
    owner: AccountId,
    guard: AccountId,
    paused: bool,
    new_payee_needs_approval: bool,
    agents: IterableMap<AccountId, Agent>,
    known_payees: IterableSet<String>,
    splits: Vec<SplitRule>,
    payments: Vector<Payment>,
    owner_eth: Option<String>,
    owner_nonce: u64,
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner: AccountId, guard: AccountId, owner_eth: Option<String>) -> Self {
        Self {
            owner,
            guard,
            paused: false,
            new_payee_needs_approval: true,
            agents: IterableMap::new(b"a"),
            known_payees: IterableSet::new(b"k"),
            splits: Vec::new(),
            payments: Vector::new(b"p"),
            owner_eth: owner_eth.map(|a| Self::check_eth(&a)),
            owner_nonce: 0,
            co_approvers: Vec::new(),
            dual_rules: Vec::new(),
            auto_pause_after: 3,
            strikes: IterableMap::new(b"s"),
            approvals: LookupMap::new(b"v"),
            private_payees: IterableSet::new(b"x"),
        }
    }

    /// Upgrade from the first layout. Keeps funds, agents, rules and every payment.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: VaultV1 = env::state_read().unwrap_or_else(|| env::panic_str("No old state to migrate"));
        Self {
            owner: old.owner,
            guard: old.guard,
            paused: old.paused,
            new_payee_needs_approval: old.new_payee_needs_approval,
            agents: old.agents,
            known_payees: old.known_payees,
            splits: old.splits,
            payments: old.payments,
            owner_eth: old.owner_eth,
            owner_nonce: old.owner_nonce,
            co_approvers: Vec::new(),
            dual_rules: Vec::new(),
            auto_pause_after: 3,
            strikes: IterableMap::new(b"s"),
            approvals: LookupMap::new(b"v"),
            private_payees: IterableSet::new(b"x"),
        }
    }

    // ---------------------------------------------------------------- funding

    /// Fund the vault with NEAR. Plain transfers work too.
    #[payable]
    pub fn deposit(&mut self) {
        self.emit(
            "deposit",
            json!({ "from": env::predecessor_account_id(), "token": NATIVE, "amount": env::attached_deposit().as_yoctonear().to_string() }),
        );
    }

    /// NEP-141 receiver. The vault takes any token. The owner decides what agents may spend.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        #[allow(unused_variables)] msg: String,
    ) -> PromiseOrValue<U128> {
        self.emit(
            "deposit",
            json!({ "from": sender_id, "token": env::predecessor_account_id(), "amount": amount.0.to_string() }),
        );
        PromiseOrValue::Value(U128(0))
    }

    // ------------------------------------------------------------ owner rules

    pub fn set_guard(&mut self, guard: AccountId) {
        self.assert_owner();
        self.guard = guard.clone();
        self.emit("guard_set", json!({ "guard": guard }));
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
        self.emit("vault_paused", json!({ "paused": paused }));
    }

    pub fn set_new_payee_needs_approval(&mut self, value: bool) {
        self.assert_owner();
        self.new_payee_needs_approval = value;
        self.emit("new_payee_rule", json!({ "needs_approval": value }));
    }

    pub fn add_agent(
        &mut self,
        account: AccountId,
        name: String,
        kind: AgentKind,
        limits: Vec<LimitInput>,
    ) {
        self.assert_owner();
        require!(account != self.owner, "The owner cannot be an agent");
        require!(!name.is_empty() && name.len() <= 64, "Name must be 1 to 64 characters");
        require!(self.agents.get(&account).is_none(), "Agent already exists");
        let agent = Agent {
            name: name.clone(),
            kind,
            paused: false,
            limits: Self::build_limits(limits),
        };
        self.agents.insert(account.clone(), agent);
        self.emit("agent_added", json!({ "agent": account, "name": name }));
    }

    pub fn remove_agent(&mut self, account: AccountId) {
        self.assert_owner();
        require!(self.agents.remove(&account).is_some(), "No such agent");
        self.emit("agent_removed", json!({ "agent": account }));
    }

    pub fn set_agent_paused(&mut self, account: AccountId, paused: bool) {
        self.assert_owner();
        let agent = self.agents.get_mut(&account).unwrap_or_else(|| env::panic_str("No such agent"));
        agent.paused = paused;
        self.emit("agent_paused", json!({ "agent": account, "paused": paused }));
    }

    /// Replace an agent's limits. Today's spending is kept for tokens that stay.
    pub fn set_agent_limits(&mut self, account: AccountId, limits: Vec<LimitInput>) {
        self.assert_owner();
        let mut fresh = Self::build_limits(limits);
        let agent = self.agents.get_mut(&account).unwrap_or_else(|| env::panic_str("No such agent"));
        for l in fresh.iter_mut() {
            if let Some(old) = agent.limits.iter().find(|o| o.token == l.token) {
                l.spent_today = old.spent_today;
                l.day = old.day;
            }
        }
        agent.limits = fresh;
        self.emit("agent_limits", json!({ "agent": account }));
    }

    pub fn add_known_payee(&mut self, destination_chain: String, recipient: String) {
        self.assert_owner();
        Self::check_text(&destination_chain, 32, "chain");
        Self::check_text(&recipient, MAX_ID, "recipient");
        let key = Self::payee_key(&destination_chain, &recipient);
        self.known_payees.insert(key.clone());
        self.emit("payee_added", json!({ "payee": key }));
    }

    pub fn remove_known_payee(&mut self, destination_chain: String, recipient: String) {
        self.assert_owner();
        let key = Self::payee_key(&destination_chain, &recipient);
        self.known_payees.remove(&key);
        self.emit("payee_removed", json!({ "payee": key }));
    }

    /// Set how revenue is split. The rules must add up to exactly 10000 basis points.
    pub fn set_splits(&mut self, splits: Vec<SplitRule>) {
        self.assert_owner();
        require!(splits.len() <= MAX_SPLITS, "Too many split rules");
        if !splits.is_empty() {
            let total: u32 = splits.iter().map(|s| s.bps as u32).sum();
            require!(total == 10_000, "Split rules must add up to 10000 basis points");
            for s in &splits {
                Self::check_text(&s.label, 64, "label");
                require!(s.bps > 0, "A split rule needs more than 0 basis points");
            }
        }
        self.splits = splits;
        self.emit("splits_set", json!({ "count": self.splits.len() }));
    }

    /// Who may give the second approval: Ethereum addresses (0x) or NEAR accounts. Up to 5.
    pub fn set_co_approvers(&mut self, approvers: Vec<String>) {
        self.assert_owner();
        require!(approvers.len() <= MAX_CO_APPROVERS, "Up to 5 co-approvers");
        let mut out: Vec<String> = Vec::new();
        for a in approvers {
            let a = if a.starts_with("0x") || a.starts_with("0X") {
                Self::check_eth(&a)
            } else {
                a.parse::<AccountId>().unwrap_or_else(|_| env::panic_str("Bad co-approver")).to_string()
            };
            require!(a != self.owner.as_str() && Some(&a) != self.owner_eth.as_ref(), "The owner is already an approver");
            if !out.contains(&a) {
                out.push(a);
            }
        }
        self.co_approvers = out;
        self.emit("co_approvers_set", json!({ "count": self.co_approvers.len() }));
    }

    /// Payments above these amounts need two different approvers (the owner and a co-approver,
    /// or two co-approvers).
    pub fn set_dual_rules(&mut self, rules: Vec<DualRule>) {
        self.assert_owner();
        require!(rules.len() <= MAX_LIMITS, "Too many rules");
        for r in &rules {
            Self::check_text(&r.token, MAX_ID, "token");
        }
        self.dual_rules = rules;
        self.emit("dual_rules_set", json!({ "count": self.dual_rules.len() }));
    }

    /// Pause an agent after this many blocked or dismissed payments in a row. 0 turns it off.
    pub fn set_auto_pause_after(&mut self, count: u8) {
        self.assert_owner();
        require!(count <= 20, "Use 0 to 20");
        self.auto_pause_after = count;
        self.emit("auto_pause_set", json!({ "after": count }));
    }

    /// Mark a payee as private. Its payouts are flagged so the payout service routes them
    /// through NEAR confidential intents where the network supports it.
    pub fn set_payee_private(&mut self, destination_chain: String, recipient: String, private: bool) {
        self.assert_owner();
        Self::check_text(&destination_chain, 32, "chain");
        Self::check_text(&recipient, MAX_ID, "recipient");
        let key = Self::payee_key(&destination_chain, &recipient);
        if private {
            self.private_payees.insert(key.clone());
        } else {
            self.private_payees.remove(&key);
        }
        self.emit("payee_private", json!({ "payee": key, "private": private }));
    }

    /// The owner or a co-approver approves. Above a dual rule it takes two different people.
    pub fn approve_payment(&mut self, id: u32, trust_payee: bool) -> PromiseOrValue<()> {
        let (who, is_owner) = self.approver();
        require!(!self.paused, "Vault is paused");
        let status = self.payment(id).status.clone();
        require!(status == PaymentStatus::NeedsApproval, "Payment is not waiting for approval");
        if self.needs_two(id) {
            let mut list = self.approvals.get(&id).cloned().unwrap_or_default();
            if !list.contains(&who) {
                list.push(who.clone());
            }
            let n = list.len();
            self.approvals.insert(id, list);
            if n < 2 {
                let now = env::block_timestamp();
                let p = self.payment_mut(id);
                if !p.flags.iter().any(|f| f == FLAG_SECOND) {
                    p.flags.push(FLAG_SECOND.to_string());
                }
                p.updated_at = now;
                self.emit("approval_recorded", json!({ "id": id, "by": who, "approvals": n }));
                return PromiseOrValue::Value(());
            }
        }
        if trust_payee && is_owner {
            let key = {
                let p = self.payment(id);
                Self::payee_key(&p.destination_chain, &p.recipient)
            };
            self.known_payees.insert(key);
        }
        self.emit("payment_approved", json!({ "id": id, "by": who }));
        PromiseOrValue::Promise(self.execute(id))
    }

    /// The owner or any co-approver can stop a payment alone.
    pub fn dismiss_payment(&mut self, id: u32, note: Option<String>) {
        let _ = self.approver();
        let now = env::block_timestamp();
        let p = self.payment_mut(id);
        require!(
            p.status == PaymentStatus::NeedsApproval || p.status == PaymentStatus::AwaitingGuard,
            "Payment cannot be dismissed now"
        );
        p.status = PaymentStatus::Dismissed;
        p.updated_at = now;
        if let Some(n) = note {
            Self::check_text(&n, MAX_TEXT, "note");
            p.flags.push(format!("owner note: {n}"));
        }
        let (agent, kind) = (p.agent.clone(), p.kind.clone());
        self.emit("payment_dismissed", json!({ "id": id }));
        if kind == PaymentKind::Payment {
            self.strike(&agent);
        }
    }

    pub fn withdraw(&mut self, token: String, amount: U128, to: AccountId) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0, "Amount must be more than 0");
        self.emit("withdraw", json!({ "token": token, "amount": amount.0.to_string(), "to": to }));
        self.send(&token, to, amount, None)
    }

    /// The NEAR owner can set or clear the Ethereum address that may act as owner.
    pub fn set_owner_eth(&mut self, address: Option<String>) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can do this");
        self.owner_eth = address.map(|a| Self::check_eth(&a));
        self.emit("owner_eth_set", json!({ "address": self.owner_eth }));
    }

    /// The exact text the owner signs in MetaMask (personal_sign).
    pub fn owner_message(&self, action: String) -> String {
        Self::message_for(&env::current_account_id(), self.owner_nonce, &action)
    }

    /// Run an action the owner signed in MetaMask. Anyone can submit it (a relayer pays gas),
    /// but only a valid signature from `owner_eth` over this vault and the current nonce works.
    pub fn owner_execute(&mut self, action: String, signature: String) -> PromiseOrValue<()> {
        let owner_eth = self.owner_eth.clone().unwrap_or_else(|| env::panic_str("No Ethereum owner is set"));
        require!(action.len() <= 4_000, "Action is too long");
        let msg = Self::message_for(&env::current_account_id(), self.owner_nonce, &action);
        let signer = Self::recover_eth(&msg, &signature).unwrap_or_else(|| env::panic_str("Bad signature"));
        let is_owner = signer == owner_eth;
        require!(is_owner || self.co_approvers.contains(&signer), "Signature is not from the owner");
        let parsed: OwnerAction =
            near_sdk::serde_json::from_str(&action).unwrap_or_else(|_| env::panic_str("Bad action"));
        if !is_owner {
            require!(
                matches!(parsed, OwnerAction::ApprovePayment { .. } | OwnerAction::DismissPayment { .. }),
                "A co-approver can only approve or dismiss"
            );
        }
        self.owner_nonce += 1;
        self.emit("owner_signed", json!({ "by": signer, "nonce": self.owner_nonce - 1 }));
        if is_owner {
            ETH_OWNER_OK.with(|c| c.set(true));
        } else {
            ETH_CO_SIGNER.with(|c| *c.borrow_mut() = Some(signer.clone()));
        }
        let out = match parsed {
            OwnerAction::ApprovePayment { id, trust_payee } => self.approve_payment(id, trust_payee),
            OwnerAction::DismissPayment { id, note } => {
                self.dismiss_payment(id, note);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetPaused { paused } => {
                self.set_paused(paused);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetAgentPaused { account, paused } => {
                self.set_agent_paused(account, paused);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetAgentLimits { account, limits } => {
                self.set_agent_limits(account, limits);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetNewPayeeNeedsApproval { value } => {
                self.set_new_payee_needs_approval(value);
                PromiseOrValue::Value(())
            }
            OwnerAction::AddKnownPayee { destination_chain, recipient } => {
                self.add_known_payee(destination_chain, recipient);
                PromiseOrValue::Value(())
            }
            OwnerAction::RemoveKnownPayee { destination_chain, recipient } => {
                self.remove_known_payee(destination_chain, recipient);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetSplits { splits } => {
                self.set_splits(splits);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetCoApprovers { approvers } => {
                self.set_co_approvers(approvers);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetDualRules { rules } => {
                self.set_dual_rules(rules);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetAutoPauseAfter { count } => {
                self.set_auto_pause_after(count);
                PromiseOrValue::Value(())
            }
            OwnerAction::SetPayeePrivate { destination_chain, recipient, private } => {
                self.set_payee_private(destination_chain, recipient, private);
                PromiseOrValue::Value(())
            }
        };
        ETH_OWNER_OK.with(|c| c.set(false));
        ETH_CO_SIGNER.with(|c| *c.borrow_mut() = None);
        out
    }

    // ------------------------------------------------------------- guard

    /// Called by the scam check service once it has looked at a payment.
    pub fn guard_verdict(
        &mut self,
        id: u32,
        verdict: Verdict,
        risk_score: u8,
        flags: Vec<String>,
    ) -> PromiseOrValue<()> {
        require!(env::predecessor_account_id() == self.guard, "Only the guard can give a verdict");
        require!(risk_score <= 100, "Risk score is 0 to 100");
        require!(flags.len() <= 8, "Too many flags");
        for f in &flags {
            Self::check_text(f, 160, "flag");
        }
        let now = env::block_timestamp();
        let status = self.payment(id).status.clone();
        require!(
            status == PaymentStatus::AwaitingGuard || status == PaymentStatus::NeedsApproval,
            "Payment is not waiting for the guard"
        );
        {
            let p = self.payment_mut(id);
            p.risk_score = Some(risk_score);
            p.updated_at = now;
            for f in flags {
                if !p.flags.contains(&f) {
                    p.flags.push(f);
                }
            }
        }
        self.emit("guard_verdict", json!({ "id": id, "verdict": verdict, "risk": risk_score }));
        match verdict {
            Verdict::Block => {
                let agent = {
                    let p = self.payment_mut(id);
                    p.status = PaymentStatus::Blocked;
                    p.agent.clone()
                };
                self.strike(&agent);
                PromiseOrValue::Value(())
            }
            Verdict::Escalate => {
                self.payment_mut(id).status = PaymentStatus::NeedsApproval;
                PromiseOrValue::Value(())
            }
            Verdict::Approve => {
                if status == PaymentStatus::AwaitingGuard {
                    require!(!self.paused, "Vault is paused");
                    PromiseOrValue::Promise(self.execute(id))
                } else {
                    // Already waiting for the owner. The score is recorded for their review.
                    PromiseOrValue::Value(())
                }
            }
        }
    }

    // ------------------------------------------------------------ agents

    /// An agent asks to pay. Returns the payment id. Rule failures are recorded, not reverted,
    /// so the audit record keeps every attempt.
    pub fn request_payment(
        &mut self,
        token: String,
        amount: U128,
        recipient: String,
        destination_chain: String,
        transfer_to: AccountId,
        memo: String,
        reason: String,
    ) -> u32 {
        let agent_id = env::predecessor_account_id();
        let (kind, name_paused) = {
            let a = self.agents.get(&agent_id).unwrap_or_else(|| env::panic_str("Caller is not an agent"));
            (a.kind.clone(), a.paused)
        };
        require!(kind != AgentKind::Revenue, "Revenue agents use distribute_revenue");
        require!(amount.0 > 0, "Amount must be more than 0");
        Self::check_text(&recipient, MAX_ID, "recipient");
        Self::check_text(&destination_chain, 32, "chain");
        Self::check_text(&token, MAX_ID, "token");
        require!(memo.len() <= MAX_TEXT && reason.len() <= MAX_TEXT, "Memo or reason is too long");
        require!(!reason.trim().is_empty(), "Every payment needs a reason");

        let today = Self::today();
        let known = self.known_payees.contains(&Self::payee_key(&destination_chain, &recipient));
        let needs_new_payee_ok = self.new_payee_needs_approval;
        let vault_paused = self.paused;

        let mut hard: Vec<String> = Vec::new();
        let mut soft: Vec<String> = Vec::new();
        if vault_paused {
            hard.push(FLAG_PAUSED_VAULT.to_string());
        }
        if name_paused {
            hard.push(FLAG_PAUSED_AGENT.to_string());
        }
        {
            let agent = self.agents.get_mut(&agent_id).unwrap();
            match agent.limits.iter_mut().find(|l| l.token == token) {
                None => hard.push(FLAG_TOKEN.to_string()),
                Some(l) => {
                    Self::roll(l, today);
                    if amount.0 > l.per_tx_limit.0 {
                        soft.push(FLAG_PER_TX.to_string());
                    }
                    if l.spent_today.0.saturating_add(amount.0) > l.daily_cap.0 {
                        soft.push(FLAG_DAILY.to_string());
                    }
                }
            }
        }
        if needs_new_payee_ok && !known {
            soft.push(FLAG_NEW_PAYEE.to_string());
        }

        let private = self.private_payees.contains(&Self::payee_key(&destination_chain, &recipient));
        let (status, mut flags) = if !hard.is_empty() {
            (PaymentStatus::Rejected, hard)
        } else if !soft.is_empty() {
            (PaymentStatus::NeedsApproval, soft)
        } else {
            (PaymentStatus::AwaitingGuard, Vec::new())
        };
        if private {
            flags.push(FLAG_PRIVATE.to_string());
        }

        let now = env::block_timestamp();
        let id = self.payments.len();
        self.payments.push(Payment {
            id,
            agent: agent_id.clone(),
            kind: PaymentKind::Payment,
            token,
            amount,
            recipient,
            destination_chain,
            transfer_to,
            memo,
            reason,
            status: status.clone(),
            flags,
            risk_score: None,
            created_at: now,
            updated_at: now,
        });
        self.emit("payment_requested", json!({ "id": id, "agent": agent_id, "status": status }));
        id
    }

    /// The revenue agent splits money the vault received, using the owner's split rules.
    /// It cannot choose recipients. It can only choose how much to split, inside its limits.
    pub fn distribute_revenue(&mut self, token: String, amount: U128, reason: String) -> Vec<u32> {
        let agent_id = env::predecessor_account_id();
        require!(!self.paused, "Vault is paused");
        let (kind, paused) = {
            let a = self.agents.get(&agent_id).unwrap_or_else(|| env::panic_str("Caller is not an agent"));
            (a.kind.clone(), a.paused)
        };
        require!(kind == AgentKind::Revenue, "Only a revenue agent can split revenue");
        require!(!paused, "Agent is paused");
        require!(amount.0 > 0, "Amount must be more than 0");
        require!(!self.splits.is_empty(), "No split rules are set");
        require!(!reason.trim().is_empty() && reason.len() <= MAX_TEXT, "Every split needs a reason");

        let today = Self::today();
        {
            let agent = self.agents.get_mut(&agent_id).unwrap();
            let l = agent
                .limits
                .iter_mut()
                .find(|l| l.token == token)
                .unwrap_or_else(|| env::panic_str("Token not allowed for this agent"));
            Self::roll(l, today);
            require!(amount.0 <= l.per_tx_limit.0, "Over the per payment limit");
            require!(l.spent_today.0.saturating_add(amount.0) <= l.daily_cap.0, "Over the daily cap");
        }

        let rules = self.splits.clone();
        let mut left = amount.0;
        let mut ids = Vec::new();
        let now = env::block_timestamp();
        for (i, rule) in rules.iter().enumerate() {
            let leg = if i + 1 == rules.len() { left } else { amount.0 * rule.bps as u128 / 10_000 };
            left -= leg;
            if leg == 0 {
                continue;
            }
            let id = self.payments.len();
            self.payments.push(Payment {
                id,
                agent: agent_id.clone(),
                kind: PaymentKind::Split,
                token: token.clone(),
                amount: U128(leg),
                recipient: rule.recipient.to_string(),
                destination_chain: "near".to_string(),
                transfer_to: rule.recipient.clone(),
                memo: rule.label.clone(),
                reason: reason.clone(),
                status: PaymentStatus::AwaitingGuard,
                flags: Vec::new(),
                risk_score: Some(0),
                created_at: now,
                updated_at: now,
            });
            ids.push(id);
            // Recipients are fixed by the owner, so no guard check is needed.
            let _ = self.execute(id);
        }
        self.emit("revenue_split", json!({ "agent": agent_id, "amount": amount.0.to_string(), "legs": ids.len() }));
        ids
    }

    // ---------------------------------------------------------- callbacks

    #[private]
    pub fn on_transfer(&mut self, id: u32) {
        let ok = env::promise_result_checked(0, 1024).is_ok();
        let now = env::block_timestamp();
        let (agent_id, token, amount) = {
            let p = self.payment(id);
            (p.agent.clone(), p.token.clone(), p.amount.0)
        };
        if ok {
            let p = self.payment_mut(id);
            p.status = PaymentStatus::Paid;
            p.updated_at = now;
            self.strikes.remove(&agent_id);
            self.emit("payment_paid", json!({ "id": id }));
        } else {
            let today = Self::today();
            if let Some(agent) = self.agents.get_mut(&agent_id) {
                if let Some(l) = agent.limits.iter_mut().find(|l| l.token == token) {
                    if l.day == today {
                        l.spent_today = U128(l.spent_today.0.saturating_sub(amount));
                    }
                }
            }
            let p = self.payment_mut(id);
            p.status = PaymentStatus::Failed;
            p.updated_at = now;
            self.emit("payment_failed", json!({ "id": id }));
        }
    }

    // -------------------------------------------------------------- views

    pub fn get_config(&self) -> VaultConfig {
        VaultConfig {
            owner: self.owner.clone(),
            guard: self.guard.clone(),
            paused: self.paused,
            new_payee_needs_approval: self.new_payee_needs_approval,
            payments_count: self.payments.len(),
            owner_eth: self.owner_eth.clone(),
            owner_nonce: self.owner_nonce,
        }
    }

    /// All agents. Spending is shown as of now, so it reads 0 on a new day.
    pub fn get_agents(&self) -> Vec<(AccountId, Agent)> {
        let today = Self::today();
        self.agents
            .iter()
            .map(|(id, a)| {
                let mut a = a.clone();
                for l in a.limits.iter_mut() {
                    Self::roll(l, today);
                }
                (id.clone(), a)
            })
            .collect()
    }

    pub fn get_security(&self) -> SecurityConfig {
        SecurityConfig {
            auto_pause_after: self.auto_pause_after,
            co_approvers: self.co_approvers.clone(),
            dual_rules: self.dual_rules.clone(),
            private_payees: self.private_payees.iter().cloned().collect(),
            strikes: self.strikes.iter().map(|(a, n)| (a.clone(), *n)).collect(),
        }
    }

    /// Who has approved each of these payments so far ("owner" or a co-approver id).
    pub fn get_approvals(&self, ids: Vec<u32>) -> Vec<(u32, Vec<String>)> {
        ids.into_iter()
            .take(PAGE_MAX as usize)
            .map(|i| (i, self.approvals.get(&i).cloned().unwrap_or_default()))
            .collect()
    }

    pub fn get_known_payees(&self) -> Vec<String> {
        self.known_payees.iter().cloned().collect()
    }

    pub fn get_splits(&self) -> Vec<SplitRule> {
        self.splits.clone()
    }

    pub fn get_payments_count(&self) -> u32 {
        self.payments.len()
    }

    pub fn get_payment(&self, id: u32) -> Option<Payment> {
        self.payments.get(id).cloned()
    }

    /// Payments in order of creation, starting at `from_index`.
    pub fn get_payments(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Payment> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(PAGE_MAX);
        self.payments.iter().skip(from as usize).take(limit as usize).cloned().collect()
    }

    /// Payments waiting for the owner. Scans the newest 500.
    pub fn get_pending_approvals(&self) -> Vec<Payment> {
        let n = self.payments.len();
        let start = n.saturating_sub(500);
        (start..n)
            .filter_map(|i| self.payments.get(i))
            .filter(|p| p.status == PaymentStatus::NeedsApproval)
            .cloned()
            .collect()
    }
}

// Private helpers. Not exported from the contract.
impl Vault {
    fn assert_owner(&self) {
        let eth_ok = ETH_OWNER_OK.with(|c| c.get());
        require!(eth_ok || env::predecessor_account_id() == self.owner, "Only the owner can do this");
    }

    /// The person acting: "owner" (NEAR owner or MetaMask owner) or a co-approver id.
    fn approver(&self) -> (String, bool) {
        if ETH_OWNER_OK.with(|c| c.get()) {
            return ("owner".to_string(), true);
        }
        if let Some(a) = ETH_CO_SIGNER.with(|c| c.borrow().clone()) {
            return (a, false);
        }
        let caller = env::predecessor_account_id();
        if caller == self.owner {
            return ("owner".to_string(), true);
        }
        let c = caller.to_string();
        require!(self.co_approvers.contains(&c), "Only the owner can do this");
        (c, false)
    }

    fn needs_two(&self, id: u32) -> bool {
        if self.co_approvers.is_empty() {
            return false;
        }
        let p = self.payment(id);
        self.dual_rules.iter().any(|r| r.token == p.token && p.amount.0 > r.above.0)
    }

    /// One more blocked or dismissed payment in a row. Pauses the agent at the limit.
    fn strike(&mut self, agent: &AccountId) {
        let n = self.strikes.get(agent).copied().unwrap_or(0).saturating_add(1);
        self.strikes.insert(agent.clone(), n);
        if self.auto_pause_after > 0 && n >= self.auto_pause_after {
            if let Some(a) = self.agents.get_mut(agent) {
                if !a.paused {
                    a.paused = true;
                    self.emit("agent_auto_paused", json!({ "agent": agent, "strikes": n }));
                }
            }
        }
    }

    fn check_eth(a: &str) -> String {
        let a = a.to_lowercase();
        require!(
            a.len() == 42 && a.starts_with("0x") && a[2..].chars().all(|c| c.is_ascii_hexdigit()),
            "Bad Ethereum address"
        );
        a
    }

    fn message_for(vault: &AccountId, nonce: u64, action: &str) -> String {
        format!("AgentGuard owner action\nvault: {vault}\nnonce: {nonce}\naction: {action}")
    }

    /// EIP-191 personal_sign recovery. Returns the 0x address in lower case.
    fn recover_eth(msg: &str, signature: &str) -> Option<String> {
        let sig = hex_decode(signature.strip_prefix("0x").unwrap_or(signature))?;
        if sig.len() != 65 {
            return None;
        }
        let v = match sig[64] {
            27 | 28 => sig[64] - 27,
            0 | 1 => sig[64],
            _ => return None,
        };
        let mut data = format!("\x19Ethereum Signed Message:\n{}", msg.len()).into_bytes();
        data.extend_from_slice(msg.as_bytes());
        let hash = env::keccak256_array(&data);
        let pk = env::ecrecover(&hash, &sig[..64], v, true)?;
        let addr = env::keccak256_array(&pk);
        Some(format!("0x{}", hex_encode(&addr[12..])))
    }

    fn today() -> u64 {
        env::block_timestamp() / NS_PER_DAY
    }

    fn roll(l: &mut TokenLimit, today: u64) {
        if l.day != today {
            l.day = today;
            l.spent_today = U128(0);
        }
    }

    fn check_text(s: &str, max: usize, what: &str) {
        require!(!s.is_empty() && s.len() <= max, format!("Bad {what}: 1 to {max} characters"));
    }

    fn payee_key(chain: &str, recipient: &str) -> String {
        let r = if recipient.starts_with("0x") { recipient.to_lowercase() } else { recipient.to_string() };
        format!("{}:{}", chain.to_lowercase(), r)
    }

    fn build_limits(limits: Vec<LimitInput>) -> Vec<TokenLimit> {
        require!(limits.len() <= MAX_LIMITS, "Too many token limits");
        let mut out: Vec<TokenLimit> = Vec::new();
        for l in limits {
            require!(
                l.token == NATIVE || l.token.parse::<AccountId>().is_ok(),
                "Token must be \"near\" or a NEP-141 contract account"
            );
            require!(l.per_tx_limit.0 > 0 && l.daily_cap.0 >= l.per_tx_limit.0, "Daily cap must be at least the per payment limit");
            require!(!out.iter().any(|o| o.token == l.token), "Duplicate token limit");
            out.push(TokenLimit {
                token: l.token,
                daily_cap: l.daily_cap,
                per_tx_limit: l.per_tx_limit,
                spent_today: U128(0),
                day: 0,
            });
        }
        out
    }

    fn payment(&self, id: u32) -> &Payment {
        self.payments.get(id).unwrap_or_else(|| env::panic_str("No such payment"))
    }

    fn payment_mut(&mut self, id: u32) -> &mut Payment {
        self.payments.get_mut(id).unwrap_or_else(|| env::panic_str("No such payment"))
    }

    fn emit(&self, event: &str, data: near_sdk::serde_json::Value) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({ "standard": "agentguard", "version": "1.0.0", "event": event, "data": data })
        ));
    }

    /// Moves money. The only place funds leave the vault for a payment.
    fn execute(&mut self, id: u32) -> Promise {
        let today = Self::today();
        let now = env::block_timestamp();
        let (agent_id, token, amount, to, memo) = {
            let p = self.payment(id);
            (p.agent.clone(), p.token.clone(), p.amount, p.transfer_to.clone(), p.memo.clone())
        };
        if let Some(agent) = self.agents.get_mut(&agent_id) {
            if let Some(l) = agent.limits.iter_mut().find(|l| l.token == token) {
                Self::roll(l, today);
                l.spent_today = U128(l.spent_today.0.saturating_add(amount.0));
            }
        }
        {
            let p = self.payment_mut(id);
            p.status = PaymentStatus::Sending;
            p.updated_at = now;
        }
        self.emit("payment_sending", json!({ "id": id, "token": token, "amount": amount.0.to_string() }));
        let memo = if memo.is_empty() { None } else { Some(memo) };
        self.send(&token, to, amount, memo)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_transfer(id))
    }

    fn send(&self, token: &str, to: AccountId, amount: U128, memo: Option<String>) -> Promise {
        if token == NATIVE {
            let reserve = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
            let free = env::account_balance().saturating_sub(reserve);
            require!(free.as_yoctonear() >= amount.0, "Vault does not hold enough NEAR");
            Promise::new(to).transfer(NearToken::from_yoctonear(amount.0))
        } else {
            let token_id: AccountId = token.parse().unwrap_or_else(|_| env::panic_str("Bad token id"));
            ext_ft::ext(token_id)
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_FT_TRANSFER)
                .ft_transfer(to, amount, memo)
        }
    }
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

fn hex_encode(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

    const USDC: &str = "usdc.test.near";

    fn id(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn ctx(who: &str, now_ns: u64) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(id(who))
            .current_account_id(id("vault.test.near"))
            .block_timestamp(now_ns)
            .account_balance(NearToken::from_near(100));
        b
    }
    fn usdc(n: u128) -> U128 {
        U128(n * 1_000_000)
    }
    fn vault() -> Vault {
        testing_env!(ctx("owner.test.near", 1_000).build());
        let mut v = Vault::new(id("owner.test.near"), id("guard.test.near"), None);
        v.add_agent(
            id("payables.test.near"),
            "Payables".into(),
            AgentKind::Payables,
            vec![LimitInput { token: USDC.into(), daily_cap: usdc(3_500), per_tx_limit: usdc(1_000) }],
        );
        v.add_agent(
            id("revenue.test.near"),
            "Revenue".into(),
            AgentKind::Revenue,
            vec![LimitInput { token: USDC.into(), daily_cap: usdc(10_000), per_tx_limit: usdc(5_000) }],
        );
        v.add_known_payee("near".into(), "lumen.test.near".into());
        v
    }
    fn pay(v: &mut Vault, amount: U128, to: &str) -> u32 {
        testing_env!(ctx("payables.test.near", 2_000).build());
        v.request_payment(
            USDC.into(),
            amount,
            to.into(),
            "near".into(),
            id(to),
            "INV-1".into(),
            "Invoice due".into(),
        )
    }

    #[test]
    fn small_known_payment_waits_for_guard_then_sends() {
        let mut v = vault();
        let p = pay(&mut v, usdc(400), "lumen.test.near");
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::AwaitingGuard);
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Approve, 4, vec![]);
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::Sending);
        assert_eq!(got.risk_score, Some(4));
        assert_eq!(get_created_receipts().len(), 2); // ft_transfer and the callback
        assert_eq!(v.get_agents()[0].1.limits[0].spent_today, usdc(400));
    }

    #[test]
    fn over_per_payment_limit_needs_approval_and_owner_can_send() {
        let mut v = vault();
        let p = pay(&mut v, usdc(1_200), "lumen.test.near");
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::NeedsApproval);
        assert_eq!(got.flags, vec![FLAG_PER_TX.to_string()]);
        assert_eq!(v.get_pending_approvals().len(), 1);
        testing_env!(ctx("owner.test.near", 4_000).build());
        let _ = v.approve_payment(p, false);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Sending);
        assert_eq!(v.get_pending_approvals().len(), 0);
    }

    #[test]
    fn daily_cap_counts_across_payments() {
        let mut v = vault();
        for _ in 0..3 {
            let p = pay(&mut v, usdc(1_000), "lumen.test.near");
            testing_env!(ctx("guard.test.near", 3_000).build());
            let _ = v.guard_verdict(p, Verdict::Approve, 1, vec![]);
        }
        let p = pay(&mut v, usdc(600), "lumen.test.near");
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::NeedsApproval);
        assert_eq!(got.flags, vec![FLAG_DAILY.to_string()]);
    }

    #[test]
    fn cap_resets_on_a_new_day() {
        let mut v = vault();
        for _ in 0..3 {
            let p = pay(&mut v, usdc(1_000), "lumen.test.near");
            testing_env!(ctx("guard.test.near", 3_000).build());
            let _ = v.guard_verdict(p, Verdict::Approve, 1, vec![]);
        }
        testing_env!(ctx("payables.test.near", 2 * NS_PER_DAY).build());
        let p = v.request_payment(USDC.into(), usdc(900), "lumen.test.near".into(), "near".into(), id("lumen.test.near"), "".into(), "Next day".into());
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::AwaitingGuard);
    }

    #[test]
    fn token_not_on_the_list_is_rejected_and_recorded() {
        let mut v = vault();
        testing_env!(ctx("payables.test.near", 2_000).build());
        let p = v.request_payment("evil.test.near".into(), U128(5), "lumen.test.near".into(), "near".into(), id("lumen.test.near"), "".into(), "Swap".into());
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::Rejected);
        assert_eq!(got.flags, vec![FLAG_TOKEN.to_string()]);
    }

    #[test]
    fn new_payee_needs_approval_and_can_be_trusted() {
        let mut v = vault();
        let p = pay(&mut v, usdc(100), "newco.test.near");
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::NeedsApproval);
        assert_eq!(got.flags, vec![FLAG_NEW_PAYEE.to_string()]);
        testing_env!(ctx("owner.test.near", 4_000).build());
        let _ = v.approve_payment(p, true);
        let p2 = pay(&mut v, usdc(100), "newco.test.near");
        assert_eq!(v.get_payment(p2).unwrap().status, PaymentStatus::AwaitingGuard);
    }

    #[test]
    fn guard_block_stops_the_money() {
        let mut v = vault();
        let p = pay(&mut v, usdc(100), "lumen.test.near");
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Block, 97, vec!["wallet is one day old".into()]);
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::Blocked);
        assert_eq!(got.flags, vec!["wallet is one day old".to_string()]);
        assert_eq!(get_created_receipts().len(), 0);
        assert_eq!(v.get_agents()[0].1.limits[0].spent_today, U128(0));
    }

    #[test]
    fn guard_escalate_sends_it_to_the_owner() {
        let mut v = vault();
        let p = pay(&mut v, usdc(100), "lumen.test.near");
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Escalate, 55, vec!["unusual amount".into()]);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::NeedsApproval);
    }

    #[test]
    fn owner_can_dismiss() {
        let mut v = vault();
        let p = pay(&mut v, usdc(1_200), "lumen.test.near");
        testing_env!(ctx("owner.test.near", 4_000).build());
        v.dismiss_payment(p, Some("not expected".into()));
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::Dismissed);
        assert!(got.flags.iter().any(|f| f.contains("not expected")));
    }

    #[test]
    #[should_panic(expected = "Only the guard can give a verdict")]
    fn only_the_guard_gives_verdicts() {
        let mut v = vault();
        let p = pay(&mut v, usdc(100), "lumen.test.near");
        testing_env!(ctx("payables.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Approve, 0, vec![]);
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn only_the_owner_changes_rules() {
        let mut v = vault();
        testing_env!(ctx("payables.test.near", 3_000).build());
        v.set_agent_paused(id("payables.test.near"), false);
    }

    #[test]
    #[should_panic(expected = "Caller is not an agent")]
    fn strangers_cannot_ask_for_payments() {
        let mut v = vault();
        testing_env!(ctx("stranger.test.near", 2_000).build());
        v.request_payment(USDC.into(), U128(1), "lumen.test.near".into(), "near".into(), id("lumen.test.near"), "".into(), "x".into());
    }

    #[test]
    fn paused_agent_is_rejected() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_agent_paused(id("payables.test.near"), true);
        let p = pay(&mut v, usdc(10), "lumen.test.near");
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::Rejected);
        assert!(got.flags.contains(&FLAG_PAUSED_AGENT.to_string()));
    }

    #[test]
    fn revenue_split_follows_the_rules_and_sends_dust_to_the_last_leg() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_splits(vec![
            SplitRule { label: "Savings".into(), recipient: id("savings.test.near"), bps: 4_000 },
            SplitRule { label: "Tax".into(), recipient: id("tax.test.near"), bps: 2_500 },
            SplitRule { label: "Team".into(), recipient: id("team.test.near"), bps: 3_500 },
        ]);
        testing_env!(ctx("revenue.test.near", 2_000).build());
        let ids = v.distribute_revenue(USDC.into(), U128(1_000_001), "Client payment".into());
        assert_eq!(ids.len(), 3);
        let amounts: Vec<u128> = ids.iter().map(|i| v.get_payment(*i).unwrap().amount.0).collect();
        assert_eq!(amounts, vec![400_000, 250_000, 350_001]);
        assert_eq!(amounts.iter().sum::<u128>(), 1_000_001);
        assert!(ids.iter().all(|i| v.get_payment(*i).unwrap().status == PaymentStatus::Sending));
    }

    #[test]
    #[should_panic(expected = "Over the per payment limit")]
    fn revenue_split_respects_limits() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_splits(vec![SplitRule { label: "All".into(), recipient: id("team.test.near"), bps: 10_000 }]);
        testing_env!(ctx("revenue.test.near", 2_000).build());
        v.distribute_revenue(USDC.into(), usdc(6_000), "Too big".into());
    }

    #[test]
    #[should_panic(expected = "10000 basis points")]
    fn splits_must_add_up() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_splits(vec![SplitRule { label: "Half".into(), recipient: id("team.test.near"), bps: 5_000 }]);
    }

    #[test]
    fn failed_transfer_gives_the_budget_back() {
        let mut v = vault();
        let p = pay(&mut v, usdc(400), "lumen.test.near");
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Approve, 4, vec![]);
        assert_eq!(v.get_agents()[0].1.limits[0].spent_today, usdc(400));
        let mut c = ctx("vault.test.near", 3_500);
        c.predecessor_account_id(id("vault.test.near"));
        testing_env!(c.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Failed]);
        v.on_transfer(p);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Failed);
        assert_eq!(v.get_agents()[0].1.limits[0].spent_today, U128(0));
    }

    #[test]
    fn successful_transfer_marks_paid() {
        let mut v = vault();
        let p = pay(&mut v, usdc(400), "lumen.test.near");
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Approve, 4, vec![]);
        let mut c = ctx("vault.test.near", 3_500);
        c.predecessor_account_id(id("vault.test.near"));
        testing_env!(c.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(vec![])]);
        v.on_transfer(p);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Paid);
    }

    // ---- MetaMask owner (ecrecover)

    fn eth_key(seed: u8) -> (k256::ecdsa::SigningKey, String) {
        let sk = k256::ecdsa::SigningKey::from_slice(&[seed; 32]).unwrap();
        let pt = sk.verifying_key().to_encoded_point(false);
        let addr = env::keccak256_array(&pt.as_bytes()[1..]);
        (sk, format!("0x{}", hex_encode(&addr[12..])))
    }

    fn eth_sign(sk: &k256::ecdsa::SigningKey, msg: &str) -> String {
        let mut data = format!("\x19Ethereum Signed Message:\n{}", msg.len()).into_bytes();
        data.extend_from_slice(msg.as_bytes());
        let hash = env::keccak256_array(&data);
        let (sig, rec) = sk.sign_prehash_recoverable(&hash).unwrap();
        let mut out = sig.to_bytes().to_vec();
        out.push(27 + rec.to_byte());
        format!("0x{}", hex_encode(&out))
    }

    fn eth_vault(seed: u8) -> (Vault, k256::ecdsa::SigningKey) {
        let mut v = vault();
        let (sk, addr) = eth_key(seed);
        testing_env!(ctx("owner.test.near", 1_200).build());
        v.set_owner_eth(Some(addr.to_uppercase().replace("0X", "0x")));
        (v, sk)
    }

    #[test]
    fn metamask_owner_can_approve_with_a_signature() {
        let (mut v, sk) = eth_vault(7);
        let p = pay(&mut v, usdc(1_200), "lumen.test.near");
        let action = format!(r#"{{"method":"approve_payment","args":{{"id":{p},"trust_payee":false}}}}"#);
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Sending);
        assert_eq!(v.get_config().owner_nonce, 1);
    }

    #[test]
    fn metamask_owner_can_pause() {
        let (mut v, sk) = eth_vault(8);
        let action = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
        assert!(v.get_config().paused);
    }

    #[test]
    #[should_panic(expected = "Signature is not from the owner")]
    fn a_stranger_signature_is_refused() {
        let (mut v, _) = eth_vault(7);
        let (other, _) = eth_key(9);
        let action = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&other, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
    }

    #[test]
    #[should_panic(expected = "Signature is not from the owner")]
    fn a_signature_cannot_be_replayed() {
        let (mut v, sk) = eth_vault(7);
        let action = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action.clone(), sig.clone());
        let _ = v.owner_execute(action, sig);
    }

    #[test]
    #[should_panic(expected = "Signature is not from the owner")]
    fn a_changed_action_breaks_the_signature() {
        let (mut v, sk) = eth_vault(7);
        let signed = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&sk, &v.owner_message(signed));
        let _ = v.owner_execute(r#"{"method":"set_paused","args":{"paused":false}}"#.to_string(), sig);
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn the_override_does_not_leak_after_a_signed_action() {
        let (mut v, sk) = eth_vault(7);
        let action = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
        v.set_paused(false);
    }

    #[test]
    fn events_are_logged_for_the_audit_trail() {
        let mut v = vault();
        let _ = pay(&mut v, usdc(100), "lumen.test.near");
        assert!(get_logs().iter().any(|l| l.contains("payment_requested")));
    }

    // ---- auto pause, two person approval, private payees, migration

    #[test]
    fn three_dismissals_in_a_row_pause_the_agent() {
        let mut v = vault();
        for _ in 0..3 {
            let p = pay(&mut v, usdc(1_200), "lumen.test.near");
            testing_env!(ctx("owner.test.near", 4_000).build());
            v.dismiss_payment(p, None);
        }
        assert!(v.get_agents().iter().find(|(a, _)| a.as_str() == "payables.test.near").unwrap().1.paused);
        assert!(get_logs().iter().any(|l| l.contains("agent_auto_paused")));
        let p = pay(&mut v, usdc(10), "lumen.test.near");
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Rejected);
    }

    #[test]
    fn guard_blocks_count_and_a_paid_payment_resets_the_count() {
        let mut v = vault();
        for _ in 0..2 {
            let p = pay(&mut v, usdc(100), "lumen.test.near");
            testing_env!(ctx("guard.test.near", 3_000).build());
            let _ = v.guard_verdict(p, Verdict::Block, 90, vec![]);
        }
        assert_eq!(v.get_security().strikes, vec![(id("payables.test.near"), 2)]);
        let p = pay(&mut v, usdc(100), "lumen.test.near");
        testing_env!(ctx("guard.test.near", 3_000).build());
        let _ = v.guard_verdict(p, Verdict::Approve, 1, vec![]);
        let c = ctx("vault.test.near", 5_000);
        testing_env!(c.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(vec![])]);
        v.on_transfer(p);
        assert!(v.get_security().strikes.is_empty());
        assert!(!v.get_agents()[0].1.paused);
    }

    #[test]
    fn auto_pause_can_be_turned_off() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_auto_pause_after(0);
        for _ in 0..4 {
            let p = pay(&mut v, usdc(1_200), "lumen.test.near");
            testing_env!(ctx("owner.test.near", 4_000).build());
            v.dismiss_payment(p, None);
        }
        assert!(!v.get_agents()[0].1.paused);
    }

    fn dual_vault() -> Vault {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_co_approvers(vec!["cfo.test.near".into()]);
        v.set_dual_rules(vec![DualRule { token: USDC.into(), above: usdc(1_500) }]);
        v
    }

    #[test]
    fn big_payment_needs_two_different_approvers() {
        let mut v = dual_vault();
        let p = pay(&mut v, usdc(2_000), "lumen.test.near");
        testing_env!(ctx("owner.test.near", 4_000).build());
        let _ = v.approve_payment(p, false);
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::NeedsApproval);
        assert!(got.flags.contains(&FLAG_SECOND.to_string()));
        // The same person again does not count twice.
        let _ = v.approve_payment(p, false);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::NeedsApproval);
        testing_env!(ctx("cfo.test.near", 5_000).build());
        let _ = v.approve_payment(p, false);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Sending);
        assert_eq!(v.get_approvals(vec![p]), vec![(p, vec!["owner".to_string(), "cfo.test.near".to_string()])]);
    }

    #[test]
    fn small_payment_needs_one_approver_even_with_dual_rules() {
        let mut v = dual_vault();
        let p = pay(&mut v, usdc(1_200), "lumen.test.near");
        testing_env!(ctx("owner.test.near", 4_000).build());
        let _ = v.approve_payment(p, false);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Sending);
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn a_co_approver_cannot_change_rules() {
        let mut v = dual_vault();
        testing_env!(ctx("cfo.test.near", 4_000).build());
        v.set_paused(true);
    }

    #[test]
    fn a_metamask_co_approver_gives_the_second_approval() {
        let (mut v, owner_sk) = eth_vault(7);
        let (cfo_sk, cfo_addr) = eth_key(11);
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_co_approvers(vec![cfo_addr]);
        v.set_dual_rules(vec![DualRule { token: USDC.into(), above: usdc(1_500) }]);
        let p = pay(&mut v, usdc(2_000), "lumen.test.near");
        let action = format!(r#"{{"method":"approve_payment","args":{{"id":{p},"trust_payee":false}}}}"#);
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&owner_sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action.clone(), sig);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::NeedsApproval);
        let sig = eth_sign(&cfo_sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
        assert_eq!(v.get_payment(p).unwrap().status, PaymentStatus::Sending);
    }

    #[test]
    #[should_panic(expected = "A co-approver can only approve or dismiss")]
    fn a_metamask_co_approver_cannot_pause_the_vault() {
        let (mut v, _) = eth_vault(7);
        let (cfo_sk, cfo_addr) = eth_key(11);
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_co_approvers(vec![cfo_addr]);
        let action = r#"{"method":"set_paused","args":{"paused":true}}"#.to_string();
        testing_env!(ctx("relayer.test.near", 4_000).build());
        let sig = eth_sign(&cfo_sk, &v.owner_message(action.clone()));
        let _ = v.owner_execute(action, sig);
    }

    #[test]
    fn private_payee_payments_are_flagged() {
        let mut v = vault();
        testing_env!(ctx("owner.test.near", 1_500).build());
        v.set_payee_private("near".into(), "lumen.test.near".into(), true);
        let p = pay(&mut v, usdc(100), "lumen.test.near");
        let got = v.get_payment(p).unwrap();
        assert_eq!(got.status, PaymentStatus::AwaitingGuard);
        assert_eq!(got.flags, vec![FLAG_PRIVATE.to_string()]);
        assert_eq!(v.get_security().private_payees, vec!["near:lumen.test.near".to_string()]);
    }

    #[test]
    fn migrate_keeps_the_old_state() {
        testing_env!(ctx("vault.test.near", 1_000).build());
        let mut old = VaultV1 {
            owner: id("owner.test.near"),
            guard: id("guard.test.near"),
            paused: false,
            new_payee_needs_approval: true,
            agents: IterableMap::new(b"a"),
            known_payees: IterableSet::new(b"k"),
            splits: Vec::new(),
            payments: Vector::new(b"p"),
            owner_eth: None,
            owner_nonce: 4,
        };
        old.agents.insert(id("payables.test.near"), Agent { name: "Payables".into(), kind: AgentKind::Payables, paused: false, limits: vec![] });
        old.known_payees.insert("near:lumen.test.near".into());
        old.agents.flush();
        old.known_payees.flush();
        env::state_write(&old);
        let v = Vault::migrate();
        assert_eq!(v.get_config().owner_nonce, 4);
        assert_eq!(v.get_agents().len(), 1);
        assert_eq!(v.get_known_payees(), vec!["near:lumen.test.near".to_string()]);
        assert_eq!(v.get_security().auto_pause_after, 3);
    }
}
