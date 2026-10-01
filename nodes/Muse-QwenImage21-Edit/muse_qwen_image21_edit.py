"""
Muse Qwen Image 2.1 Edit [2026-09-21]

Single-call image-edit node for Qwen Image 2.1 (up to 10 reference images,
<image1>...<image10> prompt tags), built to match Muse Character Sheet H3's
boxed-panel UI and DOM-widget architecture — this node is Qwen's own
official pipeline (TextEncodeQwenImage21 -> QwenImage21Cache -> KSampler ->
VAEDecode, per Comfy-Org's own "Image Edit (Qwen Image 2.1)" workflow
template subgraph) wrapped in that same visual language, not a port of any
H3-specific logic (RefMod, CUT timeline, retention markers, two-stage
sampling and live preview are H3-only and are not present here — Qwen
Image 2.1 is a still-image model, not a video one).

Reference images upload the same way Character Sheet H3's Ref 1-8 slots do
(through ComfyUI's own /upload/image endpoint, a small file-path string
kept in a JSON widget — not inline base64, which can blow past the
browser's per-entry workflow-draft autosave budget).

Ported [2026-09-21] by Claude, structure reused from Muse-CharacterSheet-H3's
muse_character_sheet_h3.py (_execute_comfy_node/_unpack_node_result/
_resolve_resolution/_load_character_image-style helpers).
"""
import json
import logging
import os
import re
import hashlib
from collections import OrderedDict

import numpy as np
import torch
from PIL import Image, ImageOps

import comfy.model_management
import folder_paths
from nodes import NODE_CLASS_MAPPINGS as GLOBAL_NODE_CLASS_MAPPINGS
from comfy_extras.nodes_resolution import AspectRatio, ASPECT_RATIOS
from comfy_execution.graph import ExecutionBlocker

log = logging.getLogger(__name__)

ASPECT_RATIO_OPTIONS = [a.value for a in AspectRatio]
CATEGORY = "Muse Collective"

# [2026-09-22] In-process per-node session store for the iterative-edit loop
# (generate -> preview -> Apply Edit -> preview -> ... -> Confirm), keyed by
# the node's own UNIQUE_ID (stable across separate executions of the same
# node instance). Same mechanism as Muse-CharacterSheet-Klein's own
# _SESSIONS: the small stuff (which action was clicked, the accumulated edit
# instruction) round-trips through state_json every click, but the actual
# image tensors are too big for that and live here instead, surviving only
# as long as this ComfyUI process keeps running (wiped by a restart, same as
# Klein's).
_SESSIONS = OrderedDict()
MAX_EDIT_SESSIONS = 4
DEFAULT_STATE = {"action": None}


def _execute_comfy_node(node_class, **kwargs):
    """Invoke a ComfyUI node's main entrypoint, whether it is a comfy_api io.ComfyNode
    (classmethod 'execute') or a legacy node (instance method named by FUNCTION)."""
    if hasattr(node_class, "execute"):
        return node_class.execute(**kwargs)
    fn_name = getattr(node_class, "FUNCTION", None)
    instance = node_class()
    if fn_name and hasattr(instance, fn_name):
        return getattr(instance, fn_name)(**kwargs)
    raise RuntimeError(f"Could not determine how to execute node {node_class!r}")


def _unpack_node_result(out):
    """Normalise a node return (io.NodeOutput, tuple, list or dict) into a tuple of outputs."""
    if out is None:
        return ()
    for attr in ("result", "args", "values", "outputs"):
        if hasattr(out, attr):
            val = getattr(out, attr)
            if callable(val):
                try:
                    val = val()
                except Exception:
                    continue
            if isinstance(val, (tuple, list)):
                return tuple(val)
    if isinstance(out, (tuple, list)):
        return tuple(out)
    if isinstance(out, dict) and isinstance(out.get("result"), (tuple, list)):
        return tuple(out["result"])
    return (out,)


def _resolve_resolution(aspect_ratio: str, megapixels: float, multiple: int):
    """Exact port of the stock ResolutionSelector node's own formula."""
    import math
    w_ratio, h_ratio = ASPECT_RATIOS[AspectRatio(aspect_ratio)]
    total_pixels = megapixels * 1024 * 1024
    scale = math.sqrt(total_pixels / (w_ratio * h_ratio))
    multiple = math.lcm(32, int(multiple))
    width = max(32, round(w_ratio * scale / multiple) * multiple)
    height = max(32, round(h_ratio * scale / multiple) * multiple)
    return width, height


