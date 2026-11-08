# One command deploy of the AgentGuard vault to NEAR testnet, for Windows PowerShell.
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1 -Owner you.testnet -OwnerEth 0xYourMetaMaskAddress
# Needs Rust from https://rustup.rs (no WSL needed). Everything else is installed here.
param(
  [Parameter(Mandatory)][string]$Owner,
  [Parameter(Mandatory)][string]$OwnerEth,
  [string]$Vault = "agentguard.$Owner",
  [string]$Guard = "guard.$Owner",
  [string]$Payables = "payables.$Owner",
  [string]$Revenue = "revenue.$Owner",
  [string]$Token = "usdc.fakes.testnet",
  [switch]$TopUp
)
$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 drops double quotes when it calls a program, so escape them.
function J($s) { $s -replace '"', '\"' }
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Run { & $args[0] $args[1..($args.Length - 1)]; if ($LASTEXITCODE -ne 0) { throw "Failed: $($args -join ' ')" } }

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw "Install Rust first: https://rustup.rs then open a new PowerShell" }

Step "Rust wasm target and NEAR tools (first run takes a few minutes)"
Run rustup target add wasm32-unknown-unknown
if (-not (Get-Command cargo-near -ErrorAction SilentlyContinue)) { Run cargo install cargo-near --locked }
if (-not (Get-Command near -ErrorAction SilentlyContinue)) { Run cargo install near-cli-rs --locked }

Step "Test and build the contract"
Push-Location "$PSScriptRoot\..\contract"
Run cargo test
# cargo-near tries to make an ABI file, which does not link on Windows. Skip it, and fall back to a plain wasm build.
$wasm = $null
& cargo near build non-reproducible-wasm --no-abi
if ($LASTEXITCODE -eq 0 -and (Test-Path "target\near\agentguard_vault.wasm")) { $wasm = (Resolve-Path "target\near\agentguard_vault.wasm").Path }
if (-not $wasm) {
  Write-Host "cargo near failed. Using a plain wasm build instead." -ForegroundColor Yellow
  Run cargo build --release --target wasm32-unknown-unknown
  $wasm = (Resolve-Path "target\wasm32-unknown-unknown\release\agentguard_vault.wasm").Path
}
Pop-Location
Write-Host "wasm: $wasm"

Step "Accounts. If $Owner does not exist yet, near asks to create it with the faucet."
$prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
$summary = (near account view-account-summary $Owner network-config testnet now 2>&1 | Out-String)
$ErrorActionPreference = $prev
$exists = $summary -match "balance"
if (-not $exists) { Run near account create-account sponsor-by-faucet-service $Owner autogenerate-new-keypair save-to-keychain network-config testnet create }
function Has($id) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $o = (near account view-account-summary $id network-config testnet now 2>&1 | Out-String)
  $ErrorActionPreference = $prev
  return ($o -match "balance")
}
foreach ($a in @($Vault, $Guard, $Payables, $Revenue)) {
  if (Has $a) { Write-Host "$a already exists, skipping" } else {
    Run near account create-account fund-myself $a ($(if ($a -eq $Vault) { '5 NEAR' } else { '1 NEAR' })) autogenerate-new-keypair save-to-keychain sign-as $Owner network-config testnet sign-with-keychain send
  }
}

if ($TopUp) {
  Step "Top up the vault: move spare NEAR from the other accounts to cover contract storage"
  foreach ($a in @($Guard, $Payables, $Revenue)) {
    Run near tokens $a send-near $Vault '1.5 NEAR' network-config testnet sign-with-keychain send
  }
}

Step "Deploy the vault"
Run near contract deploy $Vault use-file $wasm with-init-call new json-args (J "{`"owner`":`"$Owner`",`"guard`":`"$Guard`",`"owner_eth`":`"$OwnerEth`"}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

Step "Add the agents with their limits (token $Token, 6 decimals: 3500 per day, 1000 per payment)"
$lim = "[{`"token`":`"$Token`",`"daily_cap`":`"3500000000`",`"per_tx_limit`":`"1000000000`"}]"
Run near contract call-function as-transaction $Vault add_agent json-args (J "{`"account`":`"$Payables`",`"name`":`"Payables`",`"kind`":`"Payables`",`"limits`":$lim}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send
Run near contract call-function as-transaction $Vault add_agent json-args (J "{`"account`":`"$Revenue`",`"name`":`"Revenue`",`"kind`":`"Revenue`",`"limits`":$lim}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send

Step "Done"
Write-Host "Vault: $Vault on NEAR testnet"
Write-Host "1. Open the app, pick NEAR testnet, enter $Vault"
Write-Host "2. To send transactions from the app, put the keys in web\.env (see .env.example): NEAR_VAULT_ID=$Vault and the guard, payables, revenue and relayer keys"
Write-Host "   Keys are in your Windows credential store. Export with: near account export-account $Guard using-private-key"
