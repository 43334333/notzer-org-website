$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    $preVersionsOutput = & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh versions 2>&1 | Out-String
    Write-Host "Length of output: $($preVersionsOutput.Length)"
    Write-Host "Raw output dump:"
    $preVersionsOutput | Out-File -FilePath "$HOME/scratch_versions.txt"
    $preMatches = [regex]::Matches($preVersionsOutput, '^\s*(\d+)\s+-', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    Write-Host "Matches count: $($preMatches.Count)"
    foreach ($m in $preMatches) {
        Write-Host "Match: $($m.Value) Group1: $($m.Groups[1].Value)"
    }
} finally {
    Pop-Location
}
