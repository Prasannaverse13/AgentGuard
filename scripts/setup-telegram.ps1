# Turns on Telegram alerts. You need a bot token from @BotFather first.
#   1. In Telegram open @BotFather, send /newbot, pick a name. Copy the token.
#   2. Open your new bot and send it any message, for example hi.
#   3. powershell -ExecutionPolicy Bypass -File scripts\setup-telegram.ps1 -Token "123456:ABC..."
param([Parameter(Mandatory = $true)][string]$Token)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "web\.env"

$u = Invoke-RestMethod "https://api.telegram.org/bot$Token/getUpdates"
$chat = $u.result | ForEach-Object { if ($_.message) { $_.message.chat } elseif ($_.channel_post) { $_.channel_post.chat } } | Select-Object -Last 1
if (-not $chat) { throw "No message found. Open your bot in Telegram, send it hi, then run this again." }
$chatId = "$($chat.id)"
Write-Host "Found chat $chatId ($($chat.first_name)$($chat.title))"

$text = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { "" }
foreach ($pair in @(@("TELEGRAM_BOT_TOKEN", $Token), @("TELEGRAM_CHAT_ID", $chatId))) {
  $name = $pair[0]; $value = $pair[1]
  if ($text -match "(?m)^$name=") { $text = [regex]::Replace($text, "(?m)^$name=.*$", "$name=$value") }
  else { $text = $text.TrimEnd() + "`r`n$name=$value`r`n" }
}
Set-Content $envFile $text -NoNewline

$body = @{ chat_id = $chatId; text = "AgentGuard alerts are on. You will hear here when a payment waits for you, is blocked, or an agent is paused." } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$Token/sendMessage" -ContentType "application/json" -Body $body | Out-Null
Write-Host "Sent a test message. Restart the app (Ctrl+C then npm run dev in web) so it picks up the token."
