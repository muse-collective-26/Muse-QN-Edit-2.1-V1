param([string]$TargetPath, [switch]$CheckOnly)
if (!$TargetPath) { $TargetPath = Read-Host 'Full path to your ComfyUI custom_nodes folder' }
$target = [IO.Path]::GetFullPath($TargetPath.Trim([char]34))
$ErrorActionPreference = 'Stop'
$packages = @(
    @{name='Muse-QwenImage21-Edit'; repo=''; marker='muse_qwen_image21_edit.py'; aliases=@()},
    @{name='Muse-Model-Loader'; repo=''; marker='muse_model_loader.py'; aliases=@()},
    @{name='ComfyUI-KJNodes'; repo='https://github.com/kijai/ComfyUI-KJNodes.git'; marker=''; aliases=@('comfyui-kjnodes')},
    @{name='rgthree-comfy'; repo='https://github.com/rgthree/rgthree-comfy.git'; marker=''; aliases=@()},
    @{name='was-node-suite-comfyui'; repo='https://github.com/ltdrdata/was-node-suite-comfyui.git'; marker='WAS_Node_Suite.py'; aliases=@('was-ns','ComfyUI-WAS-Node-Suite')},
    @{name='ComfyUI-DLSS5-Enhancer'; repo='https://github.com/Blueforcer/ComfyUI-DLSS5-Enhancer.git'; marker=''; aliases=@()}
)
function Normalize-Repo([string]$url) { return (($url.Trim().TrimEnd('/') -replace '\.git$','') -replace '^git@github.com:','https://github.com/').ToLowerInvariant() }
try {
    if ((Split-Path $target -Leaf) -ne 'custom_nodes' -or !(Test-Path -LiteralPath (Join-Path (Split-Path $target -Parent) 'main.py'))) {
        throw 'Select a real ComfyUI custom_nodes folder (with main.py in its parent).'
    }
    Write-Host "Muse Qwen Edit 2.1 - custom-node files installer`nTarget: $target"
    Write-Host 'No models, LoRAs, updates, Python packages or server restarts. Existing folders are skipped.'
    Write-Host 'DLSS5 NEEDS EXTRA SETUP: its native runtime is NOT installed by this script.'
    Write-Host 'Instructions: https://github.com/muse-collective-26/Muse-QN-Edit-2.1-V1/blob/main/DLSS5_SETUP.md'
    $git = Get-Command git -ErrorAction SilentlyContinue
    $existing = @(Get-ChildItem -LiteralPath $target -Directory)
    $missing = @()
    foreach ($p in $packages) {
        $match = $existing | Where-Object {
            $dir = $_
            if ($dir.Name -eq $p.name -or $p.aliases -contains $dir.Name) { return $true }
            if ($p.marker -and (Test-Path -LiteralPath (Join-Path $dir.FullName $p.marker))) { return $true }
            if ($git -and $p.repo -and (Test-Path -LiteralPath (Join-Path $dir.FullName '.git'))) {
                $remote = & git -C $dir.FullName remote get-url origin 2>$null
                if ($LASTEXITCODE -eq 0 -and (Normalize-Repo "$remote") -eq (Normalize-Repo $p.repo)) { return $true }
            }
            return $false
        } | Select-Object -First 1
        if ($match) { Write-Host "SKIP: $($p.name) - existing folder $($match.Name)" }
        else { $missing += $p; Write-Host "MISSING: $($p.name)" }
    }
    if ($checkOnly) { Write-Host 'Check only: no files changed and no downloads started.'; exit 0 }
    if (!$git -and @($missing | Where-Object repo).Count) { throw 'Git for Windows is required. Install it from https://git-scm.com/download/win and run this again.' }
    if (!$missing.Count) { Write-Host 'All six node packages already exist. Nothing changed.'; exit 0 }
    Write-Host 'Close ComfyUI before installing. These are third-party node repositories.'
    if ((Read-Host 'Download/copy the missing node folders now? [y/N]') -notmatch '^(y|yes)$') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }
    $failures = 0
    foreach ($p in $missing) {
        $stage = Join-Path ([IO.Path]::GetTempPath()) ('MuseNodeInstall-' + [guid]::NewGuid().ToString('N'))
        try {
            if ($p.repo) {
                & git -c core.longpaths=true clone --depth 1 -- $p.repo $stage
                if ($LASTEXITCODE -ne 0) { throw 'Git clone failed' }
            } else {
                $bundled = Join-Path $PSScriptRoot ('nodes/' + $p.name)
                if (!(Test-Path -LiteralPath (Join-Path $bundled '__init__.py'))) { throw 'Bundled node folder is missing; extract the complete repository ZIP' }
                Copy-Item -LiteralPath $bundled -Destination $stage -Recurse
            }
            $destination=Join-Path $target $p.name
            if (Test-Path -LiteralPath $destination) { throw 'Destination appeared during install; refusing to overwrite it' }
            Move-Item -LiteralPath $stage -Destination $destination
            Write-Host "INSTALLED: $($p.name)"
        } catch {
            $failures++
            Write-Host "FAILED: $($p.name): $_"
            Write-Host "Any incomplete download remains outside custom_nodes at: $stage"
        }
    }
    Write-Host '`nNode-file installation finished. Existing installations were not updated.'
    Write-Host 'IMPORTANT: This does NOT install Python dependencies. Use ComfyUI Manager to install/fix dependencies for newly added packages, then restart ComfyUI.'
    Write-Host 'Your ComfyUI must already support Qwen Image 2.1. Model and LoRA files are separate downloads.'
    if ($failures) { exit 1 }
    exit 0
} catch { Write-Host "ERROR: $_"; exit 1 }
