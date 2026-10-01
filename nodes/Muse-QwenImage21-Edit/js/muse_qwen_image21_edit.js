import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// [2026-09-21] Boxed-panel visual language ported from Muse-CharacterSheet-H3's
// own CSS (injectStyles) — same layout, same look, different class prefix
// ("musequwen21-") so both nodes' stylesheets can coexist on the same page
// without colliding. Qwen Image 2.1 is a still-image edit model, not a
// video one: no CUT timeline, no chunk system, no RefMod, no two-stage
// sampling, no live per-step preview — those are all H3-specific machinery
// this node has no use for. What's kept: the boxed settings-panel look, the
// Ref-image upload grid (simplified — no per-ref description/retention,
// since Qwen just wants <image1>..<image10> tags typed into one prompt).

const HIDDEN_WIDGET_NAMES = ["refs_data", "state_json"];
const BOXED_WIDGET_NAMES = [
  "aspect_ratio", "megapixels", "multiple", "custom_size",
  "reference_resolution", "prompt", "negative_prompt", "cfg",
  "sampler_name", "scheduler", "steps", "seed", "control_after_generate",
  "cache_device", "cache_dtype", "mode", "enhance_resolution_multiply",
];
const MAX_REFS = 10;
const ENHANCE_DEFAULT_PROMPT = "Enhance this image to high resolution with rich fine details. "
  + "Sharpen textures and surfaces, add natural microdetails, and improve clarity and definition "
  + "across the image while preserving the original composition, lighting, atmosphere, and visual "
  + "style. The input may be an illustration or a real photograph; preserve the original style.";

function enableQwenCanvasZoom(root) {
  // DOM panels cover the canvas. Forward ordinary wheel/pinch gestures using
  // Comfy's own zoom handler and pointer coordinates, never a custom zoom scale.
  root.addEventListener('wheel', event => {
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const text = event.target?.closest?.('textarea');
      if (text && text.scrollHeight > text.clientHeight) {
        const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? text.clientHeight : 1;
        text.scrollTop += event.deltaY * factor;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const canvas = app?.canvas?.canvas;
    if (!canvas || canvas === root) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaX:event.deltaX, deltaY:event.deltaY, deltaZ:event.deltaZ,
      deltaMode:event.deltaMode, clientX:event.clientX, clientY:event.clientY,
      screenX:event.screenX, screenY:event.screenY, ctrlKey:event.ctrlKey,
      shiftKey:event.shiftKey, altKey:event.altKey, metaKey:event.metaKey,
      bubbles:true, cancelable:true,
    }));
  }, {passive:false, capture:true});
}

const ICON_UPLOAD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

