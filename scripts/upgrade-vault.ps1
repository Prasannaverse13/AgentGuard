# Upgrades the deployed vault in place and adds the Ops agent. Funds, agents, rules and history stay.
#   powershell -ExecutionPolicy Bypass -File scripts\upgrade-vault.ps1
# New on chain: auto pause, two person approval, private payees. New agent: Ops (pay per call).
param(
  [string]$Owner = "prasanna-ag.testnet",
  [string]$Vault = "agentguard.prasanna-ag.testnet",
  [string]$Token = "usdc.prasanna-ag.testnet",
  [string]$PayTo = "weather-api.testnet"
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
$Ops = "ops.$Owner"
$root = Split-Path -Parent $PSScriptRoot

Step "Test and build the new contract"
Push-Location "$root\contract"
Run cargo test
$wasm = $null
& cargo near build non-reproducible-wasm --no-abi
if ($LASTEXITCODE -eq 0 -and (Test-Path "target\near\agentguard_vault.wasm")) { $wasm = (Resolve-Path "target\near\agentguard_vault.wasm").Path }
if (-not $wasm) {
  Run cargo build --release --target wasm32-unknown-unknown
  $wasm = (Resolve-Path "target\wasm32-unknown-unknown\release\agentguard_vault.wasm").Path
}
Pop-Location

Step "Upgrade the vault code and migrate its state (keeps everything)"
Run near contract deploy $Vault use-file $wasm with-init-call migrate json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

Step "Ops agent account $Ops"
if (Has $Ops) { Write-Host "exists, skipping" } else {
  Run near account create-account fund-myself $Ops '0.3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $Owner network-config testnet sign-with-keychain send
}

Step "Add the Ops agent: 0.50 USDC per call, 20 USDC per day"
$old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
$args1 = J "{`"account`":`"$Ops`",`"name`":`"Ops`",`"kind`":`"Ops`",`"limits`":[{`"token`":`"$Token`",`"daily_cap`":`"20000000`",`"per_tx_limit`":`"500000`"}]}"
& near contract call-function as-transaction $Vault add_agent json-args $args1 prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send
if ($LASTEXITCODE -ne 0) { Write-Host "add_agent failed. If it says Agent already exists, that is fine." -ForegroundColor Yellow }
$ErrorActionPreference = $old

Step "Trust the paid API ($PayTo) so pay per call is not held"
Run near contract call-function as-transaction $Vault add_known_payee json-args (J "{`"destination_chain`":`"near`",`"recipient`":`"$PayTo`"}") prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as $Owner network-config testnet sign-with-keychain send

Step "Put the Ops key in web\.env (it stays on this laptop)"
$envFile = Join-Path $root "web\.env"
$text = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { "" }
function SetVar($name, $value) {
  if ($script:text -match "(?m)^$name=") { $script:text = [regex]::Replace($script:text, "(?m)^$name=.*$", "$name=$value") }
  else { $script:text = $script:text.TrimEnd() + "`r`n$name=$value`r`n" }
}
$ErrorActionPreference = "Continue"
$out = (& near account export-account $Ops using-private-key network-config testnet 2>&1 | Out-String)
$m = [regex]::Matches($out, "ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}")
if ($m.Count -gt 0) {
  SetVar "NEAR_OPS_ID" $Ops
  SetVar "NEAR_OPS_KEY" $m[0].Value
  SetVar "NEAR_OPS_PAY_TO" $PayTo
  Set-Content $envFile $text -NoNewline
  Write-Host "Set NEAR_OPS_ID and NEAR_OPS_KEY"
} else { Write-Host "Could not read the Ops key. Run: near account export-account $Ops using-private-key network-config testnet" -ForegroundColor Yellow }

Step "Done"
Write-Host "Restart the app (Ctrl+C then npm run dev in web). New on the Rules page: Auto pause, Two person approval, Pay privately, Alerts, Invoice by email."
Write-Host "Run the Ops agent from Overview. It pays 0.003 USDC per API call through the vault on NEAR."
