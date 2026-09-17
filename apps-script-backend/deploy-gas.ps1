#!/usr/bin/env pwsh
# ============================================================
# deploy-gas.ps1 — Audit & Deploy Code.gs to Google Apps Script
# ============================================================
# Usage: .\deploy-gas.ps1
# Prerequisites: Invoke-Clasp.ps1 configured with notzer_org profile
# ============================================================

$ErrorActionPreference = "Stop"
$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
$codeFile = Join-Path $backendDir "Code.gs"
$InvokeClasp = Join-Path $env:USERPROFILE ".gemini\config\scripts\Invoke-Clasp.ps1"

# ── Correct Script ID for Notzer Chesed Master Backend ──────
# Owner: admin@notzer.org | Profile: notzer_org
# WARNING: Do NOT change this to any GridQ Script ID!
$NOTZER_MASTER_SCRIPT_ID = "1mxRpjIV3FwC_cR9Y1lasxZitHNQp2xISdRWxGpbMiWipbrjw8otWDrCF"
$NOTZER_PROD_DEPLOYMENT_ID = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"
$EXPECTED_FINGERPRINT = "NOTZER_CHESED_MASTER_BACKEND"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CODE.GS AUDIT & DEPLOY" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── Step 1: Audit Code.gs ──────────────────────────────────
Write-Host "[1/7] Auditing Code.gs for required functions..." -ForegroundColor Yellow

$content = Get-Content $codeFile -Raw
$requiredFunctions = @(
    @{ Name = "doPost";                     Desc = "Main POST router" },
    @{ Name = "doGet";                      Desc = "Main GET router" },
    @{ Name = "handleAuthenticate";         Desc = "Dual-auth authentication" },
    @{ Name = "createCampaign";             Desc = "Campaign creation" },
    @{ Name = "updateCampaign";             Desc = "Campaign update" },
    @{ Name = "issueManualReceipt";         Desc = "Manual receipt and donation logging" },
    @{ Name = "resendReceipt";              Desc = "Receipt resend" },
    @{ Name = "updateScheduledPayment";     Desc = "Scheduled payment updates" },
    @{ Name = "recordPledgePayment";        Desc = "Pledge payment recording" },
    @{ Name = "logTransactionMaster";       Desc = "Transaction sheet logging" },
    @{ Name = "logPledgeMaster";            Desc = "Pledge sheet logging" },
    @{ Name = "logCustomerMaster";          Desc = "Customer sheet logging" },
    @{ Name = "buildReceiptHtml";           Desc = "Receipt HTML builder" },
    @{ Name = "buildAddress";               Desc = "Address string builder" },
    @{ Name = "calculateFundCharge";        Desc = "Fund charge fee schedule calculation" },
    @{ Name = "getTransactionColMap_";      Desc = "Transaction dynamic column header mapper" },
    @{ Name = "ensureTransactionFundChargeCol_"; Desc = "Transaction Fund_Charge column auto-migration" },
    @{ Name = "logLinkClickMaster_";        Desc = "Link click logging with unique click ID" }
)

$requiredFeatures = @(
    @{ Pattern = "issueManualReceipt";           Desc = "Manual receipt processing" },
    @{ Pattern = "addManualDonation";            Desc = "Manual donation alias" },
    @{ Pattern = "markScheduledPaid";            Desc = "Scheduled payment alias" },
    @{ Pattern = "NOTZER_CHESED_MASTER_BACKEND";  Desc = "Project fingerprint" },
    @{ Pattern = "ensureTransactionFundChargeCol_"; Desc = "Fund charge column migration" }
)

$auditPass = $true

Write-Host "`n  Functions:" -ForegroundColor White
foreach ($fn in $requiredFunctions) {
    $found = $content -match "function\s+$($fn.Name)\s*\("
    if ($found) {
        Write-Host "    [OK] $($fn.Name) - $($fn.Desc)" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $($fn.Name) - $($fn.Desc)" -ForegroundColor Red
        $auditPass = $false
    }
}

