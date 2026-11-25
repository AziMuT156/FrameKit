/**
 * Офлайн-сховище FrameKit v1.1:
 * - localStorage: налаштування, теми, пасхалка, AI-ключ, чеклист, мій рюкзак
 * - IndexedDB: локації (spots), мудборд (moodboard), шедеври з координатами (masterpieces)
 */

const DB_NAME = "framekit_db";
const DB_VERSION = 2;
const LS_STATE = "framekit_state_v1";

export const DEFAULT_CHECKLIST = [
  { id: "c1", cat: "Живлення й пам'ять", text: "Акумулятори заряджені (+ запасні)", done: false },
  { id: "c2", cat: "Живлення й пам'ять", text: "SD-карти відформатовані й вставлені в камеру", done: false },
  { id: "c3", cat: "Живлення й пам'ять", text: "Повербанк + кабель USB-C", done: false },
  { id: "c4", cat: "Камера й оптика",    text: "Протерти передні лінзи + серветка з мікрофібри", done: false },
  { id: "c5", cat: "Камера й оптика",    text: "Перевірити налаштування (RAW, ISO, баланс білого)", done: false },
  { id: "c6", cat: "Камера й оптика",    text: "Бленди та кришки на місці", done: false },
  { id: "c7", cat: "Аксесуари",          text: "ND / CPL фільтри + перехідні кільця", done: false },
  { id: "c8", cat: "Аксесуари",          text: "Штатив + швидкознімний майданчик на камері", done: false },
  { id: "c9", cat: "Аксесуари",          text: "Спалах / постійне світло / відбивач", done: false },
];

export function loadAppState() {
  const defaults = {
    brandId: "sony",
    modelId: "sony_a7iv",
    lensId: "se_50_18",
    focalMm: 50,
    aperture: 1.8,
    distanceM: 2.0,
    ndBaseIdx: 7,
    ndFilter1: 11,
    ndFilter2: 0,
    tlClipSec: 15,
    tlFps: 24,
    tlIntervalSec: 3,
    tlRawMb: 35,
    astroDecl: 0,
    expBaseAp: 2.8,
    expBaseShutIdx: 9,
    expBaseIso: 400,
    expTargetAp: 1.8,
    expTargetShutIdx: 9,
    expTargetIso: 400,
    expSolveFor: "shutter",
    expComp: 0,
    theme: "pixel",          // "pixel" | "night_red" | "secret_gold"
    lang: "uk",              // "uk" | "en"
    secretUnlocked: false,
    authorNick: "@AziMuT_156",
    geminiApiKey: "",
    aiStyle: "balanced",     // "balanced" | "roast"
    myKit: [],
    checklist: DEFAULT_CHECKLIST,
    lastCoords: { lat: 50.4501, lng: 30.5234 },
  };
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      checklist: Array.isArray(parsed.checklist) && parsed.checklist.length ? parsed.checklist : defaults.checklist,
      myKit: Array.isArray(parsed.myKit) ? parsed.myKit : [],
    };
  } catch {
    return defaults;
  }
}

export function saveAppState(state) {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(state));
  } catch {
    // ignore quota
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("spots")) {
        db.createObjectStore("spots", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("moodboard")) {
        db.createObjectStore("moodboard", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("masterpieces")) {
        db.createObjectStore("masterpieces", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function compressImageFile(file, maxSide = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Пошкоджене зображення"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function exportBackupJSON() {
  const state = loadAppState();
  const spots = await dbGetAll("spots");
  const moodboard = await dbGetAll("moodboard");
  const masterpieces = await dbGetAll("masterpieces");
  return JSON.stringify({ version: 2, exportedAt: Date.now(), state, spots, moodboard, masterpieces });
}

export async function importBackupJSON(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data || typeof data !== "object") throw new Error("Невірний формат файлу");
  if (data.state) saveAppState(data.state);
  if (Array.isArray(data.spots)) {
    for (const s of data.spots) if (s.id) await dbPut("spots", s);
  }
  if (Array.isArray(data.moodboard)) {
    for (const m of data.moodboard) if (m.id) await dbPut("moodboard", m);
  }
  if (Array.isArray(data.masterpieces)) {
    for (const mp of data.masterpieces) if (mp.id) await dbPut("masterpieces", mp);
  }
}