function injectStyles() {
  if (document.getElementById("musequwen21-styles")) return;
  const style = document.createElement("style");
  style.id = "musequwen21-styles";
  style.textContent = `
  .musequwen21-root {
    display: flex; flex-direction: column; gap: 14px;
    background: linear-gradient(180deg, #10141c 0%, #0a0c12 100%);
    border: 1px solid #303b50; border-radius: 14px;
    padding: 14px; box-sizing: border-box; width: 100%;
    height: fit-content; flex: 0 0 auto; align-self: flex-start;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #e4e4ea; font-size: 14px; line-height: 1.45;
    box-shadow: 0 18px 55px rgba(0,0,0,.32);
  }
  .musequwen21-header {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    min-height: 42px; padding: 2px 6px 8px; border-bottom: 1px solid #253044;
  }
  .musequwen21-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .musequwen21-brand-mark {
    display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px;
    border-radius: 8px; color: #ffe9c2; font-size: 18px;
    background: #2e1a04; box-shadow: 0 0 20px rgba(120,70,10,.5);
  }
  .musequwen21-brand-title { color: #f4f1fa; font-size: 19px; font-weight: 750; letter-spacing: -.01em; }

  .musequwen21-main-grid { display: flex; align-items: flex-start; gap: 16px; width: 100%; box-sizing: border-box; }
  .musequwen21-left-col {
    display: flex; flex-direction: column; gap: 12px;
    flex: 0 0 33%; max-width: 33%; min-width: 320px; box-sizing: border-box;
  }
  .musequwen21-right-col { display: flex; flex-direction: column; gap: 12px; flex: 1 1 0%; min-width: 0; box-sizing: border-box; }
  /* Enhance mode only: stretch the right column to match the (taller) left column's
     height, so the enhance-slot's own flex:1 has actual extra space to expand into
     instead of leaving a gap below it. Edit/Text-to-Image leave the default
     flex-start behavior alone, since their right-column content isn't meant to fill
     the full height. */
  .musequwen21-right-col.musequwen21-stretch-col { align-self: stretch; }
  .musequwen21-output-col {
    display: flex; flex-direction: column; gap: 12px;
    flex: 0 0 30%; max-width: 30%; min-width: 300px; box-sizing: border-box;
  }
  .musequwen21-box-output { --musequwen21-accent: #ed9b3a; --musequwen21-accent-soft: rgba(180,110,24,.30); border-color: #8c5b25; }
  .musequwen21-output-preview {
    position: relative; width: 100%; min-height: 560px; aspect-ratio: 3 / 4; border-radius: 8px; overflow: hidden;
    background: #05060a; border: 1px solid #2b3748;
  }
  .musequwen21-output-preview img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center;
  }
  .musequwen21-output-placeholder {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #4a4a58; font-size: 12.5px; text-align: center; padding: 12px;
  }
  .musequwen21-output-seedrow {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin-top: 10px; font-size: 12px; color: #8a8a9a;
  }
  .musequwen21-output-btn {
    width: 100%; box-sizing: border-box; min-height: 34px; padding: 7px; margin-top: 8px;
    border-radius: 6px; border: 1px solid #3f3f46; cursor: pointer; font-size: 12.5px; font-weight: 700;
  }
  .musequwen21-output-btn:disabled { opacity: .5; cursor: default; }
  .musequwen21-btn-seed { background: #1d2a3f; color: #9dc2ff; border-color: #2f4a6e; }
  .musequwen21-btn-seed:hover:not(:disabled) { background: #26375233; }
  .musequwen21-btn-apply { background: #4c1d95; color: #ede9fe; border-color: #a78bfa; }
  .musequwen21-btn-apply:hover:not(:disabled) { background: #5b23b3; }
  .musequwen21-btn-reset { background: #2a2a30; color: #d4d4d8; border-color: #46464e; font-weight: 600; }
  .musequwen21-btn-reset:hover:not(:disabled) { background: #35353d; }
  .musequwen21-btn-confirm { background: #6b3a1a; color: #f4ddc4; border-color: #c2793f; min-height: 40px; font-size: 13.5px; }
  .musequwen21-btn-confirm:hover:not(:disabled) { background: #82471f; }
  .musequwen21-output-edit-input {
    width: 100%; box-sizing: border-box; margin-top: 10px; padding: 7px; border-radius: 6px;
    border: 1px solid #3f3f46; background: #0b0b0d; color: #d4d4d8; font-size: 12.5px; font-family: inherit;
  }
  .musequwen21-output-status { margin-top: 10px; font-size: 12px; color: #708096; line-height: 1.4; min-height: 16px; }

  .musequwen21-box {
    width: 100%; box-sizing: border-box;
    background: linear-gradient(145deg, rgba(22,30,43,.98), rgba(14,21,32,.98));
    border: 1px solid #2b374b; border-radius: 10px; padding: 14px 16px; position: relative; overflow: hidden;
  }
  .musequwen21-box::before {
    content: ""; position: absolute; inset: 0 0 auto; height: 42px; pointer-events: none;
    background: linear-gradient(90deg, var(--musequwen21-accent-soft, rgba(112,78,187,.32)), transparent 85%);
  }
  .musequwen21-box-mode { --musequwen21-accent: #6da8ed; --musequwen21-accent-soft: rgba(24,90,166,.30); border-color: #355c8c; }
  .musequwen21-box-resolution { --musequwen21-accent: #58ddd4; --musequwen21-accent-soft: rgba(27,142,137,.28); border-color: #287a78; }
  .musequwen21-box-sampling { --musequwen21-accent: #f3a536; --musequwen21-accent-soft: rgba(180,96,24,.30); border-color: #8c5b25; }
  .musequwen21-box-refsettings { --musequwen21-accent: #9b79ee; --musequwen21-accent-soft: rgba(112,78,187,.32); border-color: #64519a; }
  .musequwen21-box-cache { --musequwen21-accent: #ed6da8; --musequwen21-accent-soft: rgba(166,48,104,.30); border-color: #834568; }
  .musequwen21-box-title {
    position: relative; min-height: 32px; display: flex; align-items: center; gap: 8px;
    color: var(--musequwen21-accent, #a9b4c8); font-size: 16px; letter-spacing: .055em;
    text-transform: uppercase; font-weight: 700;
  }
  .musequwen21-title-index {
    display: inline-grid; place-items: center; width: 28px; height: 28px;
    border-radius: 5px; color: #fff; background: var(--musequwen21-accent, #6d778a);
    font-size: 13px; font-weight: 800;
  }
  .musequwen21-box-row {
    position: relative; min-height: 34px; display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.045);
  }
  .musequwen21-box-row:first-of-type { border-top: none; }
  .musequwen21-box-row label { font-size: 15px; color: #d8dce5; white-space: nowrap; }
  .musequwen21-box-select, .musequwen21-box-number {
    background: rgba(7,12,20,.55); border: 1px solid #2b3748; border-radius: 6px; color: #e4e4ea;
    font-size: 15px; padding: 5px 7px; max-width: 62%; box-sizing: border-box; min-height: 34px;
  }
  .musequwen21-box-select option { background: #1a1a22; color: #e4e4ea; }
  .musequwen21-box-select:focus, .musequwen21-box-number:focus { outline: none; border-color: #4F8EF7; }
  .musequwen21-box-checkbox {
    appearance: none; width: 36px; height: 20px; border-radius: 20px; background: #3a4351;
    position: relative; transition: .16s ease; cursor: pointer; flex: 0 0 auto;
  }
  .musequwen21-box-checkbox::after {
    content: ""; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px;
    border-radius: 50%; background: #e8edf5; transition: .16s ease;
  }
  .musequwen21-box-checkbox:checked { background: #c34483; }
  .musequwen21-box-checkbox:checked::after { transform: translateX(16px); }

  .musequwen21-prompt-box {
    background: linear-gradient(145deg, rgba(17,24,36,.96), rgba(10,17,27,.98));
    border: 1px solid #334056; border-radius: 10px; padding: 12px; box-sizing: border-box;
  }
  .musequwen21-prompt-label { color: #7bdbe0; font-size: 13.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .055em; margin-bottom: 6px; }
  .musequwen21-prompt-input {
    width: 100%; box-sizing: border-box; background: rgba(7,12,20,.45); border: 1px solid #2b3a4e;
    border-radius: 8px; color: #e4e4ea; padding: 10px 12px; font-size: 15px; resize: vertical;
    min-height: 90px; font-family: inherit; line-height: 1.5;
  }
  .musequwen21-prompt-input:focus { outline: none; border-color: #4F8EF7; }
  .musequwen21-prompt-hint { margin-top: 6px; color: #708096; font-size: 12.5px; line-height: 1.4; }

  .musequwen21-reference-workspace {
    background: linear-gradient(145deg, rgba(17,24,36,.96), rgba(10,17,27,.98));
    border: 1px solid #334056; border-radius: 10px; padding: 12px; box-sizing: border-box;
  }
  .musequwen21-reference-title {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin-bottom: 8px; color: #69e0df; font-size: 13.5px; font-weight: 750;
    letter-spacing: .055em; text-transform: uppercase;
  }
  .musequwen21-ref-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .musequwen21-ref-slot {
    min-width: 0; min-height: 260px; background: rgba(10,18,28,.72); border: 1px dashed #D1A6FA;
    border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 5px; cursor: pointer; position: relative; transition: all 0.15s ease; box-sizing: border-box;
    margin-bottom: 22px;
  }
  .musequwen21-ref-slot:hover { border-color: #4F8EF7; background: rgba(16,20,30,.85); }
  .musequwen21-ref-slot.musequwen21-filled {
    border-style: solid; border-color: #B26BF7; box-shadow: 0 0 0 1px rgba(178,107,247,0.2);
    justify-content: flex-start;
  }
  .musequwen21-ref-label {
    position: absolute; top: 4px; left: 5px; font-size: 10px; font-weight: 700;
    color: #fff; background: rgba(0,0,0,0.55); border-radius: 4px; padding: 1px 4px;
    z-index: 2; pointer-events: none;
  }
  .musequwen21-ref-tag {
    position: absolute; top: 4px; right: 24px; font-size: 9.5px; font-weight: 700;
    color: #ffe9c2; background: rgba(120,70,10,0.65); border-radius: 4px; padding: 1px 4px;
    z-index: 2; pointer-events: none;
  }
  .musequwen21-ref-placeholder { color: #4a4a58; font-size: 12px; text-align: center; line-height: 1.4; }
  .musequwen21-ref-preview { position: relative; width: 100%; flex: 1 0 160px; min-height: 160px; border-radius: 6px; overflow: hidden; background: #0a0a0d; margin-top: 15px; }
  .musequwen21-ref-preview img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; }
  .musequwen21-ref-dimensions {
    position: absolute; top: calc(100% + 4px); left: 0; width: 100%;
    color: #9caec3; font-size: 11px; line-height: 16px; text-align: center;
    font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none;
  }
  .musequwen21-ref-del {
    position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%;
    background: rgba(0,0,0,0.6); color: #fff; border: none; display: flex; align-items: center;
    justify-content: center; cursor: pointer; z-index: 3; font-size: 12.5px; line-height: 1;
  }
  .musequwen21-ref-del:hover { background: #d33; }
  .musequwen21-reference-help { margin: 8px 2px 0; color: #708096; font-size: 12.5px; line-height: 1.45; }
  .musequwen21-enhance-workspace { flex: 1 1 auto; display: flex; flex-direction: column; }
  .musequwen21-enhance-slot { flex: 1 1 auto; min-height: 480px; }
  .musequwen21-enhance-slot .musequwen21-ref-preview { flex: 1 1 auto; min-height: 0; margin-top: 0; }
  /* Both the reference grid and Enhance preview show the whole image without
     stretching or cropping; unused space is letterboxed/pillarboxed. */
  .musequwen21-enhance-slot .musequwen21-ref-preview img { object-fit: contain; }

  @media (max-width: 900px) {
    .musequwen21-main-grid { flex-direction: column; }
    .musequwen21-left-col, .musequwen21-output-col { flex: 1 1 auto; max-width: 100%; }
  }
  @media (max-width: 640px) {
    .musequwen21-ref-row { grid-template-columns: repeat(2, minmax(88px, 1fr)); }
  }
  `;
  document.head.appendChild(style);
}

