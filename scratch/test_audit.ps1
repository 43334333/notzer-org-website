$codeFile = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\Code.gs"
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
foreach ($fn in $requiredFunctions) {
    $found = $content -match "function\s+$($fn.Name)\s*\("
    if ($found) {
        Write-Host "    [OK] $($fn.Name) - $($fn.Desc)" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $($fn.Name) - $($fn.Desc)" -ForegroundColor Red
        $auditPass = $false
    }
}
foreach ($feat in $requiredFeatures) {
    $found = $content -match $feat.Pattern
    if ($found) {
        Write-Host "    [OK] $($feat.Desc)" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $($feat.Desc)" -ForegroundColor Red
        $auditPass = $false
    }
}

if ($auditPass) {
    Write-Host "AUDIT TEST PASSED: All 18 functions and 5 features verified!" -ForegroundColor Green
} else {
    Write-Host "AUDIT TEST FAILED!" -ForegroundColor Red
}