Write-Host "`n  Features:" -ForegroundColor White
foreach ($feat in $requiredFeatures) {
    $found = $content -match $feat.Pattern
    if ($found) {
        Write-Host "    [OK] $($feat.Desc)" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $($feat.Desc)" -ForegroundColor Red
        $auditPass = $false
    }
}

$lineCount = ($content -split "`n").Count
$byteCount = (Get-Item $codeFile).Length
Write-Host "`n  File: $lineCount lines, $([math]::Round($byteCount/1024, 1)) KB" -ForegroundColor Gray

if (-not $auditPass) {
    Write-Host "`n[FAIL] Audit failed. Fix missing items before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "`n[PASS] All functions and features verified.`n" -ForegroundColor Green

# ── Step 2: Verify clasp config & Script ID ────────────────
Write-Host "[2/7] Verifying clasp configuration..." -ForegroundColor Yellow

$claspJson = Join-Path $claspMasterDir ".clasp.json"
if (-not (Test-Path $claspJson)) {
    Write-Host "  No .clasp-master/.clasp.json found. Creating with correct Script ID..." -ForegroundColor Yellow
    $claspConfig = '{"scriptId":"' + $NOTZER_MASTER_SCRIPT_ID + '","rootDir":"."}'
    Set-Content -Path $claspJson -Value $claspConfig
    Write-Host "  [OK] Created .clasp.json with Script ID: $NOTZER_MASTER_SCRIPT_ID" -ForegroundColor Green
} else {
    $existingConfig = Get-Content $claspJson -Raw | ConvertFrom-Json
    if ($existingConfig.scriptId -ne $NOTZER_MASTER_SCRIPT_ID) {
        Write-Host "  [ABORT] Script ID mismatch!" -ForegroundColor Red
        Write-Host "  Expected: $NOTZER_MASTER_SCRIPT_ID" -ForegroundColor Red
        Write-Host "  Found:    $($existingConfig.scriptId)" -ForegroundColor Red
        Write-Host "  This may indicate cross-contamination. Fix .clasp-master/.clasp.json manually." -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] Script ID verified: $($existingConfig.scriptId)" -ForegroundColor Green
}

# ── Step 2b: Verify project fingerprint ─────────────────────
Write-Host "`n  Checking project fingerprint..." -ForegroundColor Yellow
$fingerprintMatch = $content -match "PROJECT_FINGERPRINT_\s*=\s*'$EXPECTED_FINGERPRINT'"
if (-not $fingerprintMatch) {
    Write-Host "  [ABORT] PROJECT_FINGERPRINT_ not found or does not match '$EXPECTED_FINGERPRINT'" -ForegroundColor Red
    Write-Host "  Ensure Code.gs contains: var PROJECT_FINGERPRINT_ = '$EXPECTED_FINGERPRINT';" -ForegroundColor Yellow
    exit 1
}
Write-Host "  [OK] Fingerprint verified: $EXPECTED_FINGERPRINT" -ForegroundColor Green

# ── Step 3: Create appsscript.json if needed ──────────────
Write-Host "`n[3/7] Checking appsscript.json manifest..." -ForegroundColor Yellow

$manifestFile = Join-Path $backendDir "appsscript.json"
if (-not (Test-Path $manifestFile)) {
    $manifest = @{
        timeZone = "America/New_York"
        dependencies = @{ libraries = @() }
        exceptionLogging = "STACKDRIVER"
        runtimeVersion = "V8"
        webapp = @{
            executeAs = "USER_DEPLOYING"
            access = "ANYONE_ANONYMOUS"
        }
    } | ConvertTo-Json -Depth 3
    Set-Content -Path $manifestFile -Value $manifest
    Write-Host "  Created appsscript.json" -ForegroundColor Green
} else {
    Write-Host "  appsscript.json exists" -ForegroundColor Green
}

# ── Step 4: Sync .clasp-master/Code.gs ──────────────────────
Write-Host "`n[4/7] Syncing Code.gs to .clasp-master/..." -ForegroundColor Yellow
Copy-Item $codeFile (Join-Path $claspMasterDir "Code.gs") -Force
Write-Host "  [OK] Code.gs synced" -ForegroundColor Green

# ── Step 5: Push to Apps Script ─────────────────────────────
Write-Host "`n[5/7] Pushing to Apps Script (profile: notzer_org)..." -ForegroundColor Yellow
Write-Host "  WARNING: This will overwrite the remote Code.gs" -ForegroundColor Yellow
Write-Host "  Target: Notzer Chesed Master Backend ($NOTZER_MASTER_SCRIPT_ID)" -ForegroundColor Yellow

$confirm = Read-Host "  Continue? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "  [ABORT] Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

Push-Location $claspMasterDir
try {
    & $InvokeClasp -Profile notzer_org -AutoRefresh push --force
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Push failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] Push successful" -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Step 6: Create new version ──────────────────────────────
Write-Host "`n[6/7] Creating new version..." -ForegroundColor Yellow

$versionNumber = $null
Push-Location $claspMasterDir
try {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
    $versionOutput = & $InvokeClasp -Profile notzer_org -AutoRefresh version "v-$timestamp" 2>&1 | Out-String
    Write-Host $versionOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] Version creation failed. Push was successful." -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Version created" -ForegroundColor Green
        if ($versionOutput -match 'Created version\s+(\d+)') {
            $versionNumber = [int]$Matches[1]
            Write-Host "  [INFO] Version number: $versionNumber" -ForegroundColor Cyan
        }
    }

    if (-not $versionNumber) {
        # Fallback: Query clasp versions to detect the latest version number
        $versionsOutput = & $InvokeClasp -Profile notzer_org -AutoRefresh versions 2>&1 | Out-String
        $versionMatches = [regex]::Matches($versionsOutput, '^\s*(\d+)\s+-', [System.Text.RegularExpressions.RegexOptions]::Multiline)
        if ($versionMatches.Count -gt 0) {
            $versionNumber = [int]($versionMatches | ForEach-Object { [int]$_.Groups[1].Value } | Measure-Object -Maximum).Maximum
            Write-Host "  [INFO] Detected latest version number from versions list: $versionNumber" -ForegroundColor Cyan
        }
    }
} finally {
    Pop-Location
}

