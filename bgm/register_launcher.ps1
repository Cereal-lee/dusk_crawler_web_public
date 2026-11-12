# Per-user URL handler; never interpolate the incoming URL into a command.
$bgmScheme = 'HKCU:\Software\Classes\dusk-bgm-public'
New-Item -Path $bgmScheme -Force | Out-Null
Set-Item -Path $bgmScheme -Value 'URL:Dusk Crawler BGM Public'
New-ItemProperty -Path $bgmScheme -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path ($bgmScheme + '\shell\open\command') -Force | Out-Null
$bgmScript = Join-Path $PSScriptRoot 'start_bgm.ps1'
$bgmCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $bgmScript + '" -OpenPair'
Set-Item -Path ($bgmScheme + '\shell\open\command') -Value $bgmCommand
