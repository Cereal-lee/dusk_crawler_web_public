$ErrorActionPreference = 'Stop'
$bgmRoot = Join-Path $PSScriptRoot 'runtime'
& (Join-Path $PSScriptRoot 'local_bgm/start_comfy.ps1')
if (-not (Get-NetTCPConnection -LocalPort 8190 -State Listen -ErrorAction SilentlyContinue)) {
 Start-Process -FilePath (Join-Path $bgmRoot '.venv\Scripts\python.exe') -ArgumentList @('-u', ('"' + (Join-Path $PSScriptRoot 'bgm_bridge.py') + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $bgmRoot 'logs\bridge.stdout.log') -RedirectStandardError (Join-Path $bgmRoot 'logs\bridge.stderr.log')
}
