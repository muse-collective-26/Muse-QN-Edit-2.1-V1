@echo off
setlocal
set "MUSE_INSTALLER_SELF=%~f0"
set "MUSE_INSTALLER_CHECK=%~1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:MUSE_INSTALLER_SELF); & ([scriptblock]::Create(($s -split '(?m)^# POWERSHELL_PAYLOAD\r?$',2)[1]))"
set "MUSE_RESULT=%ERRORLEVEL%"
if not "%~1"=="--check" pause
exit /b %MUSE_RESULT%
# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
try {
    $target = [IO.Path]::GetDirectoryName($env:MUSE_INSTALLER_SELF)
    if ((Split-Path $target -Leaf) -ne 'custom_nodes' -or !(Test-Path -LiteralPath (Join-Path (Split-Path $target -Parent) 'main.py'))) {
        throw 'Place this BAT directly inside ComfyUI\custom_nodes, then double-click it.'
    }
    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Install Git for Windows from https://git-scm.com/download/win, then run this again.'
    }
    Write-Host 'Muse QN Edit 2.1 V1 - GitHub installer'
    Write-Host 'Downloads the published Muse package plus missing workflow dependencies.'
    Write-Host 'Existing nodes are skipped. No model weights or LoRAs are downloaded.'
    Write-Host 'Python dependencies are separate: use ComfyUI Manager if required.'
    Write-Host 'Qwen model use is research/evaluation only unless separately licensed.'
    $checkOnly = $env:MUSE_INSTALLER_CHECK -eq '--check'
    if (!$checkOnly -and (Read-Host 'Close ComfyUI first. Download installer from GitHub? [y/N]') -notmatch '^(y|yes)$') {
        Write-Host 'Cancelled. Nothing changed.'; exit 0
    }
    $download = Join-Path ([IO.Path]::GetTempPath()) ('Muse-QN-Download-' + [guid]::NewGuid().ToString('N'))
    & git -c core.longpaths=true clone --depth 1 --branch main -- 'https://github.com/muse-collective-26/Muse-QN-Edit-2.1-V1.git' $download
    if ($LASTEXITCODE -ne 0) { throw "Download failed. Any partial download is at $download" }
    $installer = Join-Path $download 'Install.ps1'
    if (!(Test-Path -LiteralPath $installer)) { throw 'Downloaded repository is missing Install.ps1' }
    Write-Host "Downloaded repository: $download"
    Write-Host 'Temporary download retained for inspection. No existing files are deleted.'
    if ($checkOnly) {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $installer -TargetPath $target -CheckOnly
    } else {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $installer -TargetPath $target
    }
    exit $LASTEXITCODE
} catch { Write-Host "ERROR: $_"; exit 1 }
