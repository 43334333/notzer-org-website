$url = "https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec?action=ping"
try {
    $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 15
    Write-Host "Response received:"
    $response | ConvertTo-Json -Depth 3 | Write-Host
} catch {
    Write-Host "Request exception: $_"
}