def _resolve_multiplied_size(image_tensor, factor: int, multiple: int):
    """Same rounding convention as _resolve_resolution — Ref 1's own detected pixel
    size (not the canvas the model would otherwise pick) times an integer factor,
    for enhancing small images at a genuinely larger output resolution instead of
    their tiny native size."""
    import math
    height, width = image_tensor.shape[1], image_tensor.shape[2]
    multiple = math.lcm(32, int(multiple))
    out_width = max(32, round(width * factor / multiple) * multiple)
    out_height = max(32, round(height * factor / multiple) * multiple)
    return out_width, out_height


def _restore_enhance_dimensions(image, original, factor, custom_size):
    """Undo internal canvas rounding; an explicit custom canvas still wins at 1x."""
    if custom_size and factor == 1:
        return image
    height, width = original.shape[1] * factor, original.shape[2] * factor
    if image.shape[1:3] == (height, width):
        return image
    import comfy.utils
    return comfy.utils.common_upscale(
        image.movedim(-1, 1), width, height, "lanczos", "disabled"
    ).movedim(1, -1)


def _resolve_ref_path(rel: str) -> str:
    """Resolve the exact upload path; never silently substitute another image."""
    if not rel:
        return ""
    input_dir = os.path.realpath(folder_paths.get_input_directory())
    p = os.path.realpath(os.path.join(input_dir, rel))
    try:
        within = os.path.normcase(os.path.commonpath([input_dir, p])) == os.path.normcase(input_dir)
    except ValueError:
        within = False
    if not within:
        raise ValueError("Reference path must be inside ComfyUI's input folder.")
    return p if os.path.isfile(p) else ""


def _load_ref_image(entry: dict):
    if not entry or not entry.get("file"):
        return None
    file_path = _resolve_ref_path(entry["file"])
    if not file_path or not os.path.exists(file_path):
        raise ValueError(f"Reference image not found: {entry['file']}. Re-upload it; no replacement image was selected.")
    try:
        with Image.open(file_path) as source:
            img = ImageOps.exif_transpose(source)
            mode = "RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB"
            arr = np.array(img.convert(mode), dtype=np.float32) / 255.0
        return torch.from_numpy(arr).unsqueeze(0)
    except Exception as e:
        raise ValueError(f"Could not read reference {entry['file']}: {e}") from e


def _parse_refs_data(refs_data: str) -> list:
    try:
        data = json.loads(refs_data) if refs_data and refs_data.strip() else {}
    except Exception as e:
        raise ValueError("Invalid reference data. Reload the workflow or re-upload the references.") from e
    if not isinstance(data, dict):
        raise ValueError("Reference data must be an object containing refs.")
    refs = data.get("refs", [])
    if not isinstance(refs, list) or len(refs) > 10:
        raise ValueError("References must be a list of at most ten slots.")
    for i, entry in enumerate(refs, 1):
        if entry is not None and (not isinstance(entry, dict) or not isinstance(entry.get('file'), str) or not entry['file']):
            raise ValueError(f"Ref {i} has no valid uploaded file. Clear or re-upload that slot.")
    return refs


# [2026-09-21] Same mechanism as Muse-CharacterSheet-H3's own
# _resolve_ref_mentions_to_pictures — Qwen Image 2.1's own prompting
# convention wants the literal <image1>/<image2>/... tag typed inline, which
# is a stray thing to have to hand-type and easy to get wrong (off-by-one,
# forgetting a ref changed slot). This lets someone write plain "ref 1" /
# "reference 2" / "REF3" instead and resolves it to the correct <imageN> tag
# automatically. Both plain references and explicit tags use UI slot numbers;
# they are remapped once to dense encoder order. Empty references fail clearly.
_REF_MENTION_RE = re.compile(r"<image\s*(\d+)>|\bref(?:erence)?\s*#?\s*(\d+)\b", re.IGNORECASE)


def _resolve_ref_mentions(text: str, slot_mapping: dict) -> str:
    if not text:
        return text

    def _replace(m: "re.Match") -> str:
        n = int(m.group(1) or m.group(2))
        if n not in slot_mapping:
            raise ValueError(f"Prompt mentions Ref {n}, but that slot is empty. Upload it or correct the prompt.")
        return f"<image{slot_mapping[n]}>"

    return _REF_MENTION_RE.sub(_replace, text)


