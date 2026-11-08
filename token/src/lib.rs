//! Test USDC for NEAR testnet. Minimal NEP-141. Anyone can call `mint`. Testnet only.
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestUsdc {
    balances: LookupMap<AccountId, u128>,
    total: u128,
}

#[near(serializers = [json])]
pub struct FtMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
pub struct StorageBounds {
    pub min: U128,
    pub max: Option<U128>,
}

#[near]
impl TestUsdc {
    #[init]
    pub fn new() -> Self {
        Self { balances: LookupMap::new(b"b"), total: 0 }
    }

    /// Free tokens for testing. Amount is in base units (6 decimals). 1 USDC = 1000000.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        let bal = self.balances.get(&account_id).copied().unwrap_or(0);
        self.balances.insert(account_id, bal + amount.0);
        self.total += amount.0;
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(env::attached_deposit() == NearToken::from_yoctonear(1), "Attach exactly 1 yoctoNEAR");
        let _ = memo;
        let sender = env::predecessor_account_id();
        require!(sender != receiver_id, "Sender and receiver must differ");
        require!(amount.0 > 0, "Amount must be positive");
        let from = self.balances.get(&sender).copied().unwrap_or(0);
        require!(from >= amount.0, "Not enough balance");
        self.balances.insert(sender, from - amount.0);
        let to = self.balances.get(&receiver_id).copied().unwrap_or(0);
        self.balances.insert(receiver_id, to + amount.0);
    }

    pub fn ft_metadata(&self) -> FtMetadata {
        FtMetadata {
            spec: "ft-1.0.0".into(),
            name: "Test USDC".into(),
            symbol: "USDC".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }

    /// Accounts need no registration here. This exists so wallets and tools that call it do not fail.
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = (account_id, registration_only);
        StorageBalance { total: U128(0), available: U128(0) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        let _ = account_id;
        Some(StorageBalance { total: U128(0), available: U128(0) })
    }

    pub fn storage_balance_bounds(&self) -> StorageBounds {
        StorageBounds { min: U128(0), max: Some(U128(0)) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: AccountId, deposit: u128) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(who).attached_deposit(NearToken::from_yoctonear(deposit)).build());
    }

    #[test]
    fn mint_and_transfer() {
        ctx(accounts(0), 0);
        let mut t = TestUsdc::new();
        t.mint(accounts(0), U128(5_000_000));
        ctx(accounts(0), 1);
        t.ft_transfer(accounts(1), U128(2_000_000), None);
        assert_eq!(t.ft_balance_of(accounts(0)).0, 3_000_000);
        assert_eq!(t.ft_balance_of(accounts(1)).0, 2_000_000);
        assert_eq!(t.ft_total_supply().0, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "Not enough balance")]
    fn cannot_overspend() {
        ctx(accounts(0), 0);
        let mut t = TestUsdc::new();
        ctx(accounts(0), 1);
        t.ft_transfer(accounts(1), U128(1), None);
    }

    #[test]
    #[should_panic(expected = "1 yoctoNEAR")]
    fn needs_one_yocto() {
        ctx(accounts(0), 0);
        let mut t = TestUsdc::new();
        t.mint(accounts(0), U128(10));
        t.ft_transfer(accounts(1), U128(1), None);
    }
}
