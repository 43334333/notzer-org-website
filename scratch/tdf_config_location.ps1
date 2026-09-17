$ErrorActionPreference = 'Stop'
$profilePath = Join-Path $env:USERPROFILE '.gemini\config\clasp-profiles\notzer_org.clasprc.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$headers = @{ Authorization = 'Bearer ' + $profile.tokens.default.access_token }
$masterId = '1w8Z265dphSMlc6GTkonYZ79rIEHh16DgFnXAQfgh0IE'
$range = [Uri]::EscapeDataString('Campaigns!A1:AA100')
$uri = "https://sheets.googleapis.com/v4/spreadsheets/$masterId/values/$range"
$response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 25
$matching = for ($i=0; $i -lt $response.values.Count; $i++) {
  $row = $response.values[$i]
  if ($row.Count -gt 0 -and $row[0] -eq 'kfw87') {
    [PSCustomObject]@{
      rowNumber = $i + 1
      campaignId = $row[0]
      accountNumber = if ($row.Count -gt 23) { $row[23] } else { $null }
      campaignApiKeyPresent = ($row.Count -gt 24 -and -not [string]::IsNullOrWhiteSpace($row[24]))
      campaignValidationTokenPresent = ($row.Count -gt 25 -and -not [string]::IsNullOrWhiteSpace($row[25]))
      environment = if ($row.Count -gt 26) { $row[26] } else { $null }
    }
  }
}
$matching | ConvertTo-Json -Compress
