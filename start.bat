@echo off
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8765/"
  py -m http.server 8765
  goto :eof
)

where python >nul 2>&1
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8765/"
  python -m http.server 8765
  goto :eof
)

start "" "%~dp0index.html"
