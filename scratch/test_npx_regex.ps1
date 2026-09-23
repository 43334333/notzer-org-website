$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    $tempDir = Join-Path $env:TEMP "test-clasp-wrapper"
    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
    Copy-Item "$HOME\.gemini\config\clasp-profiles\notzer_org.clasprc.json" (Join-Path $tempDir ".clasprc.json") -Force

    $origUserProfile = $env:USERPROFILE
    $claspExitCode = 1
    try {
        $env:USERPROFILE = $tempDir
        $captured = & npx.cmd @google/clasp versions 2>&1 | Out-String
        $claspExitCode = $LASTEXITCODE
    } finally {
        $env:USERPROFILE = $origUserProfile
    }

    Write-Host "Clasp Exit Code: $claspExitCode"
    Write-Host "Captured length: $($captured.Length)"
    $matches = [regex]::Matches($captured, '^\s*(\d+)\s+-', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    Write-Host "Regex matches found: $($matches.Count)"
    if ($matches.Count -gt 0) {
        $highest = [int]($matches | ForEach-Object { [int]$_.Groups[1].Value } | Measure-Object -Maximum).Maximum
        Write-Host "Highest version detected: $highest"
    }

    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}
