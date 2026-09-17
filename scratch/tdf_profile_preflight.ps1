$ErrorActionPreference = 'Stop'
$profilePath = Join-Path $env:USERPROFILE '.gemini\config\clasp-profiles\notzer_org.clasprc.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$token = $profile.tokens.default
[PSCustomObject]@{
  profileFound = $true
  tokenPropertyNames = @($token.PSObject.Properties.Name)
  scopes = $token.scope
  expiresAt = if ($token.expiry_date) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$token.expiry_date).ToString('u') } else { $null }
} | ConvertTo-Json -Compress
