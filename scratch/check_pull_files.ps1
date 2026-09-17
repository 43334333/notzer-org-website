$ErrorActionPreference = "Stop"

$tmp = "$env:TEMP\notzer-v50-parity-check"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
$claspJson = '{"scriptId":"1mxRpjIV3FwC_cR9Y1lasxZitHNQp2xISdRWxGpbMiWipbrjw8otWDrCF","rootDir":"."}'
Set-Content -Path "$tmp\.clasp.json" -Value $claspJson

$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
Push-Location $tmp
try {
    & $ic -Profile notzer_org -AutoRefresh pull
} finally {
    Pop-Location
}

Write-Host "Files in $($tmp):"
Get-ChildItem -Path $tmp -Recurse | Select-Object FullName, Length | Format-Table -AutoSize
