$ErrorActionPreference = 'Stop'
$bgmRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime'
$portOwner = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue
if ($portOwner) {
    Write-Output 'Port 8188 is already in use. Existing service was left running.'
    exit 0
}
$logRoot = Join-Path $bgmRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$process = Start-Process -FilePath (Join-Path $bgmRoot '.venv\Scripts\python.exe') -ArgumentList @(
    '-u', 'main.py', '--listen', '127.0.0.1', '--port', '8188',
    '--reserve-vram', '1.5', '--disable-all-custom-nodes', '--offline', '--disable-auto-launch'
) -WorkingDirectory (Join-Path $bgmRoot 'ComfyUI') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logRoot 'comfy.stdout.log') `
    -RedirectStandardError (Join-Path $logRoot 'comfy.stderr.log')
$process.Id | Set-Content -LiteralPath (Join-Path $logRoot 'comfy.pid')
Write-Output "ComfyUI starting: PID $($process.Id), http://127.0.0.1:8188"
