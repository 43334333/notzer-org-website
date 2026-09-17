$ErrorActionPreference = 'Stop'
$profilePath = Join-Path $env:USERPROFILE '.gemini\config\clasp-profiles\notzer_org.clasprc.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$headers = @{ Authorization = 'Bearer ' + $profile.tokens.default.access_token }
$query = "mimeType = 'application/vnd.google-apps.spreadsheet' and (name contains 'Notzer' or name contains 'Master') and trashed = false"
$uri = 'https://www.googleapis.com/drive/v3/files?q=' + [Uri]::EscapeDataString($query) + '&fields=files(id,name),nextPageToken&pageSize=100'
$response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 25
$response.files | Select-Object id,name | ConvertTo-Json -Compress
