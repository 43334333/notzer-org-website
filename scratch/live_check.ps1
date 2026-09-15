$ErrorActionPreference = "Stop"

$ic  = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$tmp = "$env:TEMP\notzer-live-check"

Write-Host "=== 1. Preparing temp dir: $tmp ==="
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null

$claspJson = '{"scriptId":"1mxRpjIV3FwC_cR9Y1lasxZitHNQp2xISdRWxGpbMiWipbrjw8otWDrCF","rootDir":"."}'
Set-Content -Path "$tmp\.clasp.json" -Value $claspJson

Write-Host "=== 2. Pulling live master via Invoke-Clasp ==="
Push-Location $tmp
try {
    & $ic -Profile notzer_org -AutoRefresh pull
} finally {
    Pop-Location
}

Write-Host "=== 3. Listing pulled files in $tmp ==="
Get-ChildItem $tmp | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Host "=== 4. Checking allowedRoles in pulled Code.gs ==="
if (Test-Path "$tmp\Code.gs") {
    Select-String -Path "$tmp\Code.gs" -Pattern 'allowedRoles' -Context 0, 2
} else {
    Write-Host "Code.gs not found in pulled files!"
}

Write-Host "=== 5. Comparing with committed HEAD of Code.gs and MasterCode.gs ==="
$repo = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website"
git -C $repo show HEAD:apps-script-backend/Code.gs > "$tmp\head-Code.gs"
git -C $repo show HEAD:apps-script-backend/MasterCode.gs > "$tmp\head-MasterCode.gs"

Write-Host "Comparing pulled Code.gs against committed HEAD Code.gs:"
fc.exe /b "$tmp\Code.gs" "$tmp\head-Code.gs" | Select-Object -First 10

Write-Host "Comparing pulled Code.gs against committed HEAD MasterCode.gs:"
fc.exe /b "$tmp\Code.gs" "$tmp\head-MasterCode.gs" | Select-Object -First 10
