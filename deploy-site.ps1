[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Message = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
    Write-Error 'This script must be run from inside the git repository root (notzer-org-website).'
}

Set-Location $repoRoot

Write-Host '=================================================' -ForegroundColor Cyan
Write-Host '  Notzer Chesed — GitHub Pages Deployment Engine ' -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Check Git Status
Write-Host '[1/4] Checking repository status...' -ForegroundColor Yellow
$status = git status --porcelain
if (-not $status) {
    Write-Host 'No changes detected. Working tree is clean.' -ForegroundColor Green
    exit 0
}

Write-Host 'Detected changes:' -ForegroundColor Gray
git status --short

# 2. Secret Scan Invariant Check
Write-Host ''
Write-Host '[2/4] Running security and client secret isolation scan...' -ForegroundColor Yellow
$suspiciousPatterns = @('cardknoxServerKey', 'usaepaySourceKey', 'usaepayPin', 'tdfValidationToken', 'tdfApiKey', 'tdfToken')

$leakFound = $false
$filesToCheck = Get-ChildItem -Path $repoRoot -Recurse -Include *.html, *.js | Where-Object { $_.FullName -notmatch 'apps-script-backend' }
foreach ($file in $filesToCheck) {
    foreach ($pattern in $suspiciousPatterns) {
        $found = Select-String -Path $file.FullName -Pattern "$pattern\s*[:=]\s*['`"][a-zA-Z0-9_\-]{12,}"
        if ($found) {
            Write-Host ('SECURITY ERROR: Hardcoded server secret detected for ' + $pattern + ' in ' + $file.Name) -ForegroundColor Red
            $found | ForEach-Object { Write-Host ('  ' + $_.Line.Trim()) -ForegroundColor Red }
            $leakFound = $true
        }
    }
}

if ($leakFound) {
    Write-Error 'Deployment aborted due to secret isolation invariant violation. Server secrets must remain strictly in Google Apps Script properties.'
}
Write-Host 'Security scan PASSED. No hardcoded server secrets in client assets.' -ForegroundColor Green

# 3. Stage and Commit
Write-Host ''
Write-Host '[3/4] Staging and committing changes...' -ForegroundColor Yellow
git add -A

if (-not $Message) {
    $dateStr = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $Message = 'Deploy site updates (' + $dateStr + ')'
}

git commit -m $Message
Write-Host ('Committed changes: ' + $Message) -ForegroundColor Green

# 4. Push to origin main
Write-Host ''
Write-Host '[4/4] Pushing to origin/main (GitHub Pages)...' -ForegroundColor Yellow
git push origin main

Write-Host ''
Write-Host '=================================================' -ForegroundColor Green
Write-Host '  SUCCESS: Site successfully deployed to GitHub Pages! ' -ForegroundColor Green
Write-Host '  Public URL: https://43334333.github.io/notzer-org-website/ ' -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Green
