# Создать промокод (PowerShell). Пример:
#   .\scripts\create-promo.ps1 -Code VIP15 -Discount 15 -Note "для клиента"
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [Parameter(Mandatory = $true)][int]$Discount,
  [string]$Note = "",
  [string]$Kind = "support",
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Key = $env:SUPPORT_API_KEY
)

if (-not $Key) {
  Write-Error "Задайте SUPPORT_API_KEY в .env или передайте -Key"
  exit 1
}

$body = @{
  code            = $Code
  discountPercent = $Discount
  kind            = $Kind
  note            = $Note
} | ConvertTo-Json -Compress

$headers = @{
  "x-support-key"  = $Key
  "Content-Type"   = "application/json"
}

try {
  $res = Invoke-RestMethod -Uri "$BaseUrl/api/support/promo-codes" -Method Post -Headers $headers -Body $body
  Write-Host "OK: $($res.promo.code) -$($res.promo.discountPercent)%"
} catch {
  $err = $_.ErrorDetails.Message
  if ($err) { Write-Host $err } else { Write-Host $_.Exception.Message }
  exit 1
}
