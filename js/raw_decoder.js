/**
 * Клієнт офлайн RAW-декодера (LibRaw 0.22 WASM у Web Worker + резервний режим).
 * Підтримує: .CR3, .CR2, .CRW, .ARW, .SR2, .SRF, .NEF, .NRW, .DNG, .RAF, .ORF, .RW2, .PEF, .SRW, .3FR, .IIQ.
 */

const RAW_EXT_RE = /\.(cr3|cr2|crw|arw|sr2|srf|nef|nrw|dng|raf|orf|ori|rw2|rwl|pef|srw|3fr|fff|iiq|mrw|kdc|dcr|erf|mef)$/i;

let worker = null;
let reqSeq = 1;
const pending = new Map();

export function isRawFile(file) {
  if (!file) return false;
  if (RAW_EXT_RE.test(file.name || "")) return true;
  const mime = (file.type || "").toLowerCase();
  return mime.includes("raw") || mime.includes("dng") || mime.includes("cr2") || mime.includes("cr3") || mime.includes("nef") || mime.includes("arw");
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./raw_worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const msg = e.data;
    const entry = pending.get(msg?.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) {
      entry.resolve({
        width: msg.width,
        height: msg.height,
        origWidth: msg.origWidth,
        origHeight: msg.origHeight,
        baseGain: msg.baseGain,
        metadata: msg.metadata,
        floatData: new Float32Array(msg.floatBuffer),
      });
    } else {
      entry.reject(new Error(msg.error || "RAW decode failed"));
    }
  };
  worker.onerror = (err) => {
    const message = err?.message || "RAW worker error";
    for (const entry of pending.values()) {
      entry.reject(new Error(message));
    }
    pending.clear();
    try { worker?.terminate(); } catch { /* ignore */ }
    worker = null;
  };
  return worker;
}

/**
 * Декодує RAW ArrayBuffer у 16-бітний лінійний Float32Array RGBA + EXIF метадані.
 * @param {ArrayBuffer} arrayBuffer  Буфер RAW-файлу (копіюється перед передачею, оригінал лишається цілим)
 * @param {{ mode?: "preview"|"export", maxSide?: number, fixedBaseGain?: number|null }} opts
 */
export function decodeRawBuffer(arrayBuffer, opts = {}) {
  const { mode = "preview", maxSide = 1600, fixedBaseGain = null } = opts;
  const copy = arrayBuffer.slice(0);
  const w = getWorker();
  const id = reqSeq++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, buffer: copy, mode, maxSide, fixedBaseGain }, [copy]);
  });
}

/**
 * Форматує короткий EXIF-рядок для HUD у студії (напр. "RAW 16-bit · EOS R · 70mm · f/2.8 · 1/500s · ISO 400").
 */
export function formatRawExifBadge(meta, lang = "uk") {
  if (!meta) return "RAW 16-bit";
  const parts = ["RAW 16-bit"];
  const cam = meta.model || meta.make || "";
  if (cam) parts.push(cam.trim());
  if (meta.focalLength > 0) {
    const fl = Math.round(meta.focalLength);
    parts.push(`${fl}${lang === "en" ? "mm" : "мм"}`);
  }
  if (meta.aperture > 0) {
    const ap = meta.aperture >= 10 ? meta.aperture.toFixed(0) : meta.aperture.toFixed(1).replace(/\.0$/, "");
    parts.push(`f/${ap}`);
  }
  if (meta.shutter > 0) {
    if (meta.shutter < 0.4) {
      parts.push(`1/${Math.max(1, Math.round(1 / meta.shutter))}${lang === "en" ? "s" : "с"}`);
    } else {
      parts.push(`${meta.shutter.toFixed(1).replace(/\.0$/, "")}${lang === "en" ? "s" : "с"}`);
    }
  }
  if (meta.isoSpeed > 0) {
    parts.push(`ISO ${Math.round(meta.isoSpeed)}`);
  }
  return parts.join(" · ");
}
