$ErrorActionPreference = "Stop"

$ic = "$env:USERPROFILE\.gemini\config\scripts\Invoke-Clasp.ps1"
$claspMasterDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\.clasp-master"
$prodDeploymentId = "AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g"

Push-Location $claspMasterDir
try {
    Write-Host "Updating deployment $prodDeploymentId with version 48..."
    & $ic -Profile notzer_org -AutoRefresh -- deploy -i $prodDeploymentId -V 48 -d "v48_tdf_error_capture_and_fee_fixes"
    if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed" }

    Write-Host "`nVerifying live deployments..."
    & $ic -Profile notzer_org -AutoRefresh -- deployments
} finally {
    Pop-Location
}
