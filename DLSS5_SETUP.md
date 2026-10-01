# DLSS5 Enhancer: additional setup required

Checked against the [upstream installation instructions](https://github.com/Blueforcer/ComfyUI-DLSS5-Enhancer#installation) on 1 October 2026. Follow upstream if requirements change.

**The Muse installer downloads the custom-node package only. That does not install the native DLSS5 runtime.** Nodes can appear in ComfyUI but fail when executed without it. Leave Muse's DLSS5 switch off until setup is complete.

## Requirements

Windows, a current NVIDIA driver, and a ComfyUI build with `comfy_api.latest` are required. Upstream reports support for RTX 30/40/50 series through its community runtime, not RTX 20 or older. RTX 30 support is experimental and requires the exact runtime components checked by upstream. This is not a claim of official NVIDIA support for every listed card.

## ComfyUI portable installation

Open Command Prompt in the portable root: the folder containing **both `python_embeded` and `ComfyUI`**, not inside `custom_nodes`.

Install the node's Python requirements with that installation's Python:

```bat
python_embeded\python.exe -m pip install -r ComfyUI\custom_nodes\ComfyUI-DLSS5-Enhancer\requirements.txt
```

Then run the upstream runtime installer:

```bat
python_embeded\python.exe ComfyUI\custom_nodes\ComfyUI-DLSS5-Enhancer\install_runtime.py
```

Read the licensing notice and confirm only if you agree. Upstream currently downloads the **DLSS 5 Visual Enhancer v3.0** runtime (approximately 467 MB download, 700 MB extracted). It expects worker protocol version 4; older runtimes are not interchangeable. The runtime comes from [Merserk/dlss5-visual-enhancer](https://github.com/Merserk/dlss5-visual-enhancer), not from Muse.

If you already have a compatible runtime, register it instead:

```bat
python_embeded\python.exe ComfyUI\custom_nodes\ComfyUI-DLSS5-Enhancer\install_runtime.py --runtime-dir "D:\DLSS 5 Visual Enhancer\bin\runtime"
```

Replace the example path with your real runtime folder. For a venv/non-portable installation, use **ComfyUI's own Python executable** and the corresponding node path, not an unrelated system Python.

Restart ComfyUI. An optional upstream smoke test is:

```bat
python_embeded\python.exe ComfyUI\custom_nodes\ComfyUI-DLSS5-Enhancer\selftest.py --frames 5 --mode "2x (Performance)"
```

Run that with no other GPU render active. Only then enable DLSS5 in the Muse workflow. A stale `runtime_dir` override in DLSS5 Settings takes precedence over automatic discovery; clear it or point it to your installed runtime.

## Troubleshooting and licensing

- OpenCV is required but intentionally omitted from upstream requirements to avoid replacing an existing OpenCV variant. If reported missing, follow [upstream troubleshooting](https://github.com/Blueforcer/ComfyUI-DLSS5-Enhancer#troubleshooting); do not blindly install conflicting OpenCV packages.
- The video-file node additionally needs PyAV and FFmpeg/FFprobe. The supplied Muse workflow uses the image-processing node.
- Antivirus can flag the native worker. Inspect the detection and verify the download's provenance; do not disable antivirus or blindly add exclusions.
- The custom-node source licence does **not** cover all runtime binaries. NVIDIA, ReShade, RenoDX and the upstream worker have separate terms. Muse does not bundle those binaries or automatically accept their licences.

The runtime installation and smoke test have not been performed by the Muse node-file installer. Installing the repository is not proof that DLSS5 works on a particular machine.
