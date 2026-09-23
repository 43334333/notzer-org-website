$errors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend\deploy-gas.ps1",
    [ref]$tokens,
    [ref]$errors
)
if ($errors.Count -eq 0) {
    Write-Host "PARSER PASS: deploy-gas.ps1 has NO syntax errors." -ForegroundColor Green
} else {
    Write-Host "PARSER ERROR in deploy-gas.ps1:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host $_.Message }
}
