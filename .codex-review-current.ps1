Write-Output '--- root entries ---'
Get-ChildItem -Force | Select-Object -First 40 Name,Mode,Length
Write-Output '--- backend physical entries ---'
if (Test-Path -LiteralPath 'apps-script-backend') {
  Get-ChildItem -LiteralPath 'apps-script-backend' -Force | Select-Object -First 40 Name,Mode,Length
} else { Write-Output 'apps-script-backend absent' }
Write-Output '--- code.gs filesystem matches ---'
Get-ChildItem -Recurse -File -Filter 'Code.gs' -ErrorAction SilentlyContinue | Select-Object -First 30 FullName,Length
