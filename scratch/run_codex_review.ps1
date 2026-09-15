$ErrorActionPreference = "Stop"

$outputFile = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\.agent-relay\013-codex-review-results.md"

Write-Host "Running codex review with model=gpt-5.6-sol, effort=medium on uncommitted changes..."

codex review --uncommitted -c model="gpt-5.6-sol" -c model_reasoning_effort="medium" > $outputFile 2>&1

Write-Host "Codex review complete. Exit code: $LASTEXITCODE"
Write-Host "Output written to $outputFile."
Get-Content $outputFile | Select-Object -First 40
