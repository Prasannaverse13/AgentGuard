# Writes web\.env for the testnet vault. Keys go from your Windows keychain to the file. They never leave your laptop.
param([string]$Owner = "prasanna-ag.testnet")
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "web\.env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root "web\.env.example") $envFile }
$text = Get-Content $envFile -Raw
function SetVar($name, $value) {
  $script:text = [regex]::Replace($script:text, "(?m)^$name=.*$", "$name=$value")
  if ($script:text -notmatch "(?m)^$name=") { $script:text += "`n$name=$value" }
}
function GetKey($acct) {
  $out = (& near account export-account $acct using-private-key network-config testnet 2>&1 | Out-String)
  $m = [regex]::Matches($out, "ed25519:[1-9A-HJ-NP-Za-km-z]{80,100}")
  if ($m.Count -eq 0) { Write-Host "Could not read the key for $acct"; return $null }
  return $m[0].Value
}
$vault = "agentguard.$Owner"
SetVar "NEAR_NETWORK" "testnet"
SetVar "NEAR_VAULT_ID" $vault
$map = @{ "NEAR_GUARD_KEY" = "guard.$Owner"; "NEAR_PAYABLES_KEY" = "payables.$Owner"; "NEAR_REVENUE_KEY" = "revenue.$Owner"; "NEAR_RELAYER_KEY" = "guard.$Owner" }
foreach ($k in $map.Keys) { $v = GetKey $map[$k]; if ($v) { SetVar $k $v; Write-Host "Set $k" } }
SetVar "NEAR_RELAYER_ID" "guard.$Owner"
SetVar "NEAR_OWNER_ID" $Owner
SetVar "NEAR_GUARD_ID" "guard.$Owner"
SetVar "NEAR_PAYABLES_ID" "payables.$Owner"
SetVar "NEAR_REVENUE_ID" "revenue.$Owner"
Set-Content $envFile $text -NoNewline
Write-Host "Done. Now run: cd web; npm install; npm run dev"
