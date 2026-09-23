$backendDir = "c:\Users\spink\Dropbox\Apps\notzer.org\notzer-org-website\apps-script-backend"
$claspMasterDir = Join-Path $backendDir ".clasp-master"
Push-Location $claspMasterDir
try {
    $tempDir = Join-Path $env:TEMP "test-clasp-redirect"
    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
    Copy-Item "$HOME\.gemini\config\clasp-profiles\notzer_org.clasprc.json" (Join-Path $tempDir ".clasprc.json") -Force

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c npx @google/clasp versions"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.WorkingDirectory = (Get-Location).Path

    $currentEnv = [System.Environment]::GetEnvironmentVariables()
    foreach ($key in $currentEnv.Keys) {
        $psi.EnvironmentVariables[$key] = $currentEnv[$key]
    }
    $psi.EnvironmentVariables["USERPROFILE"] = $tempDir

    $process = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = [System.Threading.Tasks.Task]::Run([System.Func[string]]{ $process.StandardOutput.ReadToEnd() })
    $stderrTask = [System.Threading.Tasks.Task]::Run([System.Func[string]]{ $process.StandardError.ReadToEnd() })
    $process.WaitForExit()
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result

    Write-Host "Exit Code: $($process.ExitCode)"
    Write-Host "STDOUT length: $($stdout.Length)"
    Write-Host "STDERR length: $($stderr.Length)"
    Write-Host "STDOUT first 3 lines:"
    $stdout.Split("`n") | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }

    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}
