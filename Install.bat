@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
set "MUSE_RESULT=%ERRORLEVEL%"
pause
exit /b %MUSE_RESULT%
