"""Muse Model Loader.

Generic, hardware-aware model loader: one node for MODEL + CLIP + VAE (+ up to
5 LoRAs), any plain diffusion_models/GGUF checkpoint - not tied to any one
model family.

[2026-09-18] Modeled on Muse-MiniMax-H3-Unified-Loader's proven pattern at
Andy's explicit request (VRAM quality profile with per-profile model slots,
pinned-memory pool cap, canvas-drawn collapsible section headers on real
widgets rather than a custom DOM panel - see js/muse_model_loader.js) - but
made genuinely generic rather than reused directly, since that node's actual
model loading is hard-wired to H3ModelLoaderAny (from ComfyUI-H3-Multishot),
which only knows how to load MiniMax H3's own checkpoint format. This node
loads through plain UNETLoader / ComfyUI-GGUF's UnetLoaderGGUF / CLIPLoader /
VAELoader / LoraLoaderModelOnly instead, so it works with Krea2 or anything
else that uses those same stock loaders. Attention/memory patch options were
deliberately left out per Andy's request - SageAttention is already applied
globally via this ComfyUI install's own launch flags (--use-sage-attention),
so a per-node attention section would just be redundant here.
"""
from __future__ import annotations

import logging

import folder_paths
import nodes as comfy_nodes

LOGGER = logging.getLogger(__name__)
OFF = "(disabled)"
GGUF_PREFIX = "[GGUF] "

# Same list CLIPLoader itself offers - kept in sync manually since there's no
# public constant to import; default "krea2" matches this install's main use
# case (the Character Sheet Director) without hard-coding to it.
CLIP_TYPES = [
    "stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv",
    "pixart", "cosmos", "lumina2", "wan", "hidream", "chroma", "ace", "omnigen2",
    "qwen_image", "hunyuan_image", "flux2", "ovis", "longcat_image", "cogvideox",
    "lens", "pixeldit", "ideogram4", "boogu", "krea2", "joyimage", "mage", "minimax",
]

# [2026-09-18] Same choices/semantics as the H3 Unified Loader's own pinned-
# memory control: ComfyUI hardcodes the page-locked RAM buffer ceiling at 40%
# of total system RAM: a buffer that can't be swapped out, so on a RAM-tight
# machine it competes with the model set for RAM. "Default" leaves ComfyUI's
# own value untouched; a number only ever LOWERS the cap (see load() below) -
# this control can free RAM, never claim more than ComfyUI's own ceiling.
PINNED_CHOICES = ["Default (40% of RAM)", "16 GB", "14 GB", "12 GB", "10 GB", "8 GB", "6 GB"]


def _node(name):
    cls = comfy_nodes.NODE_CLASS_MAPPINGS.get(name)
    if cls is None:
        raise RuntimeError(
            f"[MuseModelLoader] Required node '{name}' is not registered. "
            f"Check that its custom_nodes package is installed and loaded."
        )
    return cls()


def _choices(items, allow_off=True):
    values = ([OFF] if allow_off else []) + list(items)
    return values or [OFF]


def _model_files():
    """Combined diffusion_models + GGUF list, GGUF entries prefixed so
    _load_model() below can route each one to the loader that actually
    understands its format without a second combo widget."""
    names = []
    try:
        names += list(folder_paths.get_filename_list("diffusion_models"))
    except Exception:
        pass
    try:
        names += [GGUF_PREFIX + n for n in folder_paths.get_filename_list("unet_gguf")]
    except Exception:
        pass  # ComfyUI-GGUF not installed, or no gguf folder registered yet
    return names


def _load_model(filename):
    if filename.startswith(GGUF_PREFIX):
        real_name = filename[len(GGUF_PREFIX):]
        return _node("UnetLoaderGGUF").load_unet(real_name)[0]
    return _node("UNETLoader").load_unet(filename, "default")[0]


