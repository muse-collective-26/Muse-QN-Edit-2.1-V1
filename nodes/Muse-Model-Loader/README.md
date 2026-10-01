# Muse Model Loader

[2026-09-18] Generic, hardware-aware ComfyUI loader node: one node for
MODEL + CLIP + VAE (+ up to 5 LoRAs), for any plain `diffusion_models` or
GGUF checkpoint - not tied to any one model family. Modeled visually on
`Muse-MiniMax-H3-Unified-Loader`'s canvas-drawn collapsible-section UI, but
the actual loading is genuinely generic (plain `UNETLoader` / ComfyUI-GGUF's
`UnetLoaderGGUF` / `CLIPLoader` / `VAELoader` / `LoraLoaderModelOnly`), so it
works with Krea2 or anything else that uses those same stock loaders.

## What it does

- **VRAM quality profile**: `Automatic` (detects total GPU VRAM and picks a
  tier below), `Low VRAM`, `Balanced`, or `Maximum Quality`. Each tier has its
  own MODEL slot; only configure the tiers you actually have checkpoints for.
  If the detected/requested tier has nothing configured, it falls back to the
  next tier down (or up, if nothing lower is configured either).
- **Pinned memory pool**: same control as the H3 Unified Loader's - caps
  ComfyUI's page-locked host RAM buffer (default ~40% of system RAM). Only
  ever LOWERS the cap from whatever it currently is; never raises it back up.
- **Model**: one MODEL slot per VRAM profile tier. GGUF checkpoints are
  auto-detected (prefixed `[GGUF]` in the dropdown) and routed through
  ComfyUI-GGUF's `UnetLoaderGGUF`; everything else goes through the stock
  `UNETLoader`.
- **Clip**: a shared `clip_name` + `clip_type` (defaults to `krea2`) via the
  stock `CLIPLoader`.
- **Vae**: a shared `vae_name` via the stock `VAELoader`.
- **LoRAs**: up to 5 slots (filename + strength each), applied in order via
  `LoraLoaderModelOnly`. A slot is skipped if left `(disabled)` or its
  strength is 0.
- Outputs `MODEL`, `CLIP`, `VAE`, and a `STRING` status summary (which
  profile/model/clip/vae/loras actually got used, and the detected VRAM).
- No attention/memory-patch section - deliberately left out, since it's meant
  to be used with SageAttention (or similar) already applied globally via
  ComfyUI's own launch flags, making a per-node attention toggle redundant.

## UI

Native ComfyUI widgets grouped under collapsible, colour-coded section
headers drawn directly on the node's canvas (click a header to
collapse/expand) - not a DOM overlay panel, so there's no DOM-widget sizing
class of bug to chase. See `js/muse_model_loader.js`.

## Using it with another node

Feed its `MODEL`/`CLIP`/`VAE` outputs into any node that accepts those types.
Several other nodes in this custom_nodes tree (e.g. Muse Character Sheet) have
optional override sockets for exactly this - connect this loader's outputs
there and it overrides that node's own manual model-loading widgets. Any
LoRAs configured here are already baked into the MODEL output, so they travel
with it automatically.
