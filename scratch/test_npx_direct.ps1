$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    $tempDir = Join-Path $env:TEMP "test-clasp-redirect2"
    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
    Copy-Item "$HOME\.gemini\config\clasp-profiles\notzer_org.clasprc.json" (Join-Path $tempDir ".clasprc.json") -Force

    $env:USERPROFILE = $tempDir
    # Direct execution via powershell
    $out = & npx.cmd @google/clasp versions 2>&1 | Out-String
    Write-Host "Direct npx.cmd output length: $($out.Length)"
    Write-Host "Output first 5 lines:"
    $out -split "`n" | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }

    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}