def _signature(refs_data, prompt, negative_prompt, aspect_ratio, megapixels, multiple,
                custom_size, reference_resolution, cfg, sampler_name, scheduler, steps):
    """Render inputs, excluding the seed so an edit can be rerolled."""
    digest = hashlib.sha256()
    for slot, entry in enumerate(_parse_refs_data(refs_data)):
        digest.update(json.dumps([slot, entry], sort_keys=True).encode())
        if entry:
            path = _resolve_ref_path(entry["file"])
            if path and os.path.isfile(path):
                with open(path, "rb") as handle:
                    for block in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(block)
    payload = (
        digest.hexdigest(), prompt, negative_prompt, aspect_ratio, round(float(megapixels), 4),
        int(multiple), bool(custom_size), int(reference_resolution), round(float(cfg), 4),
        sampler_name, scheduler, int(steps),
    )
    return hashlib.sha256(repr(payload).encode()).hexdigest()


def _upstream_signature(prompt_graph, unique_id, model, clip, vae):
    if not prompt_graph or str(unique_id) not in prompt_graph:
        return (id(model), id(clip), id(vae))
    upstream = {}

    def visit(value):
        if not isinstance(value, list) or len(value) != 2:
            return
        node_id = str(value[0])
        if node_id in upstream or node_id not in prompt_graph:
            return
        node = prompt_graph[node_id]
        upstream[node_id] = node
        for item in node.get("inputs", {}).values():
            visit(item)

    inputs = prompt_graph[str(unique_id)].get("inputs", {})
    for name in ("model", "clip", "vae"):
        visit(inputs.get(name))
    return hashlib.sha256(json.dumps(upstream, sort_keys=True).encode()).hexdigest()


def _active_refs(refs_data, mode):
    if mode == "text_to_image":
        return []
    if mode == "enhance":
        data = json.loads(refs_data or "{}")
        refs = data.get("refs", [])
        return _parse_refs_data(json.dumps({"refs": refs[:1]}))
    return _parse_refs_data(refs_data)


def _preview_ui_image(image):
    """Pushes a single image through the real PreviewImage node (same
    mechanism a plain PreviewImage node on the canvas uses) so the frontend's
    onExecuted handler gets a {filename, subfolder, type} it can render as
    this node's own live preview, independent of whatever the real `image`
    output socket is currently doing (blocked or not)."""
    PreviewImage = GLOBAL_NODE_CLASS_MAPPINGS["PreviewImage"]
    result = _execute_comfy_node(PreviewImage, images=image)
    return result["ui"]["images"][0]


