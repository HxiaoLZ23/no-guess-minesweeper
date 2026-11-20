@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack-offline.ps1"
if errorlevel 1 exit /b %errorlevel%
