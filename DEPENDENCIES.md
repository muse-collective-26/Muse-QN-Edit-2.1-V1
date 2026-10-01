# Workflow dependency map

| Package | Nodes used | Repository |
|---|---|---|
| Muse Qwen Image 2.1 Edit | `MuseQwenImage21Edit` | Included in `nodes` |
| Muse Model Loader | `MuseModelLoader` | Included in `nodes`; upstream https://github.com/muse-collective-26/muse-model-loader |
| KJNodes | `SetNode` | https://github.com/kijai/ComfyUI-KJNodes |
| rgthree-comfy | Image Comparer, Label | https://github.com/rgthree/rgthree-comfy |
| WAS Node Suite (Revised) | Save Text File | https://github.com/ltdrdata/was-node-suite-comfyui |
| DLSS5 Enhancer | DLSS5Settings, DLSS5EnhanceImages | https://github.com/Blueforcer/ComfyUI-DLSS5-Enhancer |

SaveImage, PreviewAny, PrimitiveStringMultiline and MarkdownNote are ComfyUI/core frontend components, not additional repositories to clone.

External packages are downloaded from their own repositories and retain their licences and installation requirements. They are not copied into this repository or relicensed as Muse code. Network access and Git for Windows are required for automatic downloads. New upstream commits can change compatibility; the installer does not pin or update existing installations.

Optional GGUF model choices in Muse Model Loader require https://github.com/city96/ComfyUI-GGUF. The supplied workflow does not select GGUF, so it is not automatically installed.
