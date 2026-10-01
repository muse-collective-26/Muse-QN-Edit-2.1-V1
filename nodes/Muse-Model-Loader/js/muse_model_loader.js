import { app } from "../../../scripts/app.js";

// [2026-09-18] Canvas-drawn collapsible section headers over real native
// widgets - copied pattern (not code) from the H3 Unified Loader's
// zzzzzz_unified_loader_final_ui.js at Andy's request ("model it on the
// unified loader same style and same look"). Deliberately avoids the whole
// DOM-widget/addDOMWidget/ResizeObserver/border-radius bug class that the
// Character Sheet Director's UI went through, since there is no separate DOM
// element here at all - everything drawn is a real LiteGraph widget row.

const NODE_NAME = "MuseModelLoader";

const GROUPS = [
  { id: "profile", title: "VRAM QUALITY PROFILE", subtitle: "Automatic detects GPU VRAM and selects one tier below", color: "#8fa5bd", fill: "rgba(55,70,88,.30)", names: ["profile"] },
  { id: "pinned", title: "PINNED MEMORY POOL", subtitle: "Page-locked RAM buffer (ComfyUI default ~40% of RAM) — lower it to free system RAM", color: "#6fbf73", fill: "rgba(34,88,40,.26)", names: ["pinned_memory_cap"] },
  { id: "model", title: "MODEL", subtitle: "Per-profile checkpoint — the selected tier feeds the model output", color: "#a970ff", fill: "rgba(75,42,112,.28)", names: ["low_vram_model", "balanced_model", "maximum_quality_model"] },
  { id: "clip", title: "CLIP", subtitle: "Shared text encoder and clip type", color: "#e5cf55", fill: "rgba(112,96,24,.26)", names: ["clip_name", "clip_type"] },
  { id: "vae", title: "VAE", subtitle: "Shared decoder", color: "#ef6477", fill: "rgba(116,39,55,.25)", names: ["vae_name"] },
  { id: "loras", title: "LoRAs", subtitle: "Up to 5 optional LoRAs, applied in order", color: "#e9ae51", fill: "rgba(119,78,21,.25)", names: ["lora_1", "lora_1_strength", "lora_2", "lora_2_strength", "lora_3", "lora_3_strength", "lora_4", "lora_4_strength", "lora_5", "lora_5_strength"] },
];

const LABELS = {
  profile: "VRAM quality profile",
  pinned_memory_cap: "Pinned memory cap",
  low_vram_model: "Low VRAM — Model",
  balanced_model: "Balanced — Model",
  maximum_quality_model: "Maximum Quality — Model",
  clip_name: "CLIP / text encoder",
  clip_type: "CLIP type",
  vae_name: "VAE",
  lora_1: "LoRA 1", lora_1_strength: "LoRA 1 strength",
  lora_2: "LoRA 2", lora_2_strength: "LoRA 2 strength",
  lora_3: "LoRA 3", lora_3_strength: "LoRA 3 strength",
  lora_4: "LoRA 4", lora_4_strength: "LoRA 4 strength",
  lora_5: "LoRA 5", lora_5_strength: "LoRA 5 strength",
};

function show(widget) {
  if (!widget?._museLoaderHidden) return;
  widget._museLoaderHidden = false;
  if (widget._museLoaderCompute === undefined) delete widget.computeSize;
  else widget.computeSize = widget._museLoaderCompute;
  if (widget._museLoaderDraw === undefined) delete widget.draw;
  else widget.draw = widget._museLoaderDraw;
}

function hide(widget) {
  if (!widget || widget._museLoaderHidden) return;
  widget._museLoaderHidden = true;
  widget._museLoaderCompute = widget.computeSize;
  widget._museLoaderDraw = widget.draw;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
}

function resize(node) {
  const width = Math.max(node.size?.[0] || 420, 420);
  const computed = node.computeSize?.() || [width, 300];
  node.setSize?.([width, Math.max(120, computed[1])]);
  app.graph?.setDirtyCanvas?.(true, true);
}

function makeHeader(node, group) {
  return {
    name: `muse_model_loader_section_${group.id}`,
    type: "muse_model_loader_section",
    value: group.title,
    options: { serialize: false },
    computeSize: (width) => [width, 44],
    draw(ctx, _drawNode, _cachedWidth, y) {
      const width = Math.max(180, node.size?.[0] || 420);
      const collapsed = !!node.properties?.muse_model_loader_collapsed?.[group.id];
      ctx.save();
      ctx.fillStyle = group.fill; ctx.strokeStyle = group.color; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(7, y + 2, width - 14, 38, 7);
      else ctx.rect(7, y + 2, width - 14, 38);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = group.color; ctx.font = "bold 12px sans-serif";
      ctx.fillText(group.title, 18, y + 16);
      ctx.fillStyle = "#9ba8b9"; ctx.font = "10px sans-serif";
      ctx.fillText(group.subtitle, 18, y + 31);
      ctx.textAlign = "right"; ctx.fillStyle = group.color; ctx.font = "bold 17px sans-serif";
      ctx.fillText(collapsed ? "▸" : "▾", width - 18, y + 25);
      ctx.restore();
    },
    mouse(event) {
      if (event.type !== "pointerdown" && event.type !== "mousedown") return false;
      const collapsed = !node.properties.muse_model_loader_collapsed[group.id];
      node.properties.muse_model_loader_collapsed[group.id] = collapsed;
      group.widgets.forEach((widget) => (collapsed ? hide(widget) : show(widget)));
      resize(node);
      return true;
    },
  };
}

function install(node) {
  if (node._museModelLoaderInstalled) return;
  node._museModelLoaderInstalled = true;
  node.properties ||= {};
  node.properties.muse_model_loader_collapsed ||= {
    profile: false, pinned: false, model: false, clip: false, vae: false, loras: false,
  };
  const native = [...(node.widgets || [])];
  const byName = new Map(native.map((widget) => [widget.name, widget]));
  for (const [name, label] of Object.entries(LABELS)) {
    if (byName.get(name)) byName.get(name).label = label;
  }
  const groupedNames = new Set(GROUPS.flatMap((group) => group.names));
  const rebuilt = native.filter((widget) => !groupedNames.has(widget.name));
  for (const group of GROUPS) {
    group.widgets = group.names.map((name) => byName.get(name)).filter(Boolean);
    rebuilt.push(makeHeader(node, group), ...group.widgets);
    if (node.properties.muse_model_loader_collapsed[group.id]) group.widgets.forEach(hide);
  }
  node.widgets = rebuilt;
  node.size[0] = Math.max(node.size[0], 420);
  setTimeout(() => resize(node), 0);
}

function restore(node) {
  setTimeout(() => {
    for (const group of GROUPS) {
      const collapsed = !!node.properties?.muse_model_loader_collapsed?.[group.id];
      group.widgets?.forEach((widget) => (collapsed ? hide(widget) : show(widget)));
    }
    resize(node);
  }, 2);
}

app.registerExtension({
  name: "Muse.ModelLoader.UI",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = created?.apply(this, arguments);
      install(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = configured?.apply(this, arguments);
      restore(this);
      return result;
    };
  },
});
