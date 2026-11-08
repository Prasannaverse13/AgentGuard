#!/usr/bin/env bash
# Build and deploy the vault to NEAR testnet.
# Needs: rust + cargo-near, near-cli-rs ("near"), a testnet account you control.
#   cargo install cargo-near near-cli-rs
# Usage: OWNER=you.testnet OWNER_ETH=0xYourMetaMaskAddress GUARD=guard-you.testnet VAULT=agentguard-you.testnet ./scripts/deploy-testnet.sh
set -euo pipefail
: "${OWNER:?set OWNER}" "${GUARD:?set GUARD}" "${VAULT:?set VAULT}" "${OWNER_ETH:?set OWNER_ETH to your MetaMask address}"

cd "$(dirname "$0")/../contract"
cargo test
cargo near build non-reproducible-wasm --no-abi

near account create-account fund-myself "$VAULT" '5 NEAR' autogenerate-new-keypair save-to-keychain sign-as "$OWNER" network-config testnet sign-with-keychain send
near contract deploy "$VAULT" use-file target/near/agentguard_vault.wasm \
  with-init-call new json-args "{\"owner\":\"$OWNER\",\"guard\":\"$GUARD\",\"owner_eth\":\"$OWNER_ETH\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

echo "Vault deployed at $VAULT"
echo "Next: add agents with 'near contract call-function as-transaction $VAULT add_agent ...' (see README)"
