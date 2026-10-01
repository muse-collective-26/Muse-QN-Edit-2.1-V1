# Model files and licensing — checked 1 October 2026

## Exact files selected in the supplied workflow

| File | Destination | Source |
|---|---|---|
| `qwen_image_2.1_int8_convrot.safetensors` | `ComfyUI/models/diffusion_models` | [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) |
| `qwen3vl_8b_int8_convrot.safetensors` | `ComfyUI/models/text_encoders` | [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) |
| `texture_fix_vae_for_qwen_image_2.1_bf16.safetensors` | `ComfyUI/models/vae` | [madebyollin/texture-fix-vae-for-qwen-image-2.1](https://huggingface.co/madebyollin/texture-fix-vae-for-qwen-image-2.1) |
| `elusarcas-qwen2-1-detailer-v1.safetensors` (optional; disabled in public example) | `ComfyUI/models/loras` | [reverentelusarca/elusarcas-qwen-2.1-detail-enhancer-lora](https://huggingface.co/reverentelusarca/elusarcas-qwen-2.1-detail-enhancer-lora) |

These are filename/source matches, not a checksum certification of the local weight files. No weights are bundled or automatically downloaded. The standard Qwen VAE is a different file from the selected texture-fix VAE; do not silently substitute one while claiming the same tested setup.

## Primary licensing references

- [Qwen's official Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE), release date 20 September 2026: sections 1(i) and 2 restrict use to research/evaluation absent a separate commercial licence. Commercial licensing contact: `model-business@notice.qwencloud.com`.
- [Comfy-Org model card](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/README.md) labels its repackaged distribution `qwen-research` and links the official licence.
- [Texture-fix VAE licence](https://huggingface.co/madebyollin/texture-fix-vae-for-qwen-image-2.1/blob/main/LICENSE) also contains the Qwen Research License; retain its author's [NOTICE](https://huggingface.co/madebyollin/texture-fix-vae-for-qwen-image-2.1/blob/main/NOTICE) if redistributing that material.
- The optional detail LoRA model card inspected does not establish a separate commercial permission. Check its author's terms and the base-model restrictions before use. It is not redistributed here.

Do not describe the entire stack as Apache-2.0 or commercially unrestricted. Conversely, the restriction on model use is not a blanket statement that every dependency or every generated image has the same licence. Output rights, third-party rights and permission to operate the model are distinct questions. Seek qualified advice for your intended commercial use.

No upstream weights or inference implementation are vendored here. The Muse node invokes the installed ComfyUI implementation. Linking these licences does not replace the obligations that apply if you later redistribute Qwen materials.
