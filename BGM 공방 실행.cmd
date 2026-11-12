@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bgm\start_bgm.ps1" -OpenPair
if errorlevel 1 pause
