/**
 * Фоновий Web Worker для офлайн-декодування 14/16-бітних камерних RAW
 * (.CR3, .CR2, .ARW, .NEF, .DNG, .RAF, .ORF, .RW2, .PEF, .SRW тощо)
 * на базі LibRaw 0.22 (WebAssembly). Працює без блокування UI.
 */

import createWLibRawModule from "../vendor/wlibraw/wlibraw.js";
import { createBindings } from "../vendor/wlibraw/api.js";
import { WLibRawFile } from "../vendor/wlibraw/file.js";
import { OutputColor } from "../vendor/wlibraw/types.js";

let wasmMod = null;
let wasmBindings = null;
let initPromise = null;

async function ensureWasm() {
  if (wasmMod && wasmBindings) return { module: wasmMod, bindings: wasmBindings };
  if (!initPromise) {
    const wasmUrl = new URL("../vendor/wlibraw/wlibraw.wasm", import.meta.url).href;
    initPromise = createWLibRawModule({
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    }).then((mod) => {
      wasmMod = mod;
      wasmBindings = createBindings(mod);
      return { module: wasmMod, bindings: wasmBindings };
    });
  }
  return initPromise;
}

/**
 * Обчислює м'яку нормалізацію лінійного діапазону RAW (щоб компенсувати
 * резерв під highlightMode=5, не пересвічуючи нічні кадри).
 */
function estimateBaseGain(u16, width, height, colors) {
  const totalPx = width * height;
  const step = Math.max(1, Math.floor(totalPx / 4500));
  const lumas = [];
  for (let px = 0; px < totalPx; px += step) {
    const idx = px * colors;
    const r = u16[idx] / 65535;
    const g = colors >= 3 ? u16[idx + 1] / 65535 : r;
    const b = colors >= 3 ? u16[idx + 2] / 65535 : r;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (y > 0.0005) lumas.push(y);
  }
  if (lumas.length < 32) return 1.35;
  lumas.sort((a, b) => a - b);
  const p99 = lumas[Math.min(lumas.length - 1, Math.floor(lumas.length * 0.992))];
  const p50 = lumas[Math.floor(lumas.length * 0.5)];
  // Якщо кадр темний (ніч), не тягнемо шум вгору занадто сильно
  if (p50 < 0.025 && p99 < 0.35) return 1.4;
  // Відновлюємо запас LibRaw highlightMode=5 без кліпування 16-бітних піків
  const target = p99 < 0.62 ? 0.88 / Math.max(0.28, p99) : 1.15;
  return Math.max(1.0, Math.min(2.25, target));
}

/**
 * Переводить 16-бітний RGB (3 або 1 канал) у Float32Array RGBA з якісним
 * box-даунсемплінгом до maxSide, зберігаючи HDR-значення > 1.0 для витягування світлих.
 */
function packToFloat32Rgba(u16, srcW, srcH, colors, maxSide, baseGain) {
  let dstW = srcW;
  let dstH = srcH;
  if (srcW > maxSide || srcH > maxSide) {
    const ratio = Math.min(maxSide / srcW, maxSide / srcH);
    dstW = Math.max(1, Math.round(srcW * ratio));
    dstH = Math.max(1, Math.round(srcH * ratio));
  }

  const out = new Float32Array(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  const inv65535 = baseGain / 65535.0;

  if (dstW === srcW && dstH === srcH) {
    for (let i = 0, s = 0, d = 0; i < srcW * srcH; i++, s += colors, d += 4) {
      const r = u16[s] * inv65535;
      out[d] = r;
      out[d + 1] = colors >= 3 ? u16[s + 1] * inv65535 : r;
      out[d + 2] = colors >= 3 ? u16[s + 2] * inv65535 : r;
      out[d + 3] = 1.0;
    }
    return { data: out, width: dstW, height: dstH };
  }

  // Якісне усереднення (area/box filter), щоб не було муару при зменшенні 30-50MP RAW
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.min(srcH, Math.max(y0 + 1, Math.floor((y + 1) * scaleY)));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.min(srcW, Math.max(x0 + 1, Math.floor((x + 1) * scaleX)));
      let sr = 0, sg = 0, sb = 0, cnt = 0;
      for (let sy = y0; sy < y1; sy++) {
        let idx = (sy * srcW + x0) * colors;
        for (let sx = x0; sx < x1; sx++, idx += colors) {
          sr += u16[idx];
          if (colors >= 3) {
            sg += u16[idx + 1];
            sb += u16[idx + 2];
          } else {
            sg += u16[idx];
            sb += u16[idx];
          }
          cnt++;
        }
      }
      const k = inv65535 / Math.max(1, cnt);
      const d = (y * dstW + x) * 4;
      out[d] = sr * k;
      out[d + 1] = sg * k;
      out[d + 2] = sb * k;
      out[d + 3] = 1.0;
    }
  }
  return { data: out, width: dstW, height: dstH };
}

self.onmessage = async (e) => {
  const { id, buffer, mode = "preview", maxSide = 1600, fixedBaseGain = null } = e.data || {};
  let rawFile = null;
  let img = null;
  try {
    const { module, bindings } = await ensureWasm();
    const bytes = new Uint8Array(buffer);
    rawFile = WLibRawFile.open(module, bindings, bytes);
    const meta = rawFile.metadata;

    const isPreview = mode === "preview";
    img = rawFile.decode({
      halfSize: isPreview,
      outputBps: 16,
      outputColor: OutputColor.SRGB,
      userQual: isPreview ? 0 : 3, // AHD демозаїк у повній якості на експорті
      useCameraWb: true,
      noAutoBright: true,
      highlightMode: 5,            // Відновлення пересвітів (Blend/Reconstruct)
      linear: true,                // Справжній 16-бітний лінійний простір
    });

    const u16 = img.toUint16Array();
    const srcW = img.width;
    const srcH = img.height;
    const colors = img.colors;

    // Негайно звільняємо WASM-пам'ять перед пакуванням Float32
    img.free();
    img = null;
    rawFile.close();
    rawFile = null;

    const baseGain = fixedBaseGain != null ? fixedBaseGain : estimateBaseGain(u16, srcW, srcH, colors);
    const packed = packToFloat32Rgba(u16, srcW, srcH, colors, maxSide, baseGain);

    self.postMessage(
      {
        id,
        ok: true,
        width: packed.width,
        height: packed.height,
        origWidth: meta.width || srcW,
        origHeight: meta.height || srcH,
        baseGain,
        metadata: {
          make: meta.make || meta.normalizedMake || "",
          model: meta.model || meta.normalizedModel || "",
          lens: meta.lens || "",
          isoSpeed: meta.isoSpeed || 0,
          shutter: meta.shutter || 0,
          aperture: meta.aperture || 0,
          focalLength: meta.focalLength || 0,
        },
        floatBuffer: packed.data.buffer,
      },
      [packed.data.buffer]
    );
  } catch (err) {
    try { img?.free(); } catch { /* ignore */ }
    try { rawFile?.close(); } catch { /* ignore */ }
    self.postMessage({
      id,
      ok: false,
      error: err?.message || String(err),
    });
  }
};