// Proven-safe widget hider, same pattern used across Muse Collective's other
// DOM-widget nodes (Combo V2 / Character Sheet H3).
function hideWidget(w) {
  if (!w) return;
  w.hidden = true;
  if (!w.options) w.options = {};
  w.options.hidden = true;
  if (!window.LiteGraph || !window.LiteGraph.vueNodesMode) {
    w.computeSize = () => [0, -4];
    w.draw = () => {};
  }
  if (w.element) w.element.style.display = "none";
  if (w.callback) w.callback(w.value);
}

function getState(stateWidget) {
  try {
    const parsed = JSON.parse(stateWidget?.value || "{}");
    return { ...parsed, action: parsed.action ?? null };
  } catch (e) {
    return { action: null };
  }
}

function setState(stateWidget, state) {
  if (!stateWidget) return;
  stateWidget.value = JSON.stringify({ ...getState(stateWidget), ...state });
  if (stateWidget.callback) stateWidget.callback(stateWidget.value);
}

async function uploadRefFile(file) {
  const body = new FormData();
  body.append("image", file);
  body.append("subfolder", "musequwen21");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body });
  if (resp.status !== 200) throw new Error("Upload failed: " + resp.status);
  const data = await resp.json();
  const subfolder = data.subfolder || "";
  return { file: subfolder ? subfolder + "/" + data.name : data.name, fileName: file.name };
}

function comfyViewUrl(entryFile) {
  const idx = entryFile.lastIndexOf("/");
  const subfolder = idx >= 0 ? entryFile.slice(0, idx) : "";
  const name = idx >= 0 ? entryFile.slice(idx + 1) : entryFile;
  return api.apiURL(`/view?filename=${encodeURIComponent(name)}&type=input&subfolder=${encodeURIComponent(subfolder)}`);
}

class QwenImage21EditEditor {
  constructor(node) {
    this.node = node;
    this.refsDataWidget = node.widgets.find((w) => w.name === "refs_data");
    this.stateWidget = node.widgets.find((w) => w.name === "state_json");
    this.realWidgets = {};
    for (const name of BOXED_WIDGET_NAMES) {
      const w = node.widgets.find((x) => x.name === name);
      if (w) this.realWidgets[name] = w;
    }
    this.refs = this._loadState();
    this.editActive = false;
    this.hasPreview = false;
    this.enhancedPreview = false;
    this.previewUrl = null;
    this._lastMode = this.realWidgets.mode?.value ?? "edit";
    setState(this.stateWidget, { session_id: crypto.randomUUID(), action: null });

    injectStyles();
    this.container = document.createElement("div");
    this.container.className = "musequwen21-root";
    enableQwenCanvasZoom(this.container);
    this.build();
  }

  async queue() {
    try {
      await app.queuePrompt(0, 1);
    } catch (error) {
      this.statusEl.textContent = `Could not queue: ${error.message}`;
    } finally {
      // The submitted prompt has its own state snapshot. A later Run must be fresh,
      // including when validation or execution of this action fails.
      setState(this.stateWidget, { action: null });
    }
  }

  _loadState() {
    try {
      const raw = this.refsDataWidget?.value || "{}";
      const data = JSON.parse(raw);
      const refs = Array.isArray(data.refs) ? data.refs : [];
      refs.length = MAX_REFS;
      return Array.from(refs, (r) => r || null);
    } catch (e) {
      console.warn("[MuseQwenImage21Edit] Could not parse refs_data", e);
      return new Array(MAX_REFS).fill(null);
    }
  }

  commitChanges() {
    if (!this.refsDataWidget) return;
    this.refsDataWidget.value = JSON.stringify({ refs: this.refs.map(entry => {
      if (!entry) return null;
      const { _blobUrl, ...saved } = entry;
      return saved;
    }) });
    if (this.refsDataWidget.callback) this.refsDataWidget.callback(this.refsDataWidget.value);
    this.node.setDirtyCanvas?.(true, true);
  }

  build() {
    this.container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "musequwen21-header";
    header.innerHTML = `<div class="musequwen21-brand">
      <div class="musequwen21-brand-mark">Q</div>
      <div class="musequwen21-brand-title">Muse Qwen Image 2.1 Edit</div>
    </div>`;
    this.container.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "musequwen21-main-grid";

    const leftCol = document.createElement("div");
    leftCol.className = "musequwen21-left-col";
    leftCol.appendChild(this._buildModeBox());
    leftCol.appendChild(this._buildResolutionBox());
    leftCol.appendChild(this._buildSamplingBox());
    leftCol.appendChild(this._buildRefSettingsBox());
    leftCol.appendChild(this._buildCacheBox());
    leftCol.appendChild(this._buildDlssBox());

    const rightCol = document.createElement("div");
    rightCol.className = "musequwen21-right-col";
    this.rightCol = rightCol;
    rightCol.appendChild(this._buildPromptBox());
    this.referencesBox = this._buildReferencesBox();
    rightCol.appendChild(this.referencesBox);
    this.enhanceBox = this._buildEnhanceBox();
    rightCol.appendChild(this.enhanceBox);

    const outputCol = document.createElement("div");
    outputCol.className = "musequwen21-output-col";
    outputCol.appendChild(this._buildOutputBox());
    this.outputCol = outputCol;

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    grid.appendChild(outputCol);
    this.container.appendChild(grid);
    this._syncModeVisibility();
  }

  // ---- box builders -------------------------------------------------

