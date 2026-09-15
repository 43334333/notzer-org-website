$ErrorActionPreference = "Stop"

$outputFile = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\.agent-relay\014-codex-commit-review-results.md"

Write-Host "Running codex review on commit 128197c with model=gpt-5.6-sol, effort=medium..."

codex review --commit 128197c -c model="gpt-5.6-sol" -c model_reasoning_effort="medium" > $outputFile 2>&1

Write-Host "Codex review complete. Exit code: $LASTEXITCODE"
Write-Host "Output written to $outputFile."
Get-Content $outputFile | Select-Object -First 40
