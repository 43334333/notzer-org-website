$tmp = "$env:TEMP\notzer-live-check"
$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
Set-Location $tmp
Write-Host "Current location: $((Get-Location).Path)"
& $ic -Profile notzer-gmail -AutoRefresh pull
