/**
 * Повноекранна студія редактора фото (Lightroom-style UI) для FrameKit.
 * Відкривається поверх усього додатка — без зайвих вкладок нижнього меню.
 */

import {
  BUILTIN_PRESETS,
  HSL_BANDS,
  PhotoEditorEngine,
  createDefaultEdits,
  createMask,
  drawHistogram,
} from "./editor_engine.js";
import { decodeRawBuffer, formatRawExifBadge, isRawFile } from "./raw_decoder.js";
import { getLang, t } from "./i18n.js";

const PRESETS_LS_KEY = "framekit_custom_presets_v1";
const CLIPBOARD_LS_KEY = "framekit_edit_clipboard_v1";

function loadEditClipboard() {
  try {
    const raw = localStorage.getItem(CLIPBOARD_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEditClipboard(patch) {
  try {
    localStorage.setItem(CLIPBOARD_LS_KEY, JSON.stringify(patch));
  } catch { /* ignore */ }
}

function loadCustomPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(list) {
  try {
    localStorage.setItem(PRESETS_LS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class PhotoStudioController {
  constructor({ showToast, vibrate, onSendToAi, onPresetsChanged }) {
    this.showToast = showToast;
    this.vibrate = vibrate;
    this.onSendToAi = onSendToAi;
    this.onPresetsChanged = onPresetsChanged;

    this.overlay = document.getElementById("studio-overlay");
    this.glCanvas = document.getElementById("studio-gl-canvas");
    this.uiCanvas = document.getElementById("studio-ui-canvas");
    this.histCanvas = document.getElementById("studio-hist-canvas");
    this.exifBadge = document.getElementById("studio-exif-badge");
    this.pasteFab = document.getElementById("btn-studio-paste-fab");
    this.loaderEl = document.getElementById("studio-loader");
    this.loaderTextEl = document.getElementById("studio-loader-text");
    this.undoBtn = document.getElementById("btn-studio-undo");
    this.stage = document.getElementById("studio-stage");
    this.panelBox = document.getElementById("studio-panel-content");

    this.engine = null;
    this.edits = createDefaultEdits();
    this.masks = [];
    this.selectedMaskIdx = -1;
    this.showMaskOverlay = true;
    this.showOriginal = false;
    this.showHist = true;
    this.showClipping = false;

    // Стан 16-бітного RAW
    this.rawArrayBuffer = null;
    this.rawMeta = null;
    this.rawBaseGain = 1.0;

    // Історія Undo (до 25 кроків)
    this.history = [];
    this.historyIdx = -1;

    this.activeTool = "light"; // presets | light | color | hsl | grade | curve | effects | masks | crop
    this.activeHslIdx = 0;
    this.brushSize = 0.09;
    this.brushFeather = 0.6;
    this.brushErase = false;
    this.activeDrag = null; // { mode: "p1"|"p2"|"center"|"radius"|"brush" }
    this.rafPending = false;
    this.histTimer = null;
    this.fileNameBase = "framekit_edit";
    this.customPresets = loadCustomPresets();
    this.copiedPatch = loadEditClipboard();

    this._bindTopbarAndTools();
    this._bindStagePointers();
  }

  getCustomPresets() {
    return this.customPresets;
  }

  deleteCustomPreset(id) {
    this.customPresets = this.customPresets.filter((p) => p.id !== id);
    saveCustomPresets(this.customPresets);
    if (this.onPresetsChanged) this.onPresetsChanged();
  }

  importCustomPreset(jsonText) {
    const parsed = JSON.parse(jsonText);
    const p = parsed?.preset || parsed;
    if (!p?.name || !p?.patch) throw new Error(t("ed_preset_bad_file"));
    this.customPresets.unshift({ id: `cp_${Date.now()}`, name: p.name, patch: p.patch });
    saveCustomPresets(this.customPresets);
    if (this.onPresetsChanged) this.onPresetsChanged();
    return p.name;
  }

  refreshLanguage() {
    if (this.rawMeta && this.exifBadge) {
      this.exifBadge.textContent = formatRawExifBadge(this.rawMeta, getLang());
    }
    if (this.isOpen()) {
      this._renderToolPanel();
    }
  }

  _setLoading(open, text = "") {
    if (!this.loaderEl) return;
    if (text && this.loaderTextEl) this.loaderTextEl.textContent = text;
    this.loaderEl.classList.toggle("open", open);
  }

  _syncPasteFab() {
    if (!this.pasteFab) return;
    // Показуємо швидку кнопку "Вставити" на чистих кадрах, якщо в буфері є скопійовані корекції
    const show = Boolean(this.copiedPatch) && this.historyIdx === 0;
    this.pasteFab.style.display = show ? "inline-flex" : "none";
  }

  _copyEdits() {
    const patch = JSON.parse(JSON.stringify(this.edits));
    delete patch.straighten;
    delete patch.rotate90;
    delete patch.flipH;
    delete patch.aspect;
    this.copiedPatch = patch;
    saveEditClipboard(patch);
    this._syncPasteFab();
    if (this.activeTool === "presets") this._renderToolPanel();
    this.vibrate(40);
    this.showToast(t("st_copied_toast"));
  }

  _pasteEdits() {
    if (!this.copiedPatch) {
      this.showToast(t("st_clipboard_empty"));
      return;
    }
    const keepGeom = {
      straighten: this.edits.straighten,
      rotate90: this.edits.rotate90,
      flipH: this.edits.flipH,
      aspect: this.edits.aspect,
    };
    const fresh = createDefaultEdits();
    Object.assign(fresh, JSON.parse(JSON.stringify(this.copiedPatch)), keepGeom);
    this.edits = fresh;
    this._pushHistory();
    this._renderToolPanel();
    this._requestRender(true);
    this.vibrate(40);
    this.showToast(t("st_pasted_toast"));
  }

  _resetHistory() {
    this.history = [JSON.stringify({ edits: this.edits, masks: this.masks })];
    this.historyIdx = 0;
    this._syncUndoBtn();
    this._syncPasteFab();
  }

  _pushHistory() {
    const snap = JSON.stringify({ edits: this.edits, masks: this.masks });
    if (this.history[this.historyIdx] === snap) return;
    this.history = this.history.slice(0, this.historyIdx + 1);
    this.history.push(snap);
    if (this.history.length > 25) this.history.shift();
    this.historyIdx = this.history.length - 1;
    this._syncUndoBtn();
    this._syncPasteFab();
  }

  _syncUndoBtn() {
    if (this.undoBtn) this.undoBtn.disabled = this.historyIdx <= 0;
  }

  _undo() {
    if (this.historyIdx <= 0) return;
    this.historyIdx--;
    const snap = JSON.parse(this.history[this.historyIdx]);
    this.edits = snap.edits;
    this.masks = snap.masks;
    if (this.selectedMaskIdx >= this.masks.length) {
      this.selectedMaskIdx = this.masks.length - 1;
    }
    this._syncUndoBtn();
    this._syncPasteFab();
    this._renderToolPanel();
    this._requestRender(true);
    this.showToast(t("st_undo_toast"));
  }

  isOpen() {
    return this.overlay.classList.contains("open");
  }

  _prepareStudioSession() {
    if (!this.engine) {
      this.engine = new PhotoEditorEngine(this.glCanvas);
    }
    this.edits = createDefaultEdits();
    this.masks = [];
    this.selectedMaskIdx = -1;
    this.showOriginal = false;
    this.showClipping = false;
    this.histCanvas.classList.remove("clip-on");
    this.overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    this._resetHistory();
  }

  async _openAsRaw(file) {
    this._prepareStudioSession();
    this.rawArrayBuffer = null;
    this.rawMeta = null;
    if (this.exifBadge) this.exifBadge.style.display = "none";
    this._setLoading(true, t("st_raw_loading"));

    try {
      const buf = await file.arrayBuffer();
      const decoded = await decodeRawBuffer(buf, { mode: "preview", maxSide: 1600 });
      this.rawArrayBuffer = buf;
      this.rawMeta = decoded.metadata;
      this.rawBaseGain = decoded.baseGain;
      this.engine.loadRawFloat(decoded.floatData, decoded.width, decoded.height);

      if (this.exifBadge) {
        this.exifBadge.textContent = formatRawExifBadge(decoded.metadata, getLang());
        this.exifBadge.style.display = "block";
      }
      this._setLoading(false);
      this._setTool("light");
      this._requestRender(true);
      this.showToast(t("st_raw_ready", { w: decoded.origWidth, h: decoded.origHeight }));
    } catch (err) {
      this._setLoading(false);
      this.close();
      this.showToast(t("st_err_editor", { err: err?.message || t("st_err_open") }));
    }
  }

  openFile(file) {
    if (!file) return;
    this.fileNameBase = (file.name || "photo").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "photo";

    // Якщо це RAW за розширенням/MIME — одразу йдемо в 16-біт LibRaw WASM!
    if (isRawFile(file)) {
      this._openAsRaw(file);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        this.rawArrayBuffer = null;
        this.rawMeta = null;
        if (this.exifBadge) this.exifBadge.style.display = "none";
        this._prepareStudioSession();
        this.engine.loadImage(img);
        this._setTool("light");
        this._requestRender(true);
      } catch (err) {
        this.showToast(t("st_err_editor", { err: err.message }));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Якщо Android file picker приховав розширення .CR3/.ARW/.NEF — пробуємо відкрити через LibRaw!
      this._openAsRaw(file);
    };
    img.src = url;
  }

  close() {
    this._setLoading(false);
    this.overlay.classList.remove("open");
    document.body.style.overflow = "";
    this.rawArrayBuffer = null;
    this.rawMeta = null;
  }

  _bindTopbarAndTools() {
    document.getElementById("btn-studio-back").addEventListener("click", () => this.close());
    this.undoBtn?.addEventListener("click", () => this._undo());

    const btnCompare = document.getElementById("btn-studio-compare");
    const setOrig = (v) => {
      this.showOriginal = v;
      btnCompare.classList.toggle("active", v);
      this._requestRender(false);
    };
    btnCompare.addEventListener("pointerdown", () => setOrig(true));
    btnCompare.addEventListener("pointerup", () => setOrig(false));
    btnCompare.addEventListener("pointerleave", () => { if (this.showOriginal) setOrig(false); });
    btnCompare.addEventListener("pointercancel", () => setOrig(false));

    document.getElementById("btn-studio-reset").addEventListener("click", () => {
      this.edits = createDefaultEdits();
      this.masks = [];
      this.selectedMaskIdx = -1;
      this.engine?.clearAllBrushMasks();
      this._pushHistory();
      this._renderToolPanel();
      this._requestRender(true);
      this.showToast(t("st_reset_toast"));
    });

    document.getElementById("btn-studio-ai").addEventListener("click", () => {
      if (!this.engine) return;
      this.engine.render(this.edits, this.masks, { showOriginal: false, overlayMaskIdx: -1, showClipping: false });
      const cropped = this.engine._applyGeometryCrop(this.glCanvas, this.edits);
      const maxDim = 1024;
      let target = cropped;
      if (cropped.width > maxDim || cropped.height > maxDim) {
        const r = Math.min(maxDim / cropped.width, maxDim / cropped.height);
        const c = document.createElement("canvas");
        c.width = Math.round(cropped.width * r);
        c.height = Math.round(cropped.height * r);
        c.getContext("2d").drawImage(cropped, 0, 0, c.width, c.height);
        target = c;
      }
      const previewUrl = target.toDataURL("image/jpeg", 0.84);
      this.close();
      if (this.onSendToAi) this.onSendToAi(previewUrl);
    });

    document.getElementById("btn-studio-save").addEventListener("click", () => this._exportPhoto());

    // Тап по RGB-гістограмі вмикає/вимикає зебру пересвітів і тіней (як клавіша J у Lightroom!)
    this.histCanvas.addEventListener("click", () => {
      this.showClipping = !this.showClipping;
      this.histCanvas.classList.toggle("clip-on", this.showClipping);
      this._requestRender(false);
      this.showToast(this.showClipping ? t("st_clip_on") : t("st_clip_off"));
    });

    this.exifBadge?.addEventListener("click", () => {
      this.exifBadge.style.opacity = this.exifBadge.style.opacity === "0.25" ? "1" : "0.25";
    });

    this.pasteFab?.addEventListener("click", () => this._pasteEdits());

    document.querySelectorAll("#studio-tool-bar [data-stool]").forEach((btn) => {
      btn.addEventListener("click", () => this._setTool(btn.dataset.stool));
    });

    window.addEventListener("resize", () => {
      if (this.isOpen()) this._requestRender(false);
    });
  }

  _setTool(tool) {
    this.activeTool = tool;
    document.querySelectorAll("#studio-tool-bar [data-stool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.stool === tool);
    });
    this._renderToolPanel();
    this._requestRender(false);
  }

  _requestRender(updateHist = true) {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (!this.engine) return;

      const overlayIdx =
        this.activeTool === "masks" && this.showMaskOverlay && this.selectedMaskIdx >= 0
          ? this.selectedMaskIdx
          : -1;

      this.engine.render(this.edits, this.masks, {
        showOriginal: this.showOriginal,
        overlayMaskIdx: overlayIdx,
        showClipping: this.showClipping && !this.showOriginal,
      });

      this._applyStagePreviewTransform();
      this._drawStageOverlay();

      if (updateHist && this.showHist) {
        clearTimeout(this.histTimer);
        this.histTimer = setTimeout(() => drawHistogram(this.glCanvas, this.histCanvas), 60);
      }
    });
  }

  _applyStagePreviewTransform() {
    const rot90 = ((this.edits.rotate90 || 0) % 4 + 4) % 4;
    const rot = rot90 * 90 + (this.edits.straighten || 0);
    const scaleX = this.edits.flipH ? -1 : 1;
    const rad = ((this.edits.straighten || 0) * Math.PI) / 180;
    let boost = 1 + Math.abs(Math.sin(rad)) * 0.42;
    if ((rot90 === 1 || rot90 === 3) && this.stage && this.glCanvas.offsetWidth > 0 && this.glCanvas.offsetHeight > 0) {
      const fitX = (this.stage.clientWidth - 16) / this.glCanvas.offsetHeight;
      const fitY = (this.stage.clientHeight - 16) / this.glCanvas.offsetWidth;
      const fit = Math.min(1, fitX, fitY);
      if (fit > 0.1) boost *= fit;
    }
    this.glCanvas.style.transform = `rotate(${rot}deg) scale(${scaleX * boost}, ${boost})`;
  }

  _syncOverlayCanvasSize() {
    const rect = this.glCanvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.uiCanvas.width !== w || this.uiCanvas.height !== h) {
      this.uiCanvas.width = w;
      this.uiCanvas.height = h;
    }
    const stageRect = this.stage.getBoundingClientRect();
    this.uiCanvas.style.left = `${rect.left - stageRect.left}px`;
    this.uiCanvas.style.top = `${rect.top - stageRect.top}px`;
    this.uiCanvas.style.width = `${rect.width}px`;
    this.uiCanvas.style.height = `${rect.height}px`;
    return { rect, dpr };
  }

  _drawStageOverlay() {
    const info = this._syncOverlayCanvasSize();
    if (!info) return;
    const { dpr } = info;
    const ctx = this.uiCanvas.getContext("2d");
    const W = this.uiCanvas.width;
    const H = this.uiCanvas.height;
    ctx.clearRect(0, 0, W, H);

    // 1. Сітка кропу (правило третин + рамка обраних пропорцій)
    if (this.activeTool === "crop") {
      const aspectMap = { "4:5": 4 / 5, "1:1": 1, "3:2": 3 / 2, "16:9": 16 / 9, "9:16": 9 / 16 };
      const targetAr = aspectMap[this.edits.aspect];
      let cw = W, ch = H;
      if (targetAr) {
        const curAr = W / H;
        if (curAr > targetAr) cw = H * targetAr;
        else ch = W / targetAr;
      }
      const x0 = (W - cw) / 2;
      const y0 = (H - ch) / 2;

      // Затемнюємо зони поза кропом
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(0, 0, W, y0);
      ctx.fillRect(0, y0 + ch, W, H - y0 - ch);
      ctx.fillRect(0, y0, x0, ch);
      ctx.fillRect(x0 + cw, y0, W - x0 - cw, ch);

      // Біла рамка + правило третин
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x0, y0, cw, ch);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1 * dpr;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + (cw * i) / 3, y0);
        ctx.lineTo(x0 + (cw * i) / 3, y0 + ch);
        ctx.moveTo(x0, y0 + (ch * i) / 3);
        ctx.lineTo(x0 + cw, y0 + (ch * i) / 3);
        ctx.stroke();
      }
      return;
    }

    // 2. Ручки активної маски (Лінійна / Радіальна)
    if (this.activeTool === "masks" && this.selectedMaskIdx >= 0) {
      const m = this.masks[this.selectedMaskIdx];
      if (!m) return;

      if (m.type === "linear") {
        const x1 = m.x1 * W, y1 = m.y1 * H;
        const x2 = m.x2 * W, y2 = m.y2 * H;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Точка 1 (100% сили — помаранчева) і Точка 2 (0% — блакитна)
        this._drawHandle(ctx, x1, y1, "#f97316", dpr);
        this._drawHandle(ctx, x2, y2, "#00a8f3", dpr);
      } else if (m.type === "radial") {
        const cx = m.cx * W, cy = m.cy * H;
        const rx = m.rx * W, ry = m.ry * H;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(4, rx), Math.max(4, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        this._drawHandle(ctx, cx, cy, "#f97316", dpr);
        this._drawHandle(ctx, cx + rx, cy, "#00a8f3", dpr);
      }
    }
  }

  _drawHandle(ctx, x, y, fill, dpr) {
    ctx.beginPath();
    ctx.arc(x, y, 9 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  _bindStagePointers() {
    const getUv = (e) => {
      const rect = this.glCanvas.getBoundingClientRect();
      return {
        u: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
        v: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))),
      };
    };

    this.uiCanvas.addEventListener("pointerdown", (e) => {
      if (!this.engine) return;
      this.uiCanvas.setPointerCapture(e.pointerId);
      const { u, v } = getUv(e);

      if (this.activeTool === "masks" && this.selectedMaskIdx >= 0) {
        const m = this.masks[this.selectedMaskIdx];
        if (m.type === "brush") {
          this.activeDrag = { mode: "brush" };
          this.engine.paintBrushStroke(this.selectedMaskIdx, u, v, this.brushSize, this.brushFeather, this.brushErase);
          this._requestRender(true);
          return;
        }
        if (m.type === "linear") {
          const d1 = Math.hypot(u - m.x1, v - m.y1);
          const d2 = Math.hypot(u - m.x2, v - m.y2);
          this.activeDrag = { mode: d1 <= d2 ? "p1" : "p2" };
          if (this.activeDrag.mode === "p1") { m.x1 = u; m.y1 = v; } else { m.x2 = u; m.y2 = v; }
          this._requestRender(true);
          return;
        }
        if (m.type === "radial") {
          const dEdge = Math.hypot(u - (m.cx + m.rx), v - m.cy);
          const dCenter = Math.hypot(u - m.cx, v - m.cy);
          this.activeDrag = { mode: dEdge < 0.12 && dEdge < dCenter ? "radius" : "center" };
          this._updateRadialDrag(m, u, v);
          this._requestRender(true);
          return;
        }
      }

      // На всіх інших вкладках утримання пальця на фото показує Оригінал (До / Після)
      this.activeDrag = { mode: "compare" };
      this.showOriginal = true;
      this._requestRender(false);
    });

    this.uiCanvas.addEventListener("pointermove", (e) => {
      if (!this.activeDrag || !this.engine) return;
      const { u, v } = getUv(e);
      const m = this.masks[this.selectedMaskIdx];

      if (this.activeDrag.mode === "brush" && m) {
        this.engine.paintBrushStroke(this.selectedMaskIdx, u, v, this.brushSize, this.brushFeather, this.brushErase);
        this._requestRender(false);
      } else if (this.activeDrag.mode === "p1" && m) {
        m.x1 = u; m.y1 = v;
        this._requestRender(false);
      } else if (this.activeDrag.mode === "p2" && m) {
        m.x2 = u; m.y2 = v;
        this._requestRender(false);
      } else if ((this.activeDrag.mode === "center" || this.activeDrag.mode === "radius") && m) {
        this._updateRadialDrag(m, u, v);
        this._requestRender(false);
      }
    });

    const endDrag = () => {
      if (!this.activeDrag) return;
      if (this.activeDrag.mode === "compare") {
        this.showOriginal = false;
      }
      this.activeDrag = null;
      this._requestRender(true);
    };
    this.uiCanvas.addEventListener("pointerup", endDrag);
    this.uiCanvas.addEventListener("pointercancel", endDrag);
  }

  _updateRadialDrag(m, u, v) {
    if (this.activeDrag.mode === "center") {
      m.cx = u;
      m.cy = v;
    } else {
      m.rx = Math.max(0.05, Math.min(0.85, Math.abs(u - m.cx)));
      m.ry = Math.max(0.05, Math.min(0.85, Math.abs(v - m.cy) > 0.04 ? Math.abs(v - m.cy) : m.rx));
    }
  }

  // ---------------- РЕНДЕР НИЖНЬОЇ ПАНЕЛІ ІНСТРУМЕНТІВ ----------------

  _sliderHtml(id, label, min, max, step, value, fmt) {
    return `
      <div class="st-slider-row">
        <div class="st-slider-head">
          <span>${label}</span>
          <span class="st-slider-val" id="sv-${id}">${fmt(value)}</span>
        </div>
        <input id="sl-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>`;
  }

  _bindSliders(defs, targetObj, onAfter) {
    for (const d of defs) {
      const el = document.getElementById(`sl-${d.key}`);
      const valEl = document.getElementById(`sv-${d.key}`);
      if (!el) continue;
      el.addEventListener("input", () => {
        const v = Number(el.value);
        targetObj[d.key] = v;
        if (valEl) valEl.textContent = d.fmt(v);
        if (onAfter) onAfter();
        this._requestRender(true);
      });
      el.addEventListener("change", () => this._pushHistory());
      // Тап по підпису скидає повзунок у 0 (як у Lightroom!)
      valEl?.addEventListener("click", () => {
        targetObj[d.key] = d.def ?? 0;
        el.value = String(d.def ?? 0);
        valEl.textContent = d.fmt(d.def ?? 0);
        if (onAfter) onAfter();
        this._pushHistory();
        this._requestRender(true);
      });
    }
  }

  _renderToolPanel() {
    const box = this.panelBox;
    const fmtSign = (v) => (v > 0 ? `+${v}` : `${v}`);
    const fmtEv = (v) => (v > 0 ? `+${v.toFixed(2)} EV` : `${v.toFixed(2)} EV`);

    if (this.activeTool === "light") {
      const defs = [
        { key: "exposure",   label: t("st_sl_exposure"),   min: -3,   max: 3,   step: 0.05, fmt: fmtEv },
        { key: "contrast",   label: t("st_sl_contrast"),   min: -100, max: 100, step: 1,    fmt: fmtSign },
        { key: "highlights", label: t("st_sl_highlights"), min: -100, max: 100, step: 1,    fmt: fmtSign },
        { key: "shadows",    label: t("st_sl_shadows"),    min: -100, max: 100, step: 1,    fmt: fmtSign },
        { key: "whites",     label: t("st_sl_whites"),     min: -100, max: 100, step: 1,    fmt: fmtSign },
        { key: "blacks",     label: t("st_sl_blacks"),     min: -100, max: 100, step: 1,    fmt: fmtSign },
      ];
      box.innerHTML = defs.map((d) => this._sliderHtml(d.key, d.label, d.min, d.max, d.step, this.edits[d.key], d.fmt)).join("");
      this._bindSliders(defs, this.edits);
      return;
    }

    if (this.activeTool === "color") {
      const defs = [
        { key: "temp",       label: t("st_sl_temp"),       min: -100, max: 100, step: 1, fmt: fmtSign },
        { key: "tint",       label: t("st_sl_tint"),       min: -100, max: 100, step: 1, fmt: fmtSign },
        { key: "vibrance",   label: t("st_sl_vibrance"),   min: -100, max: 100, step: 1, fmt: fmtSign },
        { key: "saturation", label: t("st_sl_saturation"), min: -100, max: 100, step: 1, fmt: fmtSign },
      ];
      box.innerHTML = defs.map((d) => this._sliderHtml(d.key, d.label, d.min, d.max, d.step, this.edits[d.key], d.fmt)).join("");
      this._bindSliders(defs, this.edits);
      return;
    }

    if (this.activeTool === "hsl") {
      const i = this.activeHslIdx;
      const dots = HSL_BANDS.map((b, idx) => `
        <button class="hsl-dot ${idx === i ? "active" : ""}" data-hsl-idx="${idx}" style="background:${b.color};" type="button" title="${t(`hsl_${b.key}`)}"></button>
      `).join("");
      box.innerHTML = `
        <div class="hsl-bar">${dots}</div>
        <div class="muted" style="text-align:center;margin-bottom:6px;">${t("st_hsl_channel")} <strong>${t(`hsl_${HSL_BANDS[i].key}`)}</strong></div>
        ${this._sliderHtml("hslH", t("st_hsl_h"), -100, 100, 1, this.edits.hslH[i], fmtSign)}
        ${this._sliderHtml("hslS", t("st_hsl_s"), -100, 100, 1, this.edits.hslS[i], fmtSign)}
        ${this._sliderHtml("hslL", t("st_hsl_l"), -100, 100, 1, this.edits.hslL[i], fmtSign)}
      `;
      box.querySelectorAll("[data-hsl-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.activeHslIdx = Number(btn.dataset.hslIdx);
          this._renderToolPanel();
        });
      });
      for (const ch of ["hslH", "hslS", "hslL"]) {
        const el = document.getElementById(`sl-${ch}`);
        const vEl = document.getElementById(`sv-${ch}`);
        el.addEventListener("input", () => {
          const v = Number(el.value);
          this.edits[ch][i] = v;
          vEl.textContent = fmtSign(v);
          this._requestRender(true);
        });
        el.addEventListener("change", () => this._pushHistory());
        vEl.addEventListener("click", () => {
          this.edits[ch][i] = 0;
          el.value = "0";
          vEl.textContent = "0";
          this._pushHistory();
          this._requestRender(true);
        });
      }
      return;
    }

    if (this.activeTool === "grade") {
      const defs = [
        { key: "shadowHue", label: t("st_grade_sh_hue"), min: 0, max: 360, step: 1, fmt: (v) => `${v}°`, def: 210 },
        { key: "shadowSat", label: t("st_grade_sh_sat"), min: 0, max: 100, step: 1, fmt: (v) => `${v}%` },
        { key: "highHue",   label: t("st_grade_hi_hue"), min: 0, max: 360, step: 1, fmt: (v) => `${v}°`, def: 38 },
        { key: "highSat",   label: t("st_grade_hi_sat"), min: 0, max: 100, step: 1, fmt: (v) => `${v}%` },
      ];
      box.innerHTML = `
        <div class="btn-row" style="margin-bottom:8px;">
          <button class="btn btn-sm" id="btn-grade-to" type="button">Teal & Orange</button>
          <button class="btn btn-sm" id="btn-grade-warm" type="button">${t("st_grade_warm")}</button>
          <button class="btn btn-sm" id="btn-grade-reset" type="button">${t("st_reset")}</button>
        </div>
        ${defs.map((d) => this._sliderHtml(d.key, d.label, d.min, d.max, d.step, this.edits[d.key], d.fmt)).join("")}
      `;
      this._bindSliders(defs, this.edits);
      document.getElementById("btn-grade-to").addEventListener("click", () => {
        this.edits.shadowHue = 195; this.edits.shadowSat = 34; this.edits.highHue = 35; this.edits.highSat = 26;
        this._renderToolPanel(); this._requestRender(true);
      });
      document.getElementById("btn-grade-warm").addEventListener("click", () => {
        this.edits.shadowHue = 32; this.edits.shadowSat = 18; this.edits.highHue = 44; this.edits.highSat = 24;
        this._renderToolPanel(); this._requestRender(true);
      });
      document.getElementById("btn-grade-reset").addEventListener("click", () => {
        this.edits.shadowSat = 0; this.edits.highSat = 0;
        this._renderToolPanel(); this._requestRender(true);
      });
      return;
    }

    if (this.activeTool === "curve") {
      const names = [t("st_curve_0"), t("st_curve_1"), t("st_curve_2"), t("st_curve_3"), t("st_curve_4")];
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <canvas id="studio-curve-svg" width="120" height="84" style="border:2px solid var(--border);background:#070914;flex-shrink:0;"></canvas>
          <div class="btn-row">
            <button class="btn btn-sm" id="btn-curve-s" type="button">${t("st_curve_s")}</button>
            <button class="btn btn-sm" id="btn-curve-matte" type="button">${t("st_curve_matte")}</button>
            <button class="btn btn-sm" id="btn-curve-flat" type="button">${t("st_reset")}</button>
          </div>
        </div>
        ${names.map((n, idx) => this._sliderHtml(`cv${idx}`, n, -50, 50, 1, this.edits.curve[idx], fmtSign)).join("")}
      `;
      const drawCurvePreview = () => {
        const c = document.getElementById("studio-curve-svg");
        if (!c) return;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.strokeStyle = "rgba(148,163,184,0.3)";
        ctx.beginPath(); ctx.moveTo(0, c.height); ctx.lineTo(c.width, 0); ctx.stroke();
        ctx.strokeStyle = "#00a8f3";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const x = (i / 4) * c.width;
          const yNorm = Math.max(0, Math.min(1, i / 4 + this.edits.curve[i] / 140));
          const y = (1 - yNorm) * c.height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawCurvePreview();
      for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`sl-cv${i}`);
        const vEl = document.getElementById(`sv-cv${i}`);
        el.addEventListener("input", () => {
          this.edits.curve[i] = Number(el.value);
          vEl.textContent = fmtSign(this.edits.curve[i]);
          drawCurvePreview();
          this._requestRender(true);
        });
        el.addEventListener("change", () => this._pushHistory());
      }
      document.getElementById("btn-curve-s").addEventListener("click", () => {
        this.edits.curve = [-6, -14, 0, 14, 6];
        this._pushHistory(); this._renderToolPanel(); this._requestRender(true);
      });
      document.getElementById("btn-curve-matte").addEventListener("click", () => {
        this.edits.curve = [16, -6, 2, 10, -4];
        this._pushHistory(); this._renderToolPanel(); this._requestRender(true);
      });
      document.getElementById("btn-curve-flat").addEventListener("click", () => {
        this.edits.curve = [0, 0, 0, 0, 0];
        this._pushHistory(); this._renderToolPanel(); this._requestRender(true);
      });
      return;
    }

    if (this.activeTool === "effects") {
      const defs = [
        { key: "clarity",  label: t("st_sl_clarity"),  min: -100, max: 100, step: 1, fmt: fmtSign },
        { key: "sharpen",  label: t("st_sl_sharpen"),  min: 0,    max: 100, step: 1, fmt: (v) => `${v}` },
        { key: "vignette", label: t("st_sl_vignette"), min: -100, max: 100, step: 1, fmt: fmtSign },
        { key: "grain",    label: t("st_sl_grain"),    min: 0,    max: 100, step: 1, fmt: (v) => `${v}` },
        { key: "fade",     label: t("st_sl_fade"),     min: 0,    max: 100, step: 1, fmt: (v) => `${v}` },
      ];
      box.innerHTML = defs.map((d) => this._sliderHtml(d.key, d.label, d.min, d.max, d.step, this.edits[d.key], d.fmt)).join("");
      this._bindSliders(defs, this.edits);
      return;
    }

    if (this.activeTool === "presets") {
      const all = [...BUILTIN_PRESETS, ...this.customPresets];
      const presetTitle = (p) => (p.id === "orig" ? t("st_preset_orig") : p.name);
      box.innerHTML = `
        <div class="btn-row" style="margin-bottom:8px;">
          <button id="btn-copy-edits" class="btn btn-sm btn-blue" type="button">${t("st_copy_edits")}</button>
          <button id="btn-paste-edits" class="btn btn-sm ${this.copiedPatch ? "btn-primary" : ""}" ${this.copiedPatch ? "" : "disabled"} type="button">${t("st_paste_edits")}</button>
        </div>
        <div class="btn-row" style="margin-bottom:8px;">
          <input id="inp-preset-name" type="text" placeholder="${escapeHtml(t("st_preset_ph"))}" style="flex:1;min-width:140px;padding:6px 8px;font-size:12px;" />
          <button id="btn-save-preset" class="btn btn-sm btn-primary" type="button">${t("st_preset_save_btn")}</button>
        </div>
        <div class="chips">
          ${all.map((p) => `<button class="chip" data-preset-id="${p.id}" type="button">${escapeHtml(presetTitle(p))}</button>`).join("")}
        </div>
      `;
      document.getElementById("btn-copy-edits").addEventListener("click", () => this._copyEdits());
      document.getElementById("btn-paste-edits").addEventListener("click", () => this._pasteEdits());
      box.querySelectorAll("[data-preset-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pr = all.find((x) => x.id === btn.dataset.presetId);
          if (!pr) return;
          const keepGeom = {
            straighten: this.edits.straighten,
            rotate90: this.edits.rotate90,
            flipH: this.edits.flipH,
            aspect: this.edits.aspect,
          };
          const fresh = createDefaultEdits();
          Object.assign(fresh, JSON.parse(JSON.stringify(pr.patch || {})), keepGeom);
          this.edits = fresh;
          this._pushHistory();
          this._requestRender(true);
          this.showToast(t("st_preset_applied", { name: presetTitle(pr) }));
        });
      });
      document.getElementById("btn-save-preset").addEventListener("click", () => {
        const inp = document.getElementById("inp-preset-name");
        const name = (inp?.value || "").trim() || t("st_preset_default_name", { n: this.customPresets.length + 1 });
        const patch = JSON.parse(JSON.stringify(this.edits));
        delete patch.straighten; delete patch.rotate90; delete patch.flipH; delete patch.aspect;
        this.customPresets.unshift({ id: `cp_${Date.now()}`, name, patch });
        saveCustomPresets(this.customPresets);
        if (this.onPresetsChanged) this.onPresetsChanged();
        this._renderToolPanel();
        this.showToast(t("st_preset_saved", { name }));
      });
      return;
    }

    if (this.activeTool === "masks") {
      const canAdd = this.masks.length < 4;
      const maskLabel = (m) => t(`st_mask_name_${m.type}`);
      const maskTabs = this.masks.map((m, i) => `
        <button class="chip ${i === this.selectedMaskIdx ? "active" : ""}" data-msel="${i}" type="button">
          ${i + 1}. ${maskLabel(m)}${m.invert ? " " + t("st_mask_inv_tag") : ""}
        </button>`).join("");

      const activeM = this.selectedMaskIdx >= 0 ? this.masks[this.selectedMaskIdx] : null;
      let controlsHtml = `<div class="muted" style="padding:8px 0;">${t("st_mask_empty")}</div>`;

      if (activeM) {
        const brushBar = activeM.type === "brush" ? `
          <div class="btn-row" style="margin-bottom:6px;">
            <button id="btn-br-draw" class="btn btn-sm ${!this.brushErase ? "btn-primary" : ""}" type="button">${t("st_mask_draw")}</button>
            <button id="btn-br-erase" class="btn btn-sm ${this.brushErase ? "btn-primary" : ""}" type="button">${t("st_mask_erase")}</button>
            <button id="btn-br-clear" class="btn btn-sm btn-danger" type="button">${t("st_mask_clear_br")}</button>
          </div>
          ${this._sliderHtml("brSize", t("st_mask_br_size"), 3, 25, 1, Math.round(this.brushSize * 100), (v) => `${v}%`)}
        ` : activeM.type === "radial" ? `
          ${this._sliderHtml("mFeather", t("st_mask_feather"), 10, 95, 1, Math.round(activeM.feather * 100), (v) => `${v}%`)}
        ` : "";

        const mDefs = [
          { key: "exposure",   label: t("st_mask_exp"),  min: -3,   max: 3,   step: 0.05, fmt: fmtEv },
          { key: "contrast",   label: t("st_mask_con"),  min: -100, max: 100, step: 1,    fmt: fmtSign },
          { key: "highlights", label: t("st_mask_hi"),   min: -100, max: 100, step: 1,    fmt: fmtSign },
          { key: "shadows",    label: t("st_mask_sh"),   min: -100, max: 100, step: 1,    fmt: fmtSign },
          { key: "temp",       label: t("st_mask_temp"), min: -100, max: 100, step: 1,    fmt: fmtSign },
          { key: "saturation", label: t("st_mask_sat"),  min: -100, max: 100, step: 1,    fmt: fmtSign },
          { key: "clarity",    label: t("st_mask_clar"), min: -100, max: 100, step: 1,    fmt: fmtSign },
        ];

        controlsHtml = `
          <div class="btn-row" style="margin:6px 0 8px;">
            <button id="btn-m-ov" class="btn btn-sm ${this.showMaskOverlay ? "btn-blue" : ""}" type="button">${this.showMaskOverlay ? t("st_mask_ov_on") : t("st_mask_ov_off")}</button>
            <button id="btn-m-inv" class="btn btn-sm ${activeM.invert ? "btn-primary" : ""}" type="button">${t("st_mask_invert")}</button>
            <button id="btn-m-del" class="btn btn-sm btn-danger" type="button">${t("btn_delete")}</button>
          </div>
          ${brushBar}
          ${mDefs.map((d) => this._sliderHtml(d.key, d.label, d.min, d.max, d.step, activeM[d.key], d.fmt)).join("")}
        `;
      }

      box.innerHTML = `
        <div class="btn-row" style="margin-bottom:8px;">
          <button class="btn btn-sm btn-blue" data-add-mask="linear" ${canAdd ? "" : "disabled"} type="button">${t("st_mask_add_lin")}</button>
          <button class="btn btn-sm btn-blue" data-add-mask="radial" ${canAdd ? "" : "disabled"} type="button">${t("st_mask_add_rad")}</button>
          <button class="btn btn-sm btn-blue" data-add-mask="brush"  ${canAdd ? "" : "disabled"} type="button">${t("st_mask_add_br")}</button>
        </div>
        ${this.masks.length ? `<div class="chips" style="margin-bottom:6px;">${maskTabs}</div>` : ""}
        ${controlsHtml}
      `;

      box.querySelectorAll("[data-add-mask]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.masks.length >= 4) return;
          const idx = this.masks.length;
          this.masks.push(createMask(btn.dataset.addMask, `m_${Date.now()}`));
          this.selectedMaskIdx = idx;
          if (btn.dataset.addMask === "brush") this.engine.clearBrushMask(idx);
          this.showMaskOverlay = true;
          this._renderToolPanel();
          this._requestRender(true);
        });
      });

      box.querySelectorAll("[data-msel]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectedMaskIdx = Number(btn.dataset.msel);
          this._renderToolPanel();
          this._requestRender(false);
        });
      });

      if (activeM) {
        document.getElementById("btn-m-ov")?.addEventListener("click", () => {
          this.showMaskOverlay = !this.showMaskOverlay;
          this._renderToolPanel();
          this._requestRender(false);
        });
        document.getElementById("btn-m-inv")?.addEventListener("click", () => {
          activeM.invert = !activeM.invert;
          this._renderToolPanel();
          this._requestRender(true);
        });
        document.getElementById("btn-m-del")?.addEventListener("click", () => {
          this.engine.removeBrushSlot(this.selectedMaskIdx);
          this.masks.splice(this.selectedMaskIdx, 1);
          this.selectedMaskIdx = this.masks.length ? Math.min(this.selectedMaskIdx, this.masks.length - 1) : -1;
          this._renderToolPanel();
          this._requestRender(true);
        });
        document.getElementById("btn-br-draw")?.addEventListener("click", () => { this.brushErase = false; this._renderToolPanel(); });
        document.getElementById("btn-br-erase")?.addEventListener("click", () => { this.brushErase = true; this._renderToolPanel(); });
        document.getElementById("btn-br-clear")?.addEventListener("click", () => {
          this.engine.clearBrushMask(this.selectedMaskIdx);
          this._requestRender(true);
        });
        document.getElementById("sl-brSize")?.addEventListener("input", (e) => {
          this.brushSize = Number(e.target.value) / 100;
          document.getElementById("sv-brSize").textContent = `${e.target.value}%`;
        });
        document.getElementById("sl-mFeather")?.addEventListener("input", (e) => {
          activeM.feather = Number(e.target.value) / 100;
          document.getElementById("sv-mFeather").textContent = `${e.target.value}%`;
          this._requestRender(true);
        });

        this._bindSliders([
          { key: "exposure", fmt: fmtEv },
          { key: "contrast", fmt: fmtSign },
          { key: "highlights", fmt: fmtSign },
          { key: "shadows", fmt: fmtSign },
          { key: "temp", fmt: fmtSign },
          { key: "saturation", fmt: fmtSign },
          { key: "clarity", fmt: fmtSign },
        ], activeM);
      }
      return;
    }

    if (this.activeTool === "crop") {
      const ratios = [
        { k: "orig", l: t("st_crop_orig") },
        { k: "4:5",  l: "4:5 (Insta)" },
        { k: "1:1",  l: "1:1" },
        { k: "3:2",  l: "3:2" },
        { k: "16:9", l: "16:9" },
        { k: "9:16", l: "9:16 (Reels)" },
      ];
      box.innerHTML = `
        <div class="chips" style="margin-bottom:8px;">
          ${ratios.map((r) => `<button class="chip ${this.edits.aspect === r.k ? "active" : ""}" data-ar="${r.k}" type="button">${r.l}</button>`).join("")}
        </div>
        ${this._sliderHtml("straighten", t("st_crop_straighten"), -45, 45, 0.5, this.edits.straighten, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`)}
        <div class="btn-row" style="margin-top:6px;">
          <button id="btn-rot-90" class="btn btn-sm" type="button">${t("st_crop_rot90")}</button>
          <button id="btn-flip-h" class="btn btn-sm ${this.edits.flipH ? "btn-primary" : ""}" type="button">${t("st_crop_flip")}</button>
        </div>
      `;
      box.querySelectorAll("[data-ar]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.edits.aspect = btn.dataset.ar;
          this._pushHistory();
          this._renderToolPanel();
          this._requestRender(false);
        });
      });
      this._bindSliders([{ key: "straighten", fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°` }], this.edits);
      document.getElementById("btn-rot-90").addEventListener("click", () => {
        this.edits.rotate90 = (this.edits.rotate90 + 1) % 4;
        this._pushHistory();
        this._requestRender(false);
      });
      document.getElementById("btn-flip-h").addEventListener("click", () => {
        this.edits.flipH = !this.edits.flipH;
        this._pushHistory();
        this._renderToolPanel();
        this._requestRender(false);
      });
    }
  }

  // ---------------- ЕКСПОРТ У ПОВНІЙ ЯКОСТІ В ГАЛЕРЕЮ (JPG І 16-БІТ RAW) ----------------

  async _exportPhoto() {
    if (!this.engine) return;
    const btn = document.getElementById("btn-studio-save");
    btn.disabled = true;
    btn.textContent = t("st_saving");

    const finishSave = async (dataUrl, filename) => {
      if (window.AndroidBridge?.beginImageSave) {
        const base64 = dataUrl.split(",")[1];
        const chunkSize = 200000;
        window.AndroidBridge.beginImageSave(filename);
        for (let i = 0; i < base64.length; i += chunkSize) {
          window.AndroidBridge.appendImageChunk(base64.slice(i, i + chunkSize));
        }
        window.AndroidBridge.finishImageSave();
        this.vibrate(70);
        return;
      }
      // Нативний iOS Bridge (якщо запущено через FrameKit.ipa)
      if (window.webkit?.messageHandlers?.savePhoto) {
        window.webkit.messageHandlers.savePhoto.postMessage({ filename, base64: dataUrl.split(",")[1] });
        this.showToast(t("saved_file_toast", { name: filename }));
        return;
      }
      // iOS Safari PWA: нативний Share Sheet ("Зберегти зображення" прямо в iPhone Фото!)
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], filename, { type: "image/jpeg" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "FrameKit" });
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
      this.showToast(t("saved_file_toast", { name: filename }));
    };

    try {
      const filename = `${this.fileNameBase}_FK_${Date.now().toString().slice(-5)}.jpg`;
      let dataUrl = null;

      if (this.rawArrayBuffer) {
        this._setLoading(true, t("st_raw_exporting"));
        const maxSide = this.engine.getMaxExportSize();
        const full = await decodeRawBuffer(this.rawArrayBuffer, {
          mode: "export",
          maxSide,
          fixedBaseGain: this.rawBaseGain,
        });
        dataUrl = this.engine.exportRawFloatDataUrl(full.floatData, full.width, full.height, this.edits, this.masks, 0.95);
        this._setLoading(false);
      } else {
        await new Promise((r) => setTimeout(r, 30));
        dataUrl = this.engine.exportFullResDataUrl(this.edits, this.masks, 0.93);
      }

      if (dataUrl) await finishSave(dataUrl, filename);
    } catch (err) {
      this._setLoading(false);
      this.showToast(t("st_err_export", { err: err.message }));
    } finally {
      btn.disabled = false;
      btn.textContent = t("st_save");
    }
  }
}