class MuseQwenImage21Edit:
    @classmethod
    def IS_CHANGED(cls, refs_data="{}", mode="edit", state_json="{}", **kwargs):
        # Edit actions depend on process state and must never reuse graph-cache output.
        if mode == "edit":
            return float("nan")
        digest = hashlib.sha256()
        for entry in _active_refs(refs_data, mode):
            if entry:
                path = _resolve_ref_path(entry['file'])
                if not path:
                    return float('nan')
                with open(path, 'rb') as handle:
                    for block in iter(lambda: handle.read(1024 * 1024), b''):
                        digest.update(block)
        return digest.hexdigest()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "aspect_ratio": (ASPECT_RATIO_OPTIONS, {"default": AspectRatio.SQUARE.value}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.2, "max": 4.0, "step": 0.02, "tooltip":
                    "Only used when custom_size is on. Qwen Image 2.1's native support tops out around "
                    "2K (2048x2048, ~4 megapixels)."}),
                "multiple": ("INT", {"default": 32, "min": 8, "max": 128, "step": 4, "advanced": True}),
                "custom_size": ("BOOLEAN", {"default": False, "tooltip":
                    "Off (default): output follows Ref 1 AFTER Reference Resolution resizing, aligned to 32 pixels. "
                    "— matches Qwen's own official template. On: use aspect_ratio/megapixels/multiple "
                    "above instead. Enhance without Custom Size preserves the uploaded image dimensions. "
                    "Keep the canvas close to the reference size to reduce edit drift."}),
                "reference_resolution": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 32, "tooltip":
                    "Reference images are resized to about this many pixels squared (preserving aspect "
                    "ratio, rounded to a multiple of 32) before the text encoder and VAE see them. "
                    "0 keeps each reference at its own native size."}),
                "prompt": ("STRING", {"default": "", "multiline": True, "tooltip":
                    "Edit instruction. Reference an uploaded image as plain English — 'ref 1', "
                    "'reference 2' — and it's converted to the <image1>/<image2> tag Qwen actually "
                    "needs automatically (only for ref numbers that are actually filled). Ref 1 is "
                    "the edit target, the rest are references (an outfit, a prop, a style plate, etc)."}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True, "tooltip":
                    "Unused while cfg is 1 (Qwen's official path). Only takes effect if you raise cfg."}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 30.0, "step": 0.1, "tooltip":
                    "Keep at 1 for Qwen's official path (negative_prompt has no effect at cfg 1). "
                    "Raise it only if you're actually using a negative prompt."}),
                "sampler_name": (["euler", "euler_ancestral", "dpmpp_2m", "res_multistep"], {"default": "euler"}),
                "scheduler": (["simple", "normal", "beta", "sgm_uniform"], {"default": "simple"}),
                "steps": ("INT", {"default": 25, "min": 1, "max": 100, "tooltip":
                    "Qwen Image 2.1's official pipeline uses about 40-50 steps with euler. This node "
                    "starts at 25 (the template default) — more advanced samplers may need fewer."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "cache_device": (["auto", "gpu", "cpu", "off"], {"default": "auto", "tooltip":
                    "Qwen Image 2.1 Cache device. auto uses spare VRAM then RAM. cpu is prefetched "
                    "behind compute at little speed cost. off recomputes every step (slowest, but rules "
                    "the cache out if you're debugging)."}),
                "cache_dtype": (["default", "int8", "int4"], {"default": "default", "tooltip":
                    "Cache storage precision. default is lossless. int8 halves the cache at about bf16 "
                    "accuracy; int4 quarters it but roughly doubles per-step error."}),
                "refs_data": ("STRING", {"default": "{}", "multiline": False}),

                # --- Iterative edit loop state (appended at the true end on ---
                # purpose — widget values serialize positionally against
                # saved workflows; a mid-list insert silently shifts every
                # later widget's stored value onto the wrong slot.
                "state_json": ("STRING", {"default": json.dumps(DEFAULT_STATE), "multiline": False}),

                # --- Mode toggle (also appended at the end for the same ---
                # positional-serialization reason as state_json above.
                "mode": (["edit", "text_to_image", "enhance"], {"default": "edit", "tooltip":
                    "edit: today's full reference-image edit pipeline with the iterative "
                    "edit loop. text_to_image: no references at all, matches Comfy-Org's own "
                    "official Text to Image (Qwen Image 2.1) template exactly. enhance: "
                    "single-shot detail/clarity pass over Ref 1 only, no iterative edit loop, "
                    "sized to follow Ref 1 like a plain edit pass."}),

                # --- Enhance-mode resolution multiply (also appended at the end) ---
                "enhance_resolution_multiply": (["1x", "2x", "3x", "4x", "5x"], {"default": "1x", "tooltip":
                    "Enhance mode only. Multiplies Ref 1's own detected width/height by this "
                    "factor before rendering — useful for enhancing small images, which "
                    "otherwise render at their tiny native size. 1x preserves the uploaded image dimensions unless Custom Size is on. "
                    "Reference Resolution controls conditioning detail separately."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "prompt_graph": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    # positive/negative appended so the same conditioning used for this
    # render can be fed straight into a separate upscale KSampler without
    # re-encoding the prompt; compiled_prompt is the actual resolved text
    # (after ref-mention -> <imageN> substitution) sent to the text encoder.
    RETURN_TYPES = ("IMAGE", "CONDITIONING", "CONDITIONING", "STRING", "IMAGE")
    RETURN_NAMES = ("image", "positive", "negative", "compiled_prompt", "before_image")
    FUNCTION = "generate"
    CATEGORY = CATEGORY
    OUTPUT_NODE = True

    def _run_pipeline(self, model, clip, vae, refs, image_1_override, edit_text,
                       aspect_ratio, megapixels, multiple, custom_size, reference_resolution,
                       negative_prompt, cfg, sampler_name, scheduler, steps, seed,
                       cache_device, cache_dtype, size_override=None):
        """The actual Qwen Image 2.1 Edit pipeline (TextEncodeQwenImage21 ->
        QwenImage21Cache -> KSampler -> VAEDecode) — identical to the node's
        original single-shot generate(), just factored out so both a fresh
        base render and an Apply-Edit/reroll pass over it can share it.
        image_1_override, when given, replaces Ref 1's uploaded file with an
        already-generated tensor (the pristine base image) as the edit
        target; refs 2-10 still come from their uploaded files either way, so
        an edit instruction can still say "match ref 3". size_override, when
        given, forces an exact (width, height) canvas — used by Enhance
        mode's resolution-multiply, and takes priority over custom_size."""
        images = {}
        slot_mapping = {}
        for i, entry in enumerate(refs):
            img = image_1_override if i == 0 and image_1_override is not None else _load_ref_image(entry)
            if img is not None:
                dense_number = len(images) + 1
                images[f"image_{dense_number}"] = img
                slot_mapping[i + 1] = dense_number

        resolved_prompt = _resolve_ref_mentions(edit_text, slot_mapping)
        resolved_negative = _resolve_ref_mentions(negative_prompt, slot_mapping) if float(cfg) != 1.0 else ""
        log.info("[MuseQwenImage21Edit] Reference slot mapping: %s", slot_mapping)

        TextEncodeQwenImage21 = GLOBAL_NODE_CLASS_MAPPINGS["TextEncodeQwenImage21"]
        positive, negative, latent = _unpack_node_result(_execute_comfy_node(
            TextEncodeQwenImage21,
            clip=clip, prompt=resolved_prompt, negative_prompt=resolved_negative,
            vae=vae, resolution=int(reference_resolution), images=images,
        ))

        if size_override is not None or custom_size:
            width, height = size_override if size_override is not None else \
                _resolve_resolution(aspect_ratio, megapixels, multiple)
            EmptyLatentImage = GLOBAL_NODE_CLASS_MAPPINGS["EmptyLatentImage"]
            (latent,) = _unpack_node_result(_execute_comfy_node(
                EmptyLatentImage, width=width, height=height, batch_size=1))

        ratio = latent.get("downscale_ratio_spacial", 16)
        log.info("[MuseQwenImage21Edit] Output canvas %dx%d; references=%d; ref_resolution=%d; custom_size=%s",
                 latent["samples"].shape[-1] * ratio, latent["samples"].shape[-2] * ratio,
                 len(images), int(reference_resolution), bool(custom_size))

        cached_model = model
        QwenImage21Cache = GLOBAL_NODE_CLASS_MAPPINGS.get("QwenImage21Cache")
        if QwenImage21Cache is not None:
            (cached_model,) = _unpack_node_result(_execute_comfy_node(
                QwenImage21Cache, model=model, device=cache_device, dtype=cache_dtype))

        KSampler = GLOBAL_NODE_CLASS_MAPPINGS["KSampler"]
        (out_latent,) = _unpack_node_result(_execute_comfy_node(
            KSampler,
            model=cached_model, positive=positive, negative=negative, latent_image=latent,
            seed=int(seed), steps=int(steps), cfg=float(cfg),
            sampler_name=sampler_name, scheduler=scheduler, denoise=1.0,
        ))

        VAEDecode = GLOBAL_NODE_CLASS_MAPPINGS["VAEDecode"]
        (image,) = _unpack_node_result(_execute_comfy_node(VAEDecode, samples=out_latent, vae=vae))
        comfy.model_management.soft_empty_cache()

        return image, positive, negative, resolved_prompt

    def _run_text_to_image(self, model, clip, vae, aspect_ratio, megapixels, multiple, prompt,
                            negative_prompt, cfg, sampler_name, scheduler, steps, seed,
                            cache_device, cache_dtype):
        """Matches Comfy-Org's own official "Text to Image (Qwen Image 2.1)" template
        exactly: TextEncodeQwenImage21 called with zero images and no vae (used only for
        its positive/negative conditioning — its own latent output is unused), sized from
        a plain EmptyLatentImage built from aspect_ratio/megapixels, never from a
        reference (there isn't one)."""
        TextEncodeQwenImage21 = GLOBAL_NODE_CLASS_MAPPINGS["TextEncodeQwenImage21"]
        positive, negative, _unused_latent = _unpack_node_result(_execute_comfy_node(
            TextEncodeQwenImage21, clip=clip, prompt=prompt, negative_prompt=negative_prompt,
            resolution=1024, images={}))

        width, height = _resolve_resolution(aspect_ratio, megapixels, multiple)
        EmptyLatentImage = GLOBAL_NODE_CLASS_MAPPINGS["EmptyLatentImage"]
        (latent,) = _unpack_node_result(_execute_comfy_node(
            EmptyLatentImage, width=width, height=height, batch_size=1))

        cached_model = model
        QwenImage21Cache = GLOBAL_NODE_CLASS_MAPPINGS.get("QwenImage21Cache")
        if QwenImage21Cache is not None:
            (cached_model,) = _unpack_node_result(_execute_comfy_node(
                QwenImage21Cache, model=model, device=cache_device, dtype=cache_dtype))

        KSampler = GLOBAL_NODE_CLASS_MAPPINGS["KSampler"]
        (out_latent,) = _unpack_node_result(_execute_comfy_node(
            KSampler, model=cached_model, positive=positive, negative=negative, latent_image=latent,
            seed=int(seed), steps=int(steps), cfg=float(cfg),
            sampler_name=sampler_name, scheduler=scheduler, denoise=1.0))

        VAEDecode = GLOBAL_NODE_CLASS_MAPPINGS["VAEDecode"]
        (image,) = _unpack_node_result(_execute_comfy_node(VAEDecode, samples=out_latent, vae=vae))
        comfy.model_management.soft_empty_cache()
        return image, positive, negative, prompt

    def generate(self, model, clip, vae, aspect_ratio, megapixels, multiple, custom_size,
                 reference_resolution, prompt, negative_prompt, cfg, sampler_name, scheduler,
                 steps, seed, cache_device, cache_dtype, refs_data, state_json, mode,
                 enhance_resolution_multiply, unique_id, prompt_graph=None, extra_pnginfo=None):
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Enter a prompt before rendering.")

        if mode == "text_to_image":
            required_nodes = ("TextEncodeQwenImage21", "EmptyLatentImage", "KSampler", "VAEDecode")
            missing = [name for name in required_nodes if name not in GLOBAL_NODE_CLASS_MAPPINGS]
            if missing:
                raise RuntimeError("Update ComfyUI for Qwen Image 2.1 support. Missing nodes: " + ", ".join(missing))
            image, positive, negative, resolved_prompt = self._run_text_to_image(
                model, clip, vae, aspect_ratio, megapixels, multiple, prompt, negative_prompt,
                cfg, sampler_name, scheduler, steps, seed, cache_device, cache_dtype)
            # No reference image exists in this mode — block before_image rather than
            # faking one, so nothing wired to it (e.g. a before/after node) runs on garbage.
            return (image, positive, negative, resolved_prompt, ExecutionBlocker(None))

        if mode == "enhance":
            # Single-shot, like text_to_image — no iterative edit loop, no session, no
            # ExecutionBlocker. Reuses the same pipeline as a plain Edit-mode base render
            # (Ref 1 as the sole image, prompt as-typed) since "enhance Ref 1 with this
            # instruction, sized to follow Ref 1" IS exactly that, just without offering
            # refs 2-10 or the Apply Edit/Confirm loop in the UI.
            refs = _active_refs(refs_data, mode)
            if not refs or not refs[0]:
                raise ValueError("Upload an image to enhance first.")
            required_nodes = ("TextEncodeQwenImage21", "QwenImage21Cache", "KSampler",
                               "VAEDecode", "EmptyLatentImage")
            missing = [name for name in required_nodes if name not in GLOBAL_NODE_CLASS_MAPPINGS]
            if missing:
                raise RuntimeError("Update ComfyUI for Qwen Image 2.1 support. Missing nodes: " + ", ".join(missing))
            before_image = _load_ref_image(refs[0])
            multiply_factor = int(str(enhance_resolution_multiply).rstrip("x") or 1)
            size_override = None
            if multiply_factor > 1 or not custom_size:
                size_override = _resolve_multiplied_size(before_image, multiply_factor, multiple)
            image, positive, negative, resolved_prompt = self._run_pipeline(
                model=model, clip=clip, vae=vae, refs=refs, image_1_override=before_image, edit_text=prompt,
                aspect_ratio=aspect_ratio, megapixels=megapixels, multiple=multiple,
                custom_size=custom_size, reference_resolution=reference_resolution,
                negative_prompt=negative_prompt, cfg=cfg, sampler_name=sampler_name,
                scheduler=scheduler, steps=steps, seed=seed,
                cache_device=cache_device, cache_dtype=cache_dtype, size_override=size_override)
            image = _restore_enhance_dimensions(image, before_image, multiply_factor, custom_size)
            return (image, positive, negative, resolved_prompt, before_image)

        refs = _parse_refs_data(refs_data)
        if not refs or not refs[0]:
            raise ValueError("Ref 1 is required as the edit target. Upload an image to Ref 1.")
        required_nodes = ("TextEncodeQwenImage21", "QwenImage21Cache", "KSampler", "VAEDecode",
                           "EmptyLatentImage", "PreviewImage")
        missing = [name for name in required_nodes if name not in GLOBAL_NODE_CLASS_MAPPINGS]
        if missing:
            raise RuntimeError("Update ComfyUI for Qwen Image 2.1 support. Missing nodes: " + ", ".join(missing))
        # Always available and never blocked, even mid-edit-loop while the main outputs
        # are blocked — the original upload, so a before/after node downstream can show
        # "before" immediately without waiting for a Confirm click.
        before_image = _load_ref_image(refs[0])

        try:
            state = json.loads(state_json) if state_json else {}
        except Exception:
            state = {}
        if not isinstance(state, dict):
            state = {}
        action = state.get("action")

        sig = _signature(refs_data, prompt, negative_prompt, aspect_ratio, megapixels, multiple,
                          custom_size, reference_resolution, cfg, sampler_name, scheduler, steps)
        sig = (sig, _upstream_signature(prompt_graph, unique_id, model, clip, vae),
               cache_device, cache_dtype)
        session_key = (str(unique_id), str(state.get("session_id", "api")))
        sess = _SESSIONS.get(session_key)
        if action is not None and (sess is None or sess.get("sig") != sig):
            raise ValueError("This edit preview is stale or expired. Run a fresh base image before editing or confirming.")
        if sess is None:
            sess = {}
            _SESSIONS[session_key] = sess
        _SESSIONS.move_to_end(session_key)
        while len(_SESSIONS) > MAX_EDIT_SESSIONS:
            _SESSIONS.popitem(last=False)
        if action is None:
            sess.clear()
            sess["sig"] = sig

        pipeline_kwargs = dict(
            model=model, clip=clip, vae=vae, refs=refs,
            aspect_ratio=aspect_ratio, megapixels=megapixels, multiple=multiple,
            custom_size=custom_size, reference_resolution=reference_resolution,
            negative_prompt=negative_prompt, cfg=cfg, sampler_name=sampler_name,
            scheduler=scheduler, steps=steps, seed=seed,
            cache_device=cache_device, cache_dtype=cache_dtype,
        )

        blocked = False
        action_type = action.get("type") if isinstance(action, dict) else None

        if action is None:
            # Edit mode is a review session: only Confirm releases the result.
            image, positive, negative, resolved_prompt = self._run_pipeline(
                image_1_override=None, edit_text=prompt, **pipeline_kwargs)
            sess.update(base_image=image, edit_instruction=None, current_image=image,
                        positive=positive, negative=negative, compiled_prompt=resolved_prompt,
                        base_positive=positive, base_negative=negative, base_compiled_prompt=resolved_prompt,
                        base_seed=int(seed), current_seed=int(seed))
            blocked = True
        elif action_type == "enhance_preview":
            instruction = str(action.get("instruction") or "").strip()
            if not instruction:
                raise ValueError("Enter an enhancement instruction before enhancing the preview.")
            factor = int(str(action.get("multiply", "1x")).rstrip("x"))
            if factor not in (1, 2, 3, 4, 5):
                raise ValueError("Enhancement multiplier must be 1x to 5x.")
            # Repeated enhancement attempts use the same unenhanced preview.
            # Keep it until success so a failed attempt cannot destroy the session.
            snapshot = sess.get("pre_enhance") or {key: sess[key] for key in (
                "current_image", "positive", "negative", "compiled_prompt", "current_seed")}
            source = snapshot["current_image"]
            enhance_kwargs = dict(pipeline_kwargs, refs=[refs[0]], custom_size=False)
            image, positive, negative, resolved_prompt = self._run_pipeline(
                image_1_override=source, edit_text=instruction,
                size_override=_resolve_multiplied_size(source, factor, multiple), **enhance_kwargs)
            image = _restore_enhance_dimensions(image, source, factor, False)
            sess.update(pre_enhance=snapshot, current_image=image, current_seed=int(seed),
                        positive=positive, negative=negative, compiled_prompt=resolved_prompt,
                        enhancement=dict(instruction=instruction, multiply=factor))
            blocked = True
        elif action_type == "undo_enhance":
            snapshot = sess.get("pre_enhance")
            if snapshot is None:
                raise ValueError("There is no enhancement to undo.")
            sess.update(snapshot)
            sess.pop("pre_enhance", None)
            sess.pop("enhancement", None)
            image, positive, negative, resolved_prompt = (
                sess["current_image"], sess["positive"], sess["negative"], sess["compiled_prompt"])
            blocked = True
        elif action_type == "apply_edit":
            instruction = (action.get("instruction") or "").strip()
            if not instruction:
                raise ValueError("Type an edit instruction before clicking Apply Edit.")
            prior = sess.get("edit_instruction")
            # Anchor every edit off the SAME pristine base image every time (never the
            # previous edit's own output) and accumulate instructions into one string —
            # the fix for the color-drift/bleed bug hit on Muse-CharacterSheet-Klein when
            # edits were naively chained output-to-output (see that node's apply_edit()).
            combined = f"{prior}; {instruction}" if prior else instruction
            image, positive, negative, resolved_prompt = self._run_pipeline(
                image_1_override=sess["base_image"], edit_text=combined, **pipeline_kwargs)
            sess.update(edit_instruction=combined, current_image=image, current_seed=int(seed),
                        positive=positive, negative=negative, compiled_prompt=resolved_prompt)
            sess.pop("pre_enhance", None)
            sess.pop("enhancement", None)
            blocked = True
        elif action_type == "reroll":
            edit_instruction = sess.get("edit_instruction")
            source = sess["base_image"] if edit_instruction else None
            edit_text = edit_instruction if edit_instruction else prompt
            image, positive, negative, resolved_prompt = self._run_pipeline(
                image_1_override=source, edit_text=edit_text, **pipeline_kwargs)
            sess.update(current_image=image, positive=positive, negative=negative,
                        compiled_prompt=resolved_prompt, current_seed=int(seed))
            sess.pop("pre_enhance", None)
            sess.pop("enhancement", None)
            if not edit_instruction:
                sess.update(base_image=image, base_positive=positive, base_negative=negative,
                            base_compiled_prompt=resolved_prompt, base_seed=int(seed))
            blocked = True
        elif action_type == "reset_edit":
            # Instant — no new render needed. The pristine base image (and the
            # conditioning that was actually encoded for it, stashed separately from
            # positive/negative/compiled_prompt so an edit pass overwriting those
            # doesn't clobber the values a later revert needs) is already held in the
            # session, so reverting is just pointing current_image back at them.
            image = sess["base_image"]
            positive, negative, resolved_prompt = (
                sess.get("base_positive"), sess.get("base_negative"),
                sess.get("base_compiled_prompt", prompt))
            sess.update(edit_instruction=None, current_image=image, current_seed=sess["base_seed"],
                        positive=positive, negative=negative, compiled_prompt=resolved_prompt)
            sess.pop("pre_enhance", None)
            sess.pop("enhancement", None)
            blocked = True
        elif action_type == "confirm":
            image = sess["current_image"]
            positive, negative, resolved_prompt = (
                sess.get("positive"), sess.get("negative"), sess.get("compiled_prompt", prompt))
            blocked = False
        else:
            raise ValueError(f"Unknown edit-loop action: {action_type!r}")

        preview = _preview_ui_image(image)
        recipe = {
            "base_seed": sess["base_seed"], "seed": sess["current_seed"],
            "base_prompt": prompt, "edit_instruction": sess.get("edit_instruction"),
            "compiled_prompt": resolved_prompt, "refs": refs,
            "steps": steps, "cfg": cfg, "sampler": sampler_name, "scheduler": scheduler,
            "pending_confirmation": blocked, "enhanced": bool(sess.get("pre_enhance")),
            "enhancement": sess.get("enhancement"),
        }
        if extra_pnginfo is not None:
            extra_pnginfo.setdefault("muse_qwen21", {})[str(unique_id)] = recipe
        ui = {"mquwen21_preview": [preview], "mquwen21_recipe": [recipe]}

        if blocked:
            return {"ui": ui, "result": (ExecutionBlocker(None), ExecutionBlocker(None),
                                          ExecutionBlocker(None), ExecutionBlocker(None), before_image)}
        return {"ui": ui, "result": (image, positive, negative, resolved_prompt, before_image)}


NODE_CLASS_MAPPINGS = {"MuseQwenImage21Edit": MuseQwenImage21Edit}
NODE_DISPLAY_NAME_MAPPINGS = {"MuseQwenImage21Edit": "Muse Qwen Image 2.1 Edit"}