  _buildModeBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-mode";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">01</span><span>Mode</span></div>`;
    if (this.realWidgets.mode) {
      const row = this._selectRow("Mode", this.realWidgets.mode);
      const select = row.querySelector("select");
      select.addEventListener("change", () => this._onModeChanged());
      box.appendChild(row);
    }
    const hint = document.createElement("div");
    hint.className = "musequwen21-reference-help";
    this.modeHintEl = hint;
    box.appendChild(hint);
    return box;
  }

  _onModeChanged() {
    const newMode = this.realWidgets.mode?.value;
    const prompts = { ...(this.node.properties.muse_qwen21_prompts || {}) };
    prompts[this._lastMode] = this.realWidgets.prompt?.value || "";
    const next = prompts[newMode] ?? (newMode === "enhance" ? ENHANCE_DEFAULT_PROMPT : "");
    this.node.properties.muse_qwen21_prompts = prompts;
    if (this.realWidgets.prompt) {
      this.realWidgets.prompt.value = next;
      if (this.realWidgets.prompt.callback) this.realWidgets.prompt.callback(next);
      const textarea = this.container.querySelector(".musequwen21-prompt-input");
      if (textarea) textarea.value = next;
    }
    this.editActive = false;
    setState(this.stateWidget, { action: null, session_id: crypto.randomUUID() });
    this.hasPreview = false;
    this.enhancedPreview = false;
    this._syncOutputButtons();
    this._lastMode = newMode;
    this._syncModeVisibility();
  }

  _syncModeVisibility() {
    const mode = this.realWidgets.mode?.value || "edit";
    const isT2I = mode === "text_to_image";
    const isEnhance = mode === "enhance";
    const isEdit = mode === "edit";
    if (this.modeHintEl) this.modeHintEl.textContent = isT2I
      ? "Generate a new image from text. Set its shape and size in Resolution; no reference image is used."
      : isEnhance
      ? "Enhance one uploaded image in a single pass. Choose its output size below; there is no iterative edit loop."
      : "Edit Ref 1 using your instruction, with optional additional references. Preview, apply further edits, then confirm the result.";
    if (this.refSettingsBox) this.refSettingsBox.style.display = isT2I ? "none" : "";
    if (this.refSettingsHint) this.refSettingsHint.textContent = isEnhance
      ? "Ref Resolution controls the image detail supplied as conditioning (0 = native). It does not set the output size."
      : "Ref Resolution controls reference conditioning detail (0 = native). With Custom Size off, the output follows the resized Ref 1 canvas.";
    if (this.promptInput) this.promptInput.placeholder = isT2I
      ? "Describe the image you want to generate..."
      : isEnhance ? "Describe the detail or clarity improvements you want..."
      : "Keep the character and pose in ref 1 unchanged, put the outfit from ref 2 on them...";
    if (this.referencesBox) this.referencesBox.style.display = isEdit ? "" : "none";
    if (this.enhanceBox) this.enhanceBox.style.display = isEnhance ? "" : "none";
    if (this.outputCol) this.outputCol.style.display = isEdit ? "" : "none";
    if (this.enhanceMultiplyRow) this.enhanceMultiplyRow.style.display = isEnhance ? "" : "none";
    if (this.rightCol) this.rightCol.classList.toggle("musequwen21-stretch-col", isEnhance);
    if (this.promptLabelEl) {
      this.promptLabelEl.textContent = isT2I ? "Text Prompt" : isEnhance ? "Enhance Prompt" : "Edit Instruction";
    }
    if (this.promptHintEl) {
      this.promptHintEl.textContent = isT2I
        ? "Plain text-to-image prompt — no reference images, no <imageN> tags."
        : isEnhance
        ? "Describe how to enhance the image below. Defaults to a general detail/clarity pass — edit freely."
        : "Write plain English — 'ref 1', 'reference 2' — it's converted to Qwen's own <image1>/<image2> tags automatically. Ref 1 is the edit target; the rest are references.";
    }
    this._syncResolutionControls();
    this._scheduleNodeResize();
  }

  _buildEnhanceBox() {
    const wrap = document.createElement("div");
    wrap.className = "musequwen21-reference-workspace musequwen21-enhance-workspace";
    const title = document.createElement("div");
    title.className = "musequwen21-reference-title";
    title.innerHTML = `<span>Image to Enhance</span>`;
    wrap.appendChild(title);
    wrap.appendChild(this._buildEnhanceSlot());
    return wrap;
  }

  _buildEnhanceSlot() {
    // Reuses Ref 1's own upload/preview/delete slot (same underlying refs_data storage
    // Edit mode's Ref 1 uses) but relabeled and sized to fill the space, since Enhance
    // only ever needs the one image and showing "Ref 1"/"<image1>" here would be
    // confusing outside the multi-reference edit-tag context those labels are for.
    const slot = this._buildRefSlot(0);
    slot.classList.add("musequwen21-enhance-slot");
    const label = slot.querySelector(".musequwen21-ref-label");
    if (label) label.textContent = "Image";
    const tag = slot.querySelector(".musequwen21-ref-tag");
    if (tag) tag.remove();
    if (!slot.querySelector(".musequwen21-ref-placeholder")) return slot;
    slot.querySelector(".musequwen21-ref-placeholder").innerHTML = `${ICON_UPLOAD}<br>Drop image to enhance`;
    return slot;
  }

  _numberRow(labelText, widget, stepOverride) {
    const row = document.createElement("div");
    row.className = "musequwen21-box-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    row.appendChild(label);

    const min = widget.options?.min ?? 0;
    const max = widget.options?.max ?? 100;
    // ComfyUI stores options.step in its legacy x10 convention (step:10
    // means "increment by 1"). Callers pass stepOverride when they know the
    // widget's real step rather than trusting options.step.
    const step = stepOverride ?? (widget.options?.step ?? 1);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "musequwen21-box-number";
    input.min = min; input.max = max; input.step = step;
    input.value = widget.value;

    const commit = (value) => {
      let parsed = parseFloat(value);
      if (!Number.isFinite(parsed)) return;
      parsed = Math.min(max, Math.max(min, parsed));
      const snapped = min + Math.round((parsed - min) / step) * step;
      const decimals = (String(step).split(".")[1] || "").length;
      parsed = Number(snapped.toFixed(decimals));
      widget.value = parsed;
      input.value = parsed;
      if (widget.callback) widget.callback(widget.value);
      this.node.setDirtyCanvas(true, true);
      if (widget.name === "cfg") this._syncNegativePrompt();
    };
    input.addEventListener("change", () => commit(input.value));
    row.appendChild(input);
    return row;
  }

  _selectRow(labelText, widget) {
    const row = document.createElement("div");
    row.className = "musequwen21-box-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    row.appendChild(label);

    const select = document.createElement("select");
    select.className = "musequwen21-box-select";
    const values = widget.options?.values || [];
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      if (v === widget.value) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      widget.value = select.value;
      if (widget.callback) widget.callback(widget.value);
      this.node.setDirtyCanvas(true, true);
      if (widget.name === "enhance_resolution_multiply") {
        this._syncResolutionControls();
        this._scheduleNodeResize();
      }
    });
    row.appendChild(select);
    return row;
  }

  _checkboxRow(labelText, widget) {
    const row = document.createElement("div");
    row.className = "musequwen21-box-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    row.appendChild(label);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "musequwen21-box-checkbox";
    input.checked = !!widget.value;
    input.addEventListener("change", () => {
      widget.value = input.checked;
      if (widget.callback) widget.callback(widget.value);
      this.node.setDirtyCanvas(true, true);
      if (widget.name === "custom_size") {
        this._syncResolutionControls();
        this._scheduleNodeResize();
      }
    });
    row.appendChild(input);
    return row;
  }

  _buildResolutionBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-resolution";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">02</span><span>Resolution</span></div>`;
    if (this.realWidgets.custom_size) {
      this.customSizeRow = this._checkboxRow("Custom Size", this.realWidgets.custom_size);
      box.appendChild(this.customSizeRow);
    }
    this.canvasSizeRows = [];
    for (const [name, label, step] of [["aspect_ratio", "Aspect Ratio"], ["megapixels", "Megapixels", 0.02], ["multiple", "Multiple Of", 4]]) {
      if (!this.realWidgets[name]) continue;
      const row = name === "aspect_ratio" ? this._selectRow(label, this.realWidgets[name]) : this._numberRow(label, this.realWidgets[name], step);
      this.canvasSizeRows.push({name, row});
      box.appendChild(row);
    }
    if (this.realWidgets.enhance_resolution_multiply) {
      this.enhanceMultiplyRow = this._selectRow("Resolution Multiply", this.realWidgets.enhance_resolution_multiply);
      box.appendChild(this.enhanceMultiplyRow);
    }
    const hint = document.createElement("div");
    hint.className = "musequwen21-reference-help";
    this.resolutionHintEl = hint;
    box.appendChild(hint);
    this.resolutionBox = box;
    this._syncResolutionControls();
    return box;
  }

  _syncResolutionControls() {
    if (!this.resolutionBox) return;
    const mode = this.realWidgets.mode?.value || "edit";
    const isT2I = mode === "text_to_image";
    const isEnhance = mode === "enhance";
    const factor = parseFloat(this.realWidgets.enhance_resolution_multiply?.value) || 1;
    const multiplied = isEnhance && factor > 1;
    const enabled = isT2I || (!multiplied && !!this.realWidgets.custom_size?.value);
    if (this.customSizeRow) this.customSizeRow.style.display = isT2I || multiplied ? "none" : "";
    if (this.enhanceMultiplyRow) this.enhanceMultiplyRow.style.display = isEnhance ? "" : "none";
    const checkbox = this.resolutionBox.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.disabled = isT2I || multiplied;
    for (const {name, row} of this.canvasSizeRows || []) {
      // Enhance uses alignment even when retaining/multiplying source dimensions.
      const usable = enabled || (isEnhance && name === "multiple");
      row.style.display = usable ? "" : "none";
      const input = row.querySelector('select, input[type="number"]');
      if (input) input.disabled = !usable;
    }
    if (this.resolutionHintEl) this.resolutionHintEl.textContent = isT2I
      ? "Aspect Ratio and Megapixels set the output canvas. Multiple Of aligns its dimensions. Larger images use more memory."
      : isEnhance
      ? multiplied
        ? `${factor}x sets the final output to ${factor} times the uploaded dimensions. Multiple Of aligns the internal processing canvas; Custom Size is not used.`
        : enabled
        ? "At 1x, Custom Size sets the output canvas using Aspect Ratio and Megapixels."
        : "At 1x with Custom Size off, the final output preserves the uploaded image dimensions. Multiple Of aligns the internal processing canvas."
      : enabled
      ? "Custom Size sets the output canvas using Aspect Ratio and Megapixels, aligned to Multiple Of. References still guide the edit."
      : "Output size follows the resized Ref 1 canvas. Turn on Custom Size to choose an output aspect ratio and megapixel size.";
  }

  _syncNegativePrompt() {
    if (this.negativePromptBox) this.negativePromptBox.style.display = Number(this.realWidgets.cfg?.value ?? 1) === 1 ? "none" : "";
    this._scheduleNodeResize();
  }

  _buildSamplingBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-sampling";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">03</span><span>Sampling</span></div>`;
    if (this.realWidgets.sampler_name) box.appendChild(this._selectRow("Sampler", this.realWidgets.sampler_name));
    if (this.realWidgets.scheduler) box.appendChild(this._selectRow("Scheduler", this.realWidgets.scheduler));
    if (this.realWidgets.steps) box.appendChild(this._numberRow("Steps", this.realWidgets.steps, 1));
    if (this.realWidgets.cfg) box.appendChild(this._numberRow("CFG", this.realWidgets.cfg, 0.1));
    if (this.realWidgets.seed) box.appendChild(this._numberRow("Seed", this.realWidgets.seed, 1));
    if (this.realWidgets.control_after_generate) box.appendChild(this._selectRow("After Generate", this.realWidgets.control_after_generate));
    return box;
  }

  _buildRefSettingsBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-refsettings";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">04</span><span>Reference Settings</span></div>`;
    if (this.realWidgets.reference_resolution) box.appendChild(this._numberRow("Ref Resolution", this.realWidgets.reference_resolution, 32));
    this.refSettingsBox = box;
    const hint = document.createElement("div");
    hint.className = "musequwen21-reference-help";
    this.refSettingsHint = hint;
    box.appendChild(hint);
    return box;
  }

  _buildCacheBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-cache";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">05</span><span>Model Cache</span></div>`;
    if (this.realWidgets.cache_device) box.appendChild(this._selectRow("Cache Device", this.realWidgets.cache_device));
    if (this.realWidgets.cache_dtype) box.appendChild(this._selectRow("Cache Dtype", this.realWidgets.cache_dtype));
    return box;
  }

  _connectedDlssNodes() {
    const graph = this.node.graph;
    if (!graph) return [];
    const found = [];
    const visited = new Set();
    const pending = [...(this.node.outputs?.[0]?.links || [])];
    while (pending.length) {
      const id = pending.pop();
      const link = graph.links?.get?.(id) ?? graph.links?.[id];
      const target = link && graph.getNodeById(link.target_id);
      if (!target || visited.has(target.id)) continue;
      visited.add(target.id);
      if (target.type === "DLSS5EnhanceImages") {
        found.push(target);
      } else if (target.type === "SaveImage" || target.type === "Reroute") {
        for (const output of target.outputs || []) {
          if (output.type === "IMAGE" || target.type === "Reroute") {
            pending.push(...(output.links || []));
          }
        }
      }
    }
    return found;
  }

  _syncDlssControl(applySaved = false) {
    const targets = this._connectedDlssNodes();
    const saved = this.node.properties.muse_dlss5_enabled;
    if (applySaved && typeof saved === "boolean") {
      for (const target of targets) target.mode = saved ? 0 : 4;
    }
    if (!this.dlssCheckbox) return;
    this.dlssCheckbox.disabled = targets.length === 0;
    this.dlssCheckbox.checked = targets.length > 0 && targets.every(n => n.mode === 0);
    this.dlssHint.textContent = !targets.length
      ? "Connect a DLSS5 Enhance Images node to the image output to enable this switch."
      : this.dlssCheckbox.checked
        ? "On: run the connected DLSS5 pass using its existing settings."
        : "Off: skip DLSS5 and pass the Qwen image through unchanged.";
  }

  _buildDlssBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-cache";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">06</span><span>DLSS5</span></div>`;
    const row = document.createElement("div");
    row.className = "musequwen21-box-row";
    const label = document.createElement("label");
    label.textContent = "Use DLSS5";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "musequwen21-box-checkbox";
    checkbox.setAttribute("aria-label", "Use DLSS5");
    checkbox.addEventListener("change", () => {
      this.node.graph?.beforeChange?.();
      this.node.properties.muse_dlss5_enabled = checkbox.checked;
      this._syncDlssControl(true);
      this.node.graph?.afterChange?.();
      this.node.setDirtyCanvas?.(true, true);
    });
    row.appendChild(label);
    row.appendChild(checkbox);
    box.appendChild(row);
    const hint = document.createElement("div");
    hint.className = "musequwen21-reference-help";
    box.appendChild(hint);
    this.dlssCheckbox = checkbox;
    this.dlssHint = hint;
    this._syncDlssControl();
    return box;
  }

  _buildPromptBox() {
    const wrap = document.createElement("div");

    const posBox = document.createElement("div");
    posBox.className = "musequwen21-prompt-box";
    const posLabel = document.createElement("div");
    posLabel.className = "musequwen21-prompt-label";
    posLabel.textContent = "Edit Instruction";
    posBox.appendChild(posLabel);
    this.promptLabelEl = posLabel;
    if (this.realWidgets.prompt) {
      const input = document.createElement("textarea");
      input.className = "musequwen21-prompt-input";
      input.value = this.realWidgets.prompt.value || "";
      this.promptInput = input;
      input.placeholder = "Keep the character and pose in ref 1 unchanged, put the outfit from ref 2 on them...";
      input.addEventListener("input", () => {
        this.realWidgets.prompt.value = input.value;
        if (this.realWidgets.prompt.callback) this.realWidgets.prompt.callback(input.value);
      });
      posBox.appendChild(input);
    }
    const hint = document.createElement("div");
    hint.className = "musequwen21-prompt-hint";
    hint.textContent = "Write plain English — 'ref 1', 'reference 2' — it's converted to Qwen's own <image1>/<image2> tags automatically. Ref 1 is the edit target; the rest are references.";
    posBox.appendChild(hint);
    this.promptHintEl = hint;
    wrap.appendChild(posBox);

    if (this.realWidgets.negative_prompt) {
      const negBox = document.createElement("div");
      negBox.className = "musequwen21-prompt-box";
      negBox.style.marginTop = "10px";
      const negLabel = document.createElement("div");
      negLabel.className = "musequwen21-prompt-label";
      negLabel.textContent = "Negative Prompt (only used if CFG > 1)";
      negBox.appendChild(negLabel);
      const negInput = document.createElement("textarea");
      negInput.className = "musequwen21-prompt-input";
      negInput.style.minHeight = "48px";
      negInput.value = this.realWidgets.negative_prompt.value || "";
      negInput.addEventListener("input", () => {
        this.realWidgets.negative_prompt.value = negInput.value;
        if (this.realWidgets.negative_prompt.callback) this.realWidgets.negative_prompt.callback(negInput.value);
      });
      negBox.appendChild(negInput);
      wrap.appendChild(negBox);
      this.negativePromptBox = negBox;
      this._syncNegativePrompt();
    }

    return wrap;
  }

  _buildReferencesBox() {
    const wrap = document.createElement("div");
    wrap.className = "musequwen21-reference-workspace";
    const title = document.createElement("div");
    title.className = "musequwen21-reference-title";
    title.innerHTML = `<span>References (Images)</span><span class="musequwen21-reference-help" style="margin:0;">Up to 10 — image_1 to image_10</span>`;
    wrap.appendChild(title);

    const row = document.createElement("div");
    row.className = "musequwen21-ref-row";
    for (let i = 0; i < MAX_REFS; i++) row.appendChild(this._buildRefSlot(i));
    wrap.appendChild(row);

    const help = document.createElement("div");
    help.className = "musequwen21-reference-help";
    help.textContent = "Ref 1 is required as the edit target. Ref labels stay fixed even with empty slots; prompts are mapped to Qwen's internal image order. Missing files stop the render.";
    wrap.appendChild(help);

    return wrap;
  }

  _buildRefSlot(idx) {
    const entry = this.refs[idx];
    const filled = entry && entry.file;

    const slot = document.createElement("div");
    slot.className = "musequwen21-ref-slot" + (filled ? " musequwen21-filled" : "");

    const label = document.createElement("div");
    label.className = "musequwen21-ref-label";
    label.textContent = `Ref ${idx + 1}`;
    slot.appendChild(label);

    const tag = document.createElement("div");
    tag.className = "musequwen21-ref-tag";
    tag.textContent = `<image${idx + 1}>`;
    slot.appendChild(tag);

    if (filled) {
      const del = document.createElement("button");
      del.className = "musequwen21-ref-del";
      del.innerHTML = "&times;";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.refs[idx]?._blobUrl) URL.revokeObjectURL(this.refs[idx]._blobUrl);
        this.refs[idx] = null;
        this.commitChanges();
        this.renderReferences();
      });
      slot.appendChild(del);

      const preview = document.createElement("div");
      preview.className = "musequwen21-ref-preview";
      const img = document.createElement("img");
      const dimensions = document.createElement("div");
      dimensions.className = "musequwen21-ref-dimensions";
      dimensions.textContent = "Loading size…";
      dimensions.title = "Original reference image dimensions (width × height in pixels)";
      const updateDimensions = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          dimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        }
      };
      img.addEventListener("load", updateDimensions);
      img.addEventListener("error", () => { dimensions.textContent = "Size unavailable"; });
      img.src = entry.file ? comfyViewUrl(entry.file) : entry._blobUrl;
      if (img.complete) updateDimensions();
      preview.appendChild(img);
      slot.appendChild(preview);
      slot.appendChild(dimensions);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "musequwen21-ref-placeholder";
      placeholder.innerHTML = `${ICON_UPLOAD}<br>Drop image`;
      slot.appendChild(placeholder);
      slot.addEventListener("click", () => this._promptFilePick(idx));
    }

    slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.style.borderColor = "#4F8EF7"; });
    slot.addEventListener("dragleave", () => { slot.style.borderColor = ""; });
    slot.addEventListener("drop", async (e) => {
      e.preventDefault();
      slot.style.borderColor = "";
      const file = e.dataTransfer.files?.[0];
      if (file) await this._setSlotImage(idx, file);
    });

    return slot;
  }

  _promptFilePick(idx) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      if (input.files?.[0]) await this._setSlotImage(idx, input.files[0]);
    };
    input.click();
  }

  async _setSlotImage(idx, file) {
    try {
      const uploaded = await uploadRefFile(file);
      if (this.refs[idx]?._blobUrl) URL.revokeObjectURL(this.refs[idx]._blobUrl);
      this.refs[idx] = { ...uploaded };
      this.commitChanges();
      this.renderReferences();
    } catch (err) {
      console.error("[MuseQwenImage21Edit] reference image upload failed", err);
      alert("Image upload failed — see console for details.");
    }
  }

  renderReferences() {
    // Ref 1's own upload/delete handlers call this unconditionally — refresh whichever
    // of the two UIs sharing that same slot 0 data is actually visible right now (the
    // full grid in Edit mode, or the single relabeled slot in Enhance mode).
    const row = this.container.querySelector(".musequwen21-ref-row");
    if (row) {
      row.innerHTML = "";
      for (let i = 0; i < MAX_REFS; i++) row.appendChild(this._buildRefSlot(i));
    }
    if (this.enhanceBox) {
      const oldSlot = this.enhanceBox.querySelector(".musequwen21-ref-slot");
      const newSlot = this._buildEnhanceSlot();
      if (oldSlot) oldSlot.replaceWith(newSlot);
      else this.enhanceBox.appendChild(newSlot);
    }
    this._scheduleNodeResize();
  }

  // ---- output column: iterative edit loop -----------------------------
  // Edit mode always previews first. Generate, edit, reroll and enhance keep
  // result sockets blocked; Confirm releases the current reviewed image.

  _buildOutputBox() {
    const box = document.createElement("div");
    box.className = "musequwen21-box musequwen21-box-output";
    box.innerHTML = `<div class="musequwen21-box-title"><span class="musequwen21-title-index">06</span><span>Output</span></div>`;

    const preview = document.createElement("div");
    preview.className = "musequwen21-output-preview";
    preview.innerHTML = `<div class="musequwen21-output-placeholder">Run the node to see a preview here</div>`;
    box.appendChild(preview);
    this.previewEl = preview;

    const seedRow = document.createElement("div");
    seedRow.className = "musequwen21-output-seedrow";
    const seedLabel = document.createElement("span");
    seedLabel.textContent = `seed ${this.realWidgets.seed?.value ?? ""}`;
    this.seedLabelEl = seedLabel;
    seedRow.appendChild(seedLabel);
    box.appendChild(seedRow);

    const rerollBtn = document.createElement("button");
    rerollBtn.className = "musequwen21-output-btn musequwen21-btn-seed";
    rerollBtn.textContent = "🎲 New Seed";
    rerollBtn.onclick = () => {
      const newSeed = Math.floor(Math.random() * 2147483647);
      const seedWidget = this.realWidgets.seed;
      if (seedWidget) {
        seedWidget.value = newSeed;
        if (seedWidget.callback) seedWidget.callback(newSeed);
      }
      this.seedLabelEl.textContent = `seed ${newSeed}`;
      this.editActive = true;
      setState(this.stateWidget, { action: { type: "reroll" } });
      this.statusEl.textContent = "Re-rolling…";
      this._syncOutputButtons();
      this.queue();
    };
    box.appendChild(rerollBtn);
    this.rerollBtn = rerollBtn;

    const editInput = document.createElement("textarea");
    editInput.className = "musequwen21-output-edit-input";
    editInput.rows = 2;
    editInput.placeholder = "e.g. make the hoodie zipped up";
    box.appendChild(editInput);
    this.editInputEl = editInput;

    const applyBtn = document.createElement("button");
    applyBtn.className = "musequwen21-output-btn musequwen21-btn-apply";
    applyBtn.textContent = "✏️ Apply Edit";
    applyBtn.onclick = () => {
      const instruction = editInput.value.trim();
      if (!instruction) return;
      this.editActive = true;
      setState(this.stateWidget, { action: { type: "apply_edit", instruction } });
      editInput.value = "";
      this.statusEl.textContent = "Applying edit…";
      this._syncOutputButtons();
      this.queue();
    };
    box.appendChild(applyBtn);

    const enhanceSettings = document.createElement("details");
    const enhanceSummary = document.createElement("summary");
    enhanceSummary.textContent = "Enhancement settings";
    enhanceSettings.appendChild(enhanceSummary);
    const enhancePrompt = document.createElement("textarea");
    enhancePrompt.className = "musequwen21-output-edit-input";
    enhancePrompt.rows = 4;
    enhancePrompt.value = this.node.properties.muse_qwen21_preview_enhance_prompt
      ?? this.node.properties.muse_qwen21_prompts?.enhance ?? ENHANCE_DEFAULT_PROMPT;
    enhancePrompt.addEventListener("input", () => {
      this.node.properties.muse_qwen21_preview_enhance_prompt = enhancePrompt.value;
      this.node.setDirtyCanvas(true, true);
    });
    enhanceSettings.appendChild(enhancePrompt);
    const multiplier = document.createElement("select");
    multiplier.className = "musequwen21-box-select";
    for (const value of ["1x", "2x", "3x", "4x", "5x"]) {
      const option = document.createElement("option");
      option.value = value; option.textContent = `${value} preview dimensions`;
      multiplier.appendChild(option);
    }
    multiplier.value = this.node.properties.muse_qwen21_preview_enhance_multiply || "1x";
    multiplier.addEventListener("change", () => {
      this.node.properties.muse_qwen21_preview_enhance_multiply = multiplier.value;
      this.node.setDirtyCanvas(true, true);
    });
    enhanceSettings.appendChild(multiplier);
    const enhanceHelp = document.createElement("div");
    enhanceHelp.className = "musequwen21-reference-help";
    enhanceHelp.textContent = "Enhances the current preview only, using the current sampling and reference-resolution settings. 1x keeps its dimensions. Further edits or New Seed discard enhancement; enhance again after editing.";
    enhanceSettings.appendChild(enhanceHelp);
    enhanceSettings.addEventListener("toggle", () => this._scheduleNodeResize());
    box.appendChild(enhanceSettings);
    const enhanceBtn = document.createElement("button");
    enhanceBtn.className = "musequwen21-output-btn musequwen21-btn-apply";
    enhanceBtn.textContent = "✨ Enhance Preview";
    enhanceBtn.onclick = () => {
      const instruction = enhancePrompt.value.trim();
      if (!instruction) { this.statusEl.textContent = "Enter an enhancement instruction in Enhancement settings."; return; }
      setState(this.stateWidget, { action: { type: "enhance_preview", instruction, multiply: multiplier.value } });
      this.statusEl.textContent = "Enhancing preview — output stays blocked until Confirm…";
      this.queue();
    };
    box.appendChild(enhanceBtn);
    this.enhancePreviewBtn = enhanceBtn;
    const undoEnhanceBtn = document.createElement("button");
    undoEnhanceBtn.className = "musequwen21-output-btn musequwen21-btn-reset";
    undoEnhanceBtn.textContent = "↶ Undo Enhance";
    undoEnhanceBtn.onclick = () => {
      setState(this.stateWidget, { action: { type: "undo_enhance" } });
      this.statusEl.textContent = "Restoring the preview before enhancement…";
      this.queue();
    };
    box.appendChild(undoEnhanceBtn);
    this.undoEnhanceBtn = undoEnhanceBtn;

    const resetBtn = document.createElement("button");
    resetBtn.className = "musequwen21-output-btn musequwen21-btn-reset";
    resetBtn.textContent = "↺ Reset Edit";
    resetBtn.onclick = () => {
      setState(this.stateWidget, { action: { type: "reset_edit" } });
      this.statusEl.textContent = "Reverting to the base image…";
      this._syncOutputButtons();
      this.queue();
    };
    box.appendChild(resetBtn);
    this.resetBtn = resetBtn;

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "musequwen21-output-btn musequwen21-btn-confirm";
    confirmBtn.textContent = "✓ Confirm (send to output)";
    confirmBtn.onclick = () => {
      setState(this.stateWidget, { action: { type: "confirm" } });
      this.statusEl.textContent = "Confirmed — sending to output…";
      this.editActive = false;
      this._syncOutputButtons();
      this.queue();
    };
    box.appendChild(confirmBtn);
    this.confirmBtn = confirmBtn;

    const status = document.createElement("div");
    status.className = "musequwen21-output-status";
    status.textContent = "Run the node to generate a first preview.";
    box.appendChild(status);
    this.statusEl = status;

    this._syncOutputButtons();
    return box;
  }

  _syncOutputButtons() {
    // Reset Edit/Confirm only make sense once there's something to act on
    // (editActive tracks "the third column has been engaged this session" —
    // purely a client-side UX nicety, Python's own session is the real
    // source of truth for whether an edit chain actually exists).
    if (this.resetBtn) this.resetBtn.disabled = !this.editActive;
    if (this.confirmBtn) this.confirmBtn.disabled = !this.editActive;
    if (this.enhancePreviewBtn) this.enhancePreviewBtn.disabled = !this.hasPreview;
    if (this.undoEnhanceBtn) {
      this.undoEnhanceBtn.disabled = !this.enhancedPreview;
      this.undoEnhanceBtn.style.display = this.enhancedPreview ? "" : "none";
    }
  }

  handleExecuted(message) {
    if (!message) return;
    const recipe = message.mquwen21_recipe?.[0];
    if (recipe) {
      this.hasPreview = true;
      this.editActive = !!recipe.pending_confirmation;
      this.enhancedPreview = !!recipe.enhanced;
      this._syncOutputButtons();
    }
    if (recipe && this.seedLabelEl) this.seedLabelEl.textContent = `Rendered seed ${recipe.seed}`;
    const entries = message.mquwen21_preview;
    if (Array.isArray(entries) && entries[0] && this.previewEl) {
      const img = entries[0];
      const params = new URLSearchParams({
        filename: img.filename, subfolder: img.subfolder || "", type: img.type || "temp",
        t: Date.now(),
      });
      this.previewEl.innerHTML = "";
      const el = document.createElement("img");
      el.src = api.apiURL("/view?" + params.toString());
      this.previewEl.appendChild(el);
    }
    if (this.statusEl) this.statusEl.textContent = this.editActive
      ? "Ready — keep editing, or Confirm to send this to the output."
      : "Generated.";
    // [2026-09-22] Clear the action here, after the round-trip that used it
    // completes — same fix Klein's own renderState() applies. Without this,
    // whatever action fired last (confirm, apply_edit, reroll...) stays
    // stuck in state_json forever, so a later plain "Queue Prompt" click
    // (nothing in this UI touched) silently replays that SAME stale action
    // again instead of doing an ordinary fresh render — exactly the "hit Run
    // and nothing happens" bug this fixes. Clearing it immediately on click
    // instead of here would risk racing app.queuePrompt's own read of the
    // widget's value for the submission that's still in flight.
    setState(this.stateWidget, { action: null });
    this._scheduleNodeResize();
  }

  // ---- resize sync ----------------------------------------------------
  // [2026-09-21] Ported directly from Character Sheet H3's own (hard-won)
  // fix: computeSize must echo a value CACHED from a real, settled
  // measurement — never the node's own current size (that creates an
  // unbounded runaway against LiteGraph's grow-only arrange logic) and
  // never a live offsetHeight read on every call (a momentarily-inflated
  // reading gets permanently locked in by that same grow-only logic,
  // since outside Vue nodes mode it never shrinks a node back down).
  _attachAutoResize(timelineWidget) {
    this.timelineWidget = timelineWidget;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
    if (window.LiteGraph?.vueNodesMode) return;
    this._resizeDebounce = setTimeout(() => {
      this._resizeDebounce = null;
      this._resizeOnce();
      if (typeof ResizeObserver !== "undefined" && this.container) {
        this._resizeObserver = new ResizeObserver(() => this._scheduleNodeResize());
        this._resizeObserver.observe(this.container);
      }
    }, 300);
  }

  _resizeOnce() {
    // [2026-09-22] Same fix as Character Sheet H3/Muse-NeveV4's own resize bug: this used
    // to read `this.node.size?.[0]` as the WIDTH FLOOR too, which made computeSize's own
    // width answer circular (computeSize -> arrange -> grows node.size -> read back here
    // next call -> grows again, no fixed point — the "stupid long thing" bug). Width now
    // comes only from a fixed cached constant, never from live node.size; height is still
    // grow-only against the node's CURRENT size so a manual drag-resize is respected.
    if (window.LiteGraph?.vueNodesMode) return;
    if (!this.timelineWidget || !this.node?.setSize || !this.container) return;
    const contentHeight = Math.max(this.container.offsetHeight || 0, this.container.scrollHeight || 0, 480);
    this._cachedContentHeight = contentHeight;
    const minWidth = this._cachedContentWidth || 1550;
    const minHeight = Math.ceil(contentHeight + 70);
    const currentWidth = this.node.size?.[0] || 0;
    const currentHeight = this.node.size?.[1] || 0;
    const width = Math.max(currentWidth, minWidth);
    const height = Math.max(currentHeight, minHeight);
    if (width !== currentWidth || height !== currentHeight) {
      this.node.setSize([width, height]);
      this.node.setDirtyCanvas?.(true, true);
    }
  }

  _scheduleNodeResize() {
    if (window.LiteGraph?.vueNodesMode) return;
    if (!this.timelineWidget || !this.node?.setSize) return;
    if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
    this._resizeDebounce = setTimeout(() => {
      this._resizeDebounce = null;
      this._resizeOnce();
    }, 250);
  }
}

