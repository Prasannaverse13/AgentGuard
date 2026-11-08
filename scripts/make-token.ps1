# Makes free test USDC on NEAR testnet, funds the vault, and points both agents at it.
# powershell -ExecutionPolicy Bypass -File scripts\make-token.ps1
param(
  [string]$Owner = "prasanna-ag.testnet",
  [string]$Vault = "agentguard.prasanna-ag.testnet",
  [string]$Payables = "payables.prasanna-ag.testnet",
  [string]$Revenue = "revenue.prasanna-ag.testnet",
  [string]$VaultUsdc = "20000000000",
  [string]$MintUsdc = "1000000000000"
)
$ErrorActionPreference = "Stop"
function J($s) { $s -replace '"', '\"' }
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Run { & $args[0] $args[1..($args.Length - 1)]; if ($LASTEXITCODE -ne 0) { throw "Failed: $($args -join ' ')" } }
function Has($id) {
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $o = (& near account view-account-summary $id network-config testnet now 2>&1 | Out-String)
  $ErrorActionPreference = $old
  return ($o -match "balance")
}
$Token = "usdc.$Owner"

Step "Build the test token"
Push-Location "$PSScriptRoot\..\token"
Run cargo test
Run cargo build --release --target wasm32-unknown-unknown
$wasm = (Resolve-Path "target\wasm32-unknown-unknown\release\test_usdc.wasm").Path
Pop-Location

Step "Token account $Token"
if (Has $Token) { Write-Host "exists, skipping" } else {
  Run near account create-account fund-myself $Token '1.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Owner network-config testnet sign-with-keychain send
}

Step "Top up the token account with 1.5 NEAR from the owner"
Run near tokens $Owner send-near $Token '1.5 NEAR' network-config testnet sign-with-keychain send

Step "Deploy the token"
$old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
& near account view-account-summary $Token network-config testnet now 2>&1 | Select-String "balance|Native"
$ErrorActionPreference = $old
Run near contract deploy $Token use-file $wasm with-init-call new json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

Step "Mint free USDC to $Owner"
Run near contract call-function as-transaction $Token mint json-args (J "{`"account_id`":`"$Owner`",`"amount`":`"$MintUsdc`"}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send

Step "Send USDC to the vault"
Run near contract call-function as-transaction $Token ft_transfer json-args (J "{`"receiver_id`":`"$Vault`",`"amount`":`"$VaultUsdc`"}") prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as $Owner network-config testnet sign-with-keychain send

Step "Point the agents at the new token (3500 per day, 1000 per payment)"
foreach ($a in @($Payables, $Revenue)) {
  $limits = "[{`"token`":`"$Token`",`"daily_cap`":`"3500000000`",`"per_tx_limit`":`"1000000000`"}]"
  Run near contract call-function as-transaction $Vault set_agent_limits json-args (J "{`"account`":`"$a`",`"limits`":$limits}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send
}

Step "Done"
Write-Host "Token: $Token (free test USDC, anyone can mint). The vault now holds 20000 USDC."
Write-Host "Refresh the app. It should show the vault balance."
