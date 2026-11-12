param([switch]$OpenPair)
$ErrorActionPreference = 'Stop'
$bgmRoot = Join-Path $PSScriptRoot 'runtime'
$bgmPython = Join-Path $bgmRoot '.venv\Scripts\python.exe'
$bgmLogs = Join-Path $bgmRoot 'logs'
New-Item -ItemType Directory -Path $bgmLogs -Force | Out-Null
$bgmMutex = New-Object System.Threading.Mutex($false, 'Local\DuskCrawlerBgmPublicLauncher')
$bgmAcquired = $false
try {
    $bgmAcquired = $bgmMutex.WaitOne(30000)
    if (-not $bgmAcquired) { throw 'BGM launcher is already starting. Please wait and try again.' }
    if (-not (Test-Path -LiteralPath $bgmPython)) { throw 'BGM Python runtime is missing. See bgm/BGM_README.md.' }
    # Persist only the non-secret site origin so browser-launched processes reuse it.
    $bgmOriginFile = Join-Path $bgmRoot '.workshop_origin'
    $bgmOrigin = $env:WORKSHOP_ORIGIN
    if (-not $bgmOrigin -and (Test-Path -LiteralPath $bgmOriginFile)) { $bgmOrigin = (Get-Content -LiteralPath $bgmOriginFile -Raw).Trim() }
    if (-not $bgmOrigin) { $bgmOrigin = 'http://127.0.0.1:4173' }
    $bgmOrigin = $bgmOrigin.TrimEnd('/')
    $bgmUri = [Uri]$bgmOrigin
    if (-not $bgmUri.IsAbsoluteUri -or $bgmUri.Scheme -notin @('http','https') -or -not $bgmUri.Host -or $bgmUri.AbsolutePath -ne '/' -or $bgmUri.Query -or $bgmUri.Fragment -or $bgmUri.UserInfo) { throw 'WORKSHOP_ORIGIN must be a plain http(s) origin.' }
    $env:WORKSHOP_ORIGIN = $bgmOrigin
    [IO.File]::WriteAllText($bgmOriginFile, $bgmOrigin)
    & (Join-Path $PSScriptRoot 'register_launcher.ps1')
    & (Join-Path $PSScriptRoot 'local_bgm/start_comfy.ps1') -RuntimeRoot $bgmRoot
    if (-not (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8190 -State Listen -ErrorAction SilentlyContinue)) {
        $bgmProcess = Start-Process -FilePath $bgmPython -ArgumentList @('-u', ('"' + (Join-Path $PSScriptRoot 'bgm_bridge.py') + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $bgmLogs 'bridge.stdout.log') -RedirectStandardError (Join-Path $bgmLogs 'bridge.stderr.log')
        $bgmProcess.Id | Set-Content -LiteralPath (Join-Path $bgmLogs 'bridge.pid')
    }
    $bgmReady = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $bgmHealth = Invoke-RestMethod 'http://127.0.0.1:8190/health' -TimeoutSec 4
            if ($bgmHealth.application -eq 'dusk-bgm-bridge') { $bgmReady = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if ($bgmReady -and ($bgmHealth.edition -ne 'public' -or $bgmHealth.workshopOrigin -ne $bgmOrigin)) { throw 'Port 8190 belongs to another workshop. Stop that bridge before starting this edition.' }
    if (-not $bgmReady) { throw 'BGM bridge did not become ready. Check runtime/logs/bridge.stderr.log.' }
    Write-Output ('BGM bridge ready. ComfyUI ready: ' + $bgmHealth.engineReady)
    if ($OpenPair) { Start-Process 'http://127.0.0.1:8190/pair' }
} catch {
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $bgmLogs 'launcher.error.log')
    Write-Error $_
    exit 1
} finally {
    if ($bgmAcquired) { $bgmMutex.ReleaseMutex() }
    $bgmMutex.Dispose()
}
