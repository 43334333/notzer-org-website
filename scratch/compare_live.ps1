$tmp = "$env:TEMP\notzer-live-check"
$repo = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website"

git -C $repo show HEAD:apps-script-backend/Code.gs > "$tmp\head-Code.gs"
git -C $repo show HEAD:apps-script-backend/MasterCode.gs > "$tmp\head-MasterCode.gs"

Write-Host "=== Byte Lengths ==="
Write-Host "Pulled live Code.js:      $((Get-Item "$tmp\Code.js").Length) bytes"
Write-Host "HEAD MasterCode.gs:       $((Get-Item "$tmp\head-MasterCode.gs").Length) bytes"
Write-Host "HEAD Code.gs:             $((Get-Item "$tmp\head-Code.gs").Length) bytes"

Write-Host "`n=== Checking allowedRoles in Pulled live Code.js ==="
Select-String -Path "$tmp\Code.js" -Pattern 'allowedRoles' -Context 0, 2

Write-Host "`n=== Diff: Pulled live Code.js vs HEAD MasterCode.gs ==="
$diffMaster = git diff --no-index "$tmp\Code.js" "$tmp\head-MasterCode.gs"
if (-not $diffMaster) {
    Write-Host "IDENTICAL! Live Code.js EXACTLY matches committed HEAD MasterCode.gs!" -ForegroundColor Green
} else {
    Write-Host "Differences found against HEAD MasterCode.gs:" -ForegroundColor Yellow
    $diffMaster | Select-Object -First 30
}

Write-Host "`n=== Diff: Pulled live Code.js vs HEAD Code.gs ==="
$diffCode = git diff --no-index "$tmp\Code.js" "$tmp\head-Code.gs"
if (-not $diffCode) {
    Write-Host "IDENTICAL! Live Code.js EXACTLY matches committed HEAD Code.gs!" -ForegroundColor Green
} else {
    Write-Host "Differences found against HEAD Code.gs (count: $($diffCode.Count) lines):" -ForegroundColor Yellow
    $diffCode | Select-Object -First 30
}
