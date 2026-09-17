$ErrorActionPreference = 'Stop'
$url = 'https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec?action=testTdf&adminKey=5786&campaignId=kfw87'
$response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
$summary = $response.summary
[PSCustomObject]@{
  status = $response.status
  environment = $summary.environment
  baseUrl = $summary.baseUrl
  charityAccountNumber = $summary.charityAccountNumber
  hasApiKey = $summary.hasApiKey
  hasValidationToken = $summary.hasValidationToken
  charityLookupHttp = $summary.charityLookup.httpStatus
  cardValidationHttp = $summary.cardValidation.httpStatus
} | ConvertTo-Json -Compress