# ── Step 7: Update production deployment ───────────────────
Write-Host "`n[7/7] Updating production deployment ($NOTZER_PROD_DEPLOYMENT_ID)..." -ForegroundColor Yellow

Push-Location $claspMasterDir
try {
    if ($versionNumber) {
        Write-Host "  Updating deployment $NOTZER_PROD_DEPLOYMENT_ID to version $versionNumber..." -ForegroundColor White
        & $InvokeClasp -Profile notzer_org -AutoRefresh deploy -i $NOTZER_PROD_DEPLOYMENT_ID -V $versionNumber -d "v$versionNumber - Fund Charge & DAF card resolution"
    } else {
        Write-Host "  Updating deployment $NOTZER_PROD_DEPLOYMENT_ID to latest version..." -ForegroundColor White
        & $InvokeClasp -Profile notzer_org -AutoRefresh deploy -i $NOTZER_PROD_DEPLOYMENT_ID -d "Fund Charge & DAF card resolution"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Deployment update failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] Deployment updated successfully" -ForegroundColor Green

    Write-Host "`n  Verifying deployments..." -ForegroundColor Yellow
    & $InvokeClasp -Profile notzer_org -AutoRefresh deployments
} finally {
    Pop-Location
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Profile:    notzer_org (admin@notzer.org)" -ForegroundColor Green
Write-Host "  Script:     $NOTZER_MASTER_SCRIPT_ID" -ForegroundColor Green
Write-Host "  Deployment: $NOTZER_PROD_DEPLOYMENT_ID" -ForegroundColor Green
if ($versionNumber) {
    Write-Host "  Version:    @$versionNumber" -ForegroundColor Green
}
Write-Host ""
