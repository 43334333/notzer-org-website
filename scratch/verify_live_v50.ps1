$ErrorActionPreference = "Stop"

$repoRoot = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website"
$prodUrl = "https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec"
$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"

Write-Host "=== 1. Probing Live Web App testTdf Diagnostic (kfw87) ===" -ForegroundColor Cyan
$diagUrl = "$prodUrl`?action=testTdf&adminKey=5786&campaignId=kfw87"
$diagRes = Invoke-RestMethod -Uri $diagUrl -Method Get
Write-Host "Live Diagnostic Summary:"
$diagRes.summary | ConvertTo-Json -Depth 3 | Write-Host

Write-Host "`n=== 2. Probing Public createDafGrant Without Turnstile Token ===" -ForegroundColor Cyan
$noTokenBody = @{
    action = "createDafGrant"
    campaignId = "kfw87"
    submissionId = "test-probe-notoken-" + [guid]::NewGuid().ToString()
    cardNumber = "1234567890123456"
    cardPin = "1234"
    amount = 5.00
    donorName = "Security Probe"
    firstName = "Security"
    lastName = "Probe"
    email = "probe@example.com"
} | ConvertTo-Json

$noTokenRes = Invoke-RestMethod -Uri $prodUrl -Method Post -Body $noTokenBody -ContentType "text/plain;charset=utf-8"
Write-Host "Response without token:"
$noTokenRes | ConvertTo-Json | Write-Host

Write-Host "`n=== 3. Probing Public createDafGrant With Honeypot Populated ===" -ForegroundColor Cyan
$honeypotBody = @{
    action = "createDafGrant"
    campaignId = "kfw87"
    submissionId = "test-probe-hp-" + [guid]::NewGuid().ToString()
    cardNumber = "1234567890123456"
    cardPin = "1234"
    amount = 5.00
    donorName = "Bot Probe"
    firstName = "Bot"
    lastName = "Probe"
    email = "bot@example.com"
    website = "http://spambot.example.com"
    turnstileToken = "fake-token"
} | ConvertTo-Json

$honeypotRes = Invoke-RestMethod -Uri $prodUrl -Method Post -Body $honeypotBody -ContentType "text/plain;charset=utf-8"
Write-Host "Response with honeypot:"
$honeypotRes | ConvertTo-Json | Write-Host

Write-Host "`n=== 4. Verifying Bit-for-Bit Parity of Live Code ===" -ForegroundColor Cyan
$tmp = "$env:TEMP\notzer-v50-parity"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
$claspJson = '{"scriptId":"1mxRpjIV3FwC_cR9Y1lasxZitHNQp2xISdRWxGpbMiWipbrjw8otWDrCF","rootDir":"."}'
Set-Content -Path "$tmp\.clasp.json" -Value $claspJson

Push-Location $tmp
try {
    & $ic -Profile notzer_org -AutoRefresh pull
} finally {
    Pop-Location
}

fc.exe /b "$tmp\Code.gs" "$repoRoot\apps-script-backend\Code.gs" | Select-Object -First 10

Write-Host "`n=== LIVE VERIFICATION OF V50 COMPLETE ===" -ForegroundColor Green
