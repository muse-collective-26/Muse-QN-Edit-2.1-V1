# Muse QN Edit 2.1 — Version 1

Muse Collective's ComfyUI interface for **Qwen Image 2.1**, with Muse Model Loader. This is an independent community project, not an official Qwen release.

## Read this before use: model restrictions

**Qwen Image 2.1 is licensed for research/evaluation use only unless you obtain a separate commercial licence from Qwen.** Do not assume older Qwen models' licences apply to 2.1. The Comfy-Org repackaged model and the texture-fix VAE point to the Qwen Research License. This repository does not grant permission to use those models commercially.

Read [model files and licensing](MODEL_FILES_AND_LICENSING.md) before downloading anything. Model weights, LoRAs, reference images and generated outputs are not distributed here. This is a licensing summary, not legal advice. For paid services, client work, commercial training or monetised demonstrations, clarify the intended use with the model licensor rather than treating this wrapper as permission.

## Included Muse nodes

- `nodes/Muse-QwenImage21-Edit`: editing with up to ten reference images, text-to-image and enhancement modes; preview/edit/confirm interface; mode-sensitive controls and full-image reference thumbnails with dimensions.
- `nodes/Muse-Model-Loader`: MODEL / CLIP / VAE loading, VRAM profiles and optional LoRA slots. The loader is copied from the local version used by the supplied workflow. Its [existing upstream repository](https://github.com/muse-collective-26/muse-model-loader) remains separate.

Other workflow packages are dependencies, not Muse-authored code: KJNodes, rgthree-comfy, WAS Node Suite (Revised), and DLSS5 Enhancer. See [dependencies](DEPENDENCIES.md).

## Installation

**DLSS5 requires an extra native runtime installation, not just the node download. Follow [DLSS5 setup](DLSS5_SETUP.md) before enabling it.** The installer does not download that runtime or accept its separate licence.

### Standalone download installer

Download [Install_Muse_Qwen_Edit_21_Nodes.bat](https://github.com/muse-collective-26/Muse-QN-Edit-2.1-V1/releases/download/v1.0.0/Install_Muse_Qwen_Edit_21_Nodes.bat), place it directly inside `ComfyUI/custom_nodes`, close ComfyUI and double-click it. Requires Git for Windows. It downloads this repository and runs its installer against that folder; no Muse runtime is embedded in the BAT. Confirm the download and then the missing packages to install. Existing packages are skipped, not updated. Python requirements still need ComfyUI Manager if missing. The temporary repository download is retained for inspection.

### ZIP/manual option

Close ComfyUI first. Download this repository ZIP and extract it outside `custom_nodes`. Run `Install.bat`, then paste the full path to your ComfyUI `custom_nodes` folder. Git for Windows is required to download missing third-party packages.

The installer copies the two included Muse node folders and clones missing external dependencies. Existing folders are skipped, including common alternate folder names. It does not overwrite/update existing nodes, download weights, install Python dependencies, restart ComfyUI, or change GPU packages. Partial downloads stay in a temporary folder, not in `custom_nodes`.

Use ComfyUI Manager to resolve Python dependencies for newly installed packages using ComfyUI's own Python environment. Do not run system-wide pip or blindly replace PyTorch/CUDA. Restart ComfyUI afterwards.

This is a **multi-package distribution repository**: do not just clone its root into `custom_nodes` and expect the nested packages to load. Alternatively copy each folder under `nodes` directly into `custom_nodes` and install the dependencies manually.

## Requirements and workflow

Use a ComfyUI build that includes `TextEncodeQwenImage21`, `QwenImage21Cache`, and the Qwen Image 2.1 model/encoder support. This wrapper cannot add model support to older ComfyUI builds. RAM/VRAM demand depends on model precision, references and output resolution; no universal minimum or speed guarantee is claimed.

Import `workflows/Muse_QN_Edit_2.1_V1.json`. Reference uploads, transient edit state and output previews have been cleared. Upload your own images before editing. Select installed models in Muse Model Loader. The example LoRA is disabled in this distributable workflow; no LoRA is necessary just to install the nodes.

Edit: Ref 1 is the edit target; other references provide additional content. Enter an edit instruction, generate, optionally Apply Edit to the preview, then Confirm to send the chosen result downstream. Text-to-image uses no references. Enhance operates on an input image. An enhancement can alter details/identity; compare the output instead of assuming faithful restoration.

DLSS5 is disabled in the supplied workflow, but its nodes are retained, so its package is listed for loading the complete graph. Review that project's own additional requirements before enabling it. GGUF support is optional and requires ComfyUI-GGUF; the supplied workflow uses safetensors, not GGUF.

## Safety, support and release status

Custom nodes execute code with your user privileges. Review upstream repositories before installing. Have rights/consent for reference images. Avoid uploading private local references in shared workflows. Back up working workflows before updating dependencies. No telemetry, model downloads or external inference service is added by this packaging step.

Version 1 packages the current local runtime; syntax and dependency mapping are checked, but a clean-machine installation has not been verified. Existing installations may contain older versions: skip-existing does not mean version compatibility was checked. Do not report a clean installation as tested until it has actually been run.

Original Muse code is licensed under MIT, matching Muse's existing Director and Unified Loader repositories. See `LICENSE` and `NOTICE`. This does not override Qwen's research-only model terms. Third-party packages and weights retain their own terms.