app.registerExtension({
  name: "MuseCollective.QwenImage21Edit",
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) {
      node._museQwenEditor?._syncDlssControl(true);
    }
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MuseQwenImage21Edit") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

      for (const w of this.widgets || []) {
        if (HIDDEN_WIDGET_NAMES.includes(w.name) || BOXED_WIDGET_NAMES.includes(w.name)) {
          hideWidget(w);
        }
      }

      this._museQwenEditor = new QwenImage21EditEditor(this);
      const domWidget = this.addDOMWidget("mquwen21_ui", "mquwen21_ui", this._museQwenEditor.container, {
        serialize: false,
        hideOnZoom: false,
      });
      this._museQwenEditor._cachedContentWidth = 1550;
      // [2026-09-22] computeSize must report ONLY from cached measurements, never from
      // live node.size — reading node.size here makes it a circular reference (arrange
      // grows node.size to match whatever this returns, which this then reads back next
      // call, growing again with no fixed point). See _resizeOnce's own comment for the
      // full story — this is the same bug, in the other of the two places it can hide,
      // already fixed once on Muse-NeveV4 and Character Sheet H3.
      domWidget.computeSize = () => {
        const minWidth = this._museQwenEditor?._cachedContentWidth || 1550;
        const minHeight = this._museQwenEditor?._cachedContentHeight || 480;
        return [minWidth, minHeight];
      };
      this._museQwenEditor._attachAutoResize(domWidget);

      this.size = [1550, 480];
      return r;
    };

    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function () {
      const result = onDrawForeground?.apply(this, arguments);
      this._museQwenEditor?._syncDlssControl();
      return result;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
      this._museQwenEditor?.handleExecuted(message);
      return r;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const editor = this._museQwenEditor;
      editor?._resizeObserver?.disconnect();
      if (editor?._resizeDebounce) clearTimeout(editor._resizeDebounce);
      return onRemoved ? onRemoved.apply(this, arguments) : undefined;
    };

    // onNodeCreated fires before a loaded workflow's saved widgets_values is
    // applied — same as Character Sheet H3, re-sync from refs_data here so a
    // reload actually picks up the saved reference uploads.
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
      const editor = this._museQwenEditor;
      if (editor) {
        editor._lastMode = editor.realWidgets.mode?.value || "edit";
        const raw = editor.refsDataWidget?.value || "{}";
        if (raw !== editor._lastConfiguredRaw) {
          editor._lastConfiguredRaw = raw;
          editor.refs = editor._loadState();
          editor.build();
          editor._scheduleNodeResize();
        }
        // [2026-09-22] A saved workflow can carry a leftover action (e.g. "confirm")
        // from whatever was last clicked before it was saved. If this exact node id's
        // in-process session is still alive (page refresh without a full ComfyUI
        // restart), a plain "Queue Prompt" click would otherwise silently replay that
        // stale action instead of doing an ordinary fresh render. Clearing it on load
        // means a reload always starts clean, same as never having clicked anything.
        if (editor.stateWidget && editor.stateWidget.value && editor.stateWidget.value !== "{}") {
          setState(editor.stateWidget, { action: null, session_id: crypto.randomUUID() });
        }
      }
      return r;
    };
  },
});