class MuseModelLoader:
    PROFILES = ("Automatic", "Low VRAM", "Balanced", "Maximum Quality")
    ORDER = ("Low VRAM", "Balanced", "Maximum Quality")

    @classmethod
    def INPUT_TYPES(cls):
        models = _choices(_model_files())
        clips = _choices(folder_paths.get_filename_list("text_encoders"))
        vaes = folder_paths.get_filename_list("vae") or ["(none found)"]
        loras = _choices(folder_paths.get_filename_list("loras"))
        lora_kw = {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}
        required = {
            "profile": (cls.PROFILES, {"default": "Automatic"}),
            "pinned_memory_cap": (PINNED_CHOICES, {"default": "Default (40% of RAM)"}),
            "low_vram_model": (models,),
            "balanced_model": (models,),
            "maximum_quality_model": (models,),
            "clip_name": (clips,),
            "clip_type": (CLIP_TYPES, {"default": "krea2"}),
            "vae_name": (vaes,),
        }
        for i in range(1, 6):
            required[f"lora_{i}"] = (loras,)
            required[f"lora_{i}_strength"] = ("FLOAT", dict(lora_kw))
        return {"required": required}

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING")
    RETURN_NAMES = ("model", "clip", "vae", "status")
    FUNCTION = "load"
    CATEGORY = "Muse Collective/Loaders"
    DESCRIPTION = (
        "Generic hardware-aware model loader: VRAM quality profile (Automatic "
        "picks Low VRAM / Balanced / Maximum Quality from detected GPU VRAM), "
        "a pinned-memory pool cap, MODEL + CLIP + VAE, and up to 5 LoRAs."
    )

    @staticmethod
    def _vram_gb():
        try:
            import torch
            if not torch.cuda.is_available():
                return 0.0
            props = torch.cuda.get_device_properties(torch.cuda.current_device())
            return round(float(props.total_memory) / (1024.0 ** 3), 2)
        except Exception as exc:
            LOGGER.warning("[MuseModelLoader] VRAM detection failed: %s", exc)
            return 0.0

    @staticmethod
    def _recommended(vram_gb):
        if vram_gb <= 12.5:
            return "Low VRAM"
        if vram_gb <= 20.5:
            return "Balanced"
        return "Maximum Quality"

    @staticmethod
    def _prefix(profile):
        return {"Low VRAM": "low_vram", "Balanced": "balanced", "Maximum Quality": "maximum_quality"}[profile]

    @classmethod
    def _select_profile(cls, requested, vram_gb, values):
        preferred = cls._recommended(vram_gb) if requested == "Automatic" else requested
        available = [p for p in cls.ORDER if values[f"{cls._prefix(p)}_model"] != OFF]
        if not available:
            raise RuntimeError(
                "Configure at least one quality profile's model "
                "(Low VRAM / Balanced / Maximum Quality)."
            )
        if preferred in available:
            return preferred, preferred
        index = cls.ORDER.index(preferred)
        lower = [p for p in available if cls.ORDER.index(p) < index]
        if lower:
            return max(lower, key=cls.ORDER.index), preferred
        higher = [p for p in available if cls.ORDER.index(p) > index]
        return min(higher, key=cls.ORDER.index), preferred

    @staticmethod
    def _apply_lora(model, filename, strength):
        if filename == OFF or strength == 0:
            return model
        return _node("LoraLoaderModelOnly").load_lora_model_only(model, filename, strength)[0]

    def load(self, **values):
        # Apply the pinned-memory pool cap before anything loads. MAX_PINNED_MEMORY
        # is a live module global read on every pin/evict check, so mutating it
        # here takes effect for this run. Only ever lowers it (never raises past
        # ComfyUI's own ceiling) - see PINNED_CHOICES comment above for why.
        pin_choice = str(values.get("pinned_memory_cap", "Default (40% of RAM)"))
        if pin_choice and pin_choice[0].isdigit():
            try:
                import comfy.model_management as mm
                cap = int(float(pin_choice.split()[0]) * (1024 ** 3))
                was_gb = float(mm.MAX_PINNED_MEMORY) / (1024 ** 3) if mm.MAX_PINNED_MEMORY > 0 else 0.0
                if mm.MAX_PINNED_MEMORY <= 0 or cap < mm.MAX_PINNED_MEMORY:
                    mm.MAX_PINNED_MEMORY = cap
                    LOGGER.info("[MuseModelLoader] pinned-memory pool capped at %s (was %.1f GB).", pin_choice, was_gb)
            except Exception as exc:
                LOGGER.warning("[MuseModelLoader] could not apply pinned-memory cap: %s", exc)

        vram_gb = self._vram_gb()
        selected, preferred = self._select_profile(values["profile"], vram_gb, values)
        prefix = self._prefix(selected)
        model_file = values[f"{prefix}_model"]
        if model_file == OFF:
            raise RuntimeError(f"The selected profile ({selected}) has no model configured.")
        if values["clip_name"] == OFF:
            raise RuntimeError("Select a CLIP/text-encoder file.")
        if values["vae_name"] == "(none found)":
            raise RuntimeError("No VAE files found - place one in your vae folder and restart ComfyUI.")

        model = _load_model(model_file)
        clip = _node("CLIPLoader").load_clip(values["clip_name"], values["clip_type"], "default")[0]
        vae = _node("VAELoader").load_vae(values["vae_name"])[0]

        enabled_loras = []
        for i in range(1, 6):
            filename = values[f"lora_{i}"]
            strength = values[f"lora_{i}_strength"]
            if filename != OFF and strength != 0:
                model = self._apply_lora(model, filename, strength)
                enabled_loras.append(f"{filename}@{strength:g}")

        source = "automatically" if values["profile"] == "Automatic" else "manually"
        status = (
            f"{selected} was {source} selected. Detected VRAM: {vram_gb:.2f} GB. "
            f"Model: {model_file}. CLIP: {values['clip_name']} ({values['clip_type']}). "
            f"VAE: {values['vae_name']}. "
            f"LoRAs: {', '.join(enabled_loras) if enabled_loras else 'none'}."
        )
        if selected != preferred:
            status += f" {preferred} was requested/recommended but not configured; using {selected}."
        LOGGER.info("[MuseModelLoader] %s", status)

        return {"ui": {"text": [status]}, "result": (model, clip, vae, status)}


NODE_CLASS_MAPPINGS = {"MuseModelLoader": MuseModelLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"MuseModelLoader": "Muse Model Loader"}
