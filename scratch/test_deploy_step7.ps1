$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
$NOTZER_PROD_DEPLOYMENT_ID = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"
$versionNumber = 54
Push-Location $claspMasterDir
try {
    $deployOutput = & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh -- deploy --deploymentId $NOTZER_PROD_DEPLOYMENT_ID --versionNumber $versionNumber --description "v$versionNumber - Fund Charge & DAF card resolution" 2>&1 | Out-String
    Write-Host "Deploy output:"
    Write-Host $deployOutput
    Write-Host "Exit code: $LASTEXITCODE"

    $deploymentsOutput = & "$HOME\.gemini\config\scripts\Invoke-Clasp.ps1" -Profile notzer_org -AutoRefresh deployments 2>&1 | Out-String
    Write-Host "Deployments output:"
    Write-Host $deploymentsOutput

    $escapedDeployId = [regex]::Escape($NOTZER_PROD_DEPLOYMENT_ID)
    $bindingPattern = "$escapedDeployId\s+@$versionNumber\b"
    if ($deploymentsOutput -match $bindingPattern) {
        Write-Host "MATCH CONFIRMED: Production deployment is pointing to @$versionNumber" -ForegroundColor Green
    } else {
        Write-Host "MATCH FAILED" -ForegroundColor Red
    }
} finally {
    Pop-Location
}
