import {
  APERTURE_STOPS,
  CAMERA_BRANDS,
  ISO_VALUES,
  ND_FILTERS,
  SENSOR_PRESETS,
  SHUTTER_SPEEDS,
  getBrandById,
  getLensesForModel,
  getModelById,
  getModelMegapixels,
} from "./gear.js";
import {
  azimuthToCompass,
  calculateDoF,
  formatDistance,
  formatExposure,
  formatTimeHM,
  getMoonPhase,
  getSunPosition,
  getSunTimes,
  renderMoonSvg,
} from "./suncalc.js";
import {
  LIGHTING_SCHEMES,
  calculateAstro,
  calculateEquivalentExposure,
  calculateTimelapse,
  extractExifGps,
  formatDurationLong,
  renderLightingSvg,
} from "./extras.js";
import {
  compressImageFile,
  dbDelete,
  dbGetAll,
  dbPut,
  exportBackupJSON,
  importBackupJSON,
  loadAppState,
  saveAppState,
} from "./storage.js";
import { PhotoStudioController } from "./editor_ui.js";
import {
  applyDomI18n,
  formatStopsBadge,
  getLang,
  setLang,
  t,
  translateCheckItem,
  translateLightingScheme,
  translateMoodCat,
  translateNdFilter,
  translateSpotTag,
} from "./i18n.js";

const SPOT_TAGS = ["Портрет", "Архітектура", "Неон", "Природа", "Стріт", "Захід", "Інтер'єр"];
const MOOD_CATS = ["Усі", "Портрет", "Пара", "Повний зріст", "Світло / Тінь", "Стріт / Деталі"];

const state = loadAppState();
setLang(state.lang || "uk");

let deferredInstallPrompt = null;

// Карта сонця
let map = null;
let mapMarker = null;
let mapRays = [];
let mapInitialized = false;
let sunLat = state.lastCoords?.lat ?? 50.4501;
let sunLng = state.lastCoords?.lng ?? 30.5234;

// Локації / мудборд / шедеври / AI
let pendingSpotPhoto = null;
let selectedSpotTags = new Set(["Портрет"]);
let activeSpotFilter = "Усі";
let activeMoodFilter = "Усі";
let cachedSpots = [];
let cachedMoods = [];
let cachedMasterpieces = [];
let pendingMpPhoto = null;
let pendingMpCoords = null;
let pendingAiPhoto = null;

// Таймер ND + перерахунок при зміні мови
let timerTargetSec = 8;
let timerEndMs = 0;
let timerInterval = null;
let timerLastBeepSec = -1;
let wakeLock = null;
let audioCtx = null;
let refreshNdUi = () => {};
let refreshExpoUi = () => {};
let refreshAstroUi = () => {};
let syncAstroMpFromModel = () => {};
let refreshTimelapseUi = () => {};
let refreshLightingUi = () => {};

// Пасхалка (5 тапів по логотипу)
let logoTapCount = 0;
let logoTapResetTimer = null;

// Фоторедактор
let studio = null;

const $ = (id) => document.getElementById(id);

// ------------------------ УТИЛІТИ ------------------------

let toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function playBeep(freq = 880, durationMs = 110, type = "sine") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch {
    // ignore
  }
}

function playPixelFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => setTimeout(() => playBeep(f, 120, "square"), i * 95));
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function downloadOrShareText(filename, content) {
  if (window.AndroidBridge?.saveBackup) {
    window.AndroidBridge.saveBackup(filename, content);
    return;
  }
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("saved_file_toast", { name: filename }));
}

function sliderToDistance(val) {
  const minLog = Math.log(0.25);
  const maxLog = Math.log(100);
  const m = Math.exp(minLog + (Number(val) / 100) * (maxLog - minLog));
  if (m < 1) return Math.round(m * 20) / 20;
  if (m < 5) return Math.round(m * 10) / 10;
  if (m < 20) return Math.round(m * 2) / 2;
  return Math.round(m);
}

function distanceToSlider(meters) {
  const clamped = Math.max(0.25, Math.min(100, meters));
  const minLog = Math.log(0.25);
  const maxLog = Math.log(100);
  return Math.round(((Math.log(clamped) - minLog) / (maxLog - minLog)) * 100);
}

// ------------------------ МУЛЬТИМОВНІСТЬ (UA / EN) ------------------------

function applyLanguage(langCode, notify = false) {
  const code = setLang(langCode);
  state.lang = code;
  saveAppState(state);

  applyDomI18n();
  if (window.AndroidBridge?.setLang) {
    window.AndroidBridge.setLang(code);
  }
  $("lang-active-badge").textContent = code === "en" ? "EN" : "UA";
  document.querySelectorAll("#lang-buttons [data-lang]").forEach((btn) => {
    btn.classList.toggle("btn-primary", btn.dataset.lang === code);
  });

  // Оновлюємо всі динамічно згенеровані елементи
  applyTheme(state.theme || "pixel", false);
  populateLenses(true, true);
  refreshExpoUi();
  refreshNdUi();
  refreshAstroUi();
  refreshTimelapseUi();
  updateSunView();
  renderSpotTagChips();
  renderSpotsList();
  renderMasterpieces();
  renderChecklist();
  renderMoodboard();
  refreshLightingUi();
  refreshAiKeyUi();
  renderEditorPresets();
  renderKitTab();
  studio?.refreshLanguage();

  if (notify) {
    showToast(t("set_lang_changed"));
  }
}

// ------------------------ ТЕМИ І ПАСХАЛКА @AziMuT_156 ------------------------

const THEME_META = {
  pixel:       { labelKey: "theme_lbl_pixel", status: "#3F47CC", nav: "#141830" },
  night_red:   { labelKey: "theme_lbl_red",   status: "#450A0A", nav: "#090101" },
  secret_gold: { labelKey: "theme_lbl_gold",  status: "#92400E", nav: "#120E08" },
};

function applyTheme(themeKey, persist = true) {
  const key = THEME_META[themeKey] ? themeKey : "pixel";
  if (persist) {
    state.theme = key;
    saveAppState(state);
  }

  document.body.classList.remove("theme-night_red", "theme-secret_gold");
  if (key !== "pixel") document.body.classList.add(`theme-${key}`);

  const meta = THEME_META[key];
  $("theme-active-badge").textContent = t(meta.labelKey);
  document.querySelectorAll("#theme-buttons [data-theme]").forEach((btn) => {
    btn.classList.toggle("btn-primary", btn.dataset.theme === key);
  });
  const themeTag = document.querySelector('meta[name="theme-color"]');
  if (themeTag) themeTag.setAttribute("content", meta.status);
  if (window.AndroidBridge?.setThemeColors) {
    window.AndroidBridge.setThemeColors(meta.status, meta.nav);
  }
}

function initEasterEgg() {
  if (state.secretUnlocked) {
    $("btn-theme-gold").style.display = "inline-flex";
  }

  $("logo-easter-trigger").addEventListener("click", () => {
    logoTapCount++;
    clearTimeout(logoTapResetTimer);
    logoTapResetTimer = setTimeout(() => { logoTapCount = 0; }, 1600);

    if (logoTapCount >= 5) {
      logoTapCount = 0;
      state.secretUnlocked = true;
      saveAppState(state);
      $("btn-theme-gold").style.display = "inline-flex";
      $("easter-modal").classList.add("open");
      playPixelFanfare();
      vibrate([80, 60, 80, 60, 180]);
    } else if (logoTapCount >= 3) {
      showToast(t("easter_more", { n: 5 - logoTapCount }));
    }
  });

  $("btn-close-easter").addEventListener("click", () => {
    $("easter-modal").classList.remove("open");
  });
  $("easter-modal").addEventListener("click", (e) => {
    if (e.target.id === "easter-modal") $("easter-modal").classList.remove("open");
  });
  $("btn-easter-gold").addEventListener("click", () => {
    applyTheme("secret_gold");
    $("easter-modal").classList.remove("open");
    showToast(t("easter_gold_toast"));
  });
}

// ------------------------ НАВІГАЦІЯ ------------------------

function switchTab(targetId) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === targetId));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === targetId));
  if (targetId === "tab-sun") {
    ensureSunMap();
    setTimeout(() => map?.invalidateSize(), 60);
  }
  if (targetId === "tab-settings") {
    renderKitTab();
  }
}

function switchSubTab(sectionId, subKey) {
  const section = $(sectionId);
  if (!section) return;
  section.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.sub === subKey));
  section.querySelectorAll(".sub-panel").forEach((p) => p.classList.toggle("active", p.id === `sub-${subKey}`));
  if (sectionId === "tab-sun" && subKey === "sunmap") {
    ensureSunMap();
    setTimeout(() => map?.invalidateSize(), 60);
  }
}

function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".segmented").forEach((group) => {
    group.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = group.closest(".tab-panel");
        switchSubTab(section.id, btn.dataset.sub);
      });
    });
  });

  $("btn-close-lightbox").addEventListener("click", closeLightbox);
  $("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox") closeLightbox();
  });
}

function openLightbox(src, caption = "") {
  $("lightbox-img").src = src;
  $("lightbox-caption").textContent = caption;
  $("lightbox").classList.add("open");
}

function closeLightbox() {
  $("lightbox").classList.remove("open");
}

// ------------------------ КАСКАДНА БАЗА КАМЕР + ГРІП ------------------------

let activeApertureStops = [...APERTURE_STOPS];

function populateBrands() {
  const sel = $("sel-brand");
  sel.innerHTML = CAMERA_BRANDS.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  sel.value = getBrandById(state.brandId).id;
}

function populateModels(keepModelId = false) {
  const brand = getBrandById($("sel-brand").value);
  const sel = $("sel-model");
  sel.innerHTML = brand.models.map((m) => {
    const s = SENSOR_PRESETS[m.sensor];
    return `<option value="${m.id}">${escapeHtml(m.name)} (${s.crop === 1 ? "FF" : s.crop + "×"})</option>`;
  }).join("");
  if (keepModelId && brand.models.some((m) => m.id === state.modelId)) {
    sel.value = state.modelId;
  } else {
    sel.value = brand.models[0].id;
    state.modelId = sel.value;
  }
}

function populateLenses(keepLensId = false, keepValues = false) {
  const model = getModelById($("sel-brand").value, $("sel-model").value);
  const lenses = getLensesForModel(model, t("manual_lens_name"));
  const sel = $("sel-lens");
  sel.innerHTML = lenses.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join("");
  if (keepLensId && lenses.some((l) => l.id === state.lensId)) {
    sel.value = state.lensId;
  } else {
    sel.value = lenses[0].id;
    state.lensId = sel.value;
  }
  applyLensLimits(keepValues);
}

function getCurrentGear() {
  const brand = getBrandById($("sel-brand").value);
  const model = getModelById(brand.id, $("sel-model").value);
  const lenses = getLensesForModel(model, t("manual_lens_name"));
  const lens = lenses.find((l) => l.id === $("sel-lens").value) || lenses[0];
  const sensor = SENSOR_PRESETS[model.sensor] || SENSOR_PRESETS.ff;
  return { brand, model, lens, sensor };
}

function applyLensLimits(keepValues = false) {
  const { brand, model, lens, sensor } = getCurrentGear();
  const rngFocal = $("rng-focal");
  const isPrime = lens.minFocal === lens.maxFocal;
  const uMm = t("unit_mm");

  rngFocal.min = String(lens.minFocal);
  rngFocal.max = String(lens.maxFocal);
  rngFocal.step = isPrime ? "0.1" : "1";
  rngFocal.disabled = isPrime;

  let focal = keepValues ? state.focalMm : lens.minFocal;
  if (focal < lens.minFocal || focal > lens.maxFocal) focal = lens.minFocal;
  rngFocal.value = String(focal);
  state.focalMm = focal;

  activeApertureStops = APERTURE_STOPS.filter((a) => a >= lens.maxAperture - 0.05 && a <= lens.minAperture + 0.05);
  if (!activeApertureStops.includes(lens.maxAperture)) {
    activeApertureStops.unshift(lens.maxAperture);
    activeApertureStops.sort((a, b) => a - b);
  }
  const rngAp = $("rng-aperture");
  rngAp.min = "0";
  rngAp.max = String(activeApertureStops.length - 1);

  let apIdx = 0;
  if (keepValues) {
    let bestDiff = Infinity;
    activeApertureStops.forEach((a, i) => {
      const d = Math.abs(a - state.aperture);
      if (d < bestDiff) { bestDiff = d; apIdx = i; }
    });
  }
  rngAp.value = String(apIdx);
  state.aperture = activeApertureStops[apIdx];

  $("dof-sensor-badge").textContent = `${sensor.label.split(" ")[0]} · CoC ${sensor.coc} ${uMm}`;
  $("topbar-gear-summary").textContent = `${brand.name} ${model.name} · ${isPrime ? lens.minFocal + uMm : lens.minFocal + "-" + lens.maxFocal + uMm}`;
  updateDoF();
}

function updateDoF() {
  const lang = getLang();
  const uMm = t("unit_mm");
  const { sensor } = getCurrentGear();
  const focal = Number($("rng-focal").value);
  const apIdx = Number($("rng-aperture").value);
  const aperture = activeApertureStops[apIdx] ?? activeApertureStops[0];
  const distM = state.distanceM;

  state.brandId = $("sel-brand").value;
  state.modelId = $("sel-model").value;
  state.lensId = $("sel-lens").value;
  state.focalMm = focal;
  state.aperture = aperture;
  saveAppState(state);

  const res = calculateDoF(focal, aperture, distM, sensor);

  $("val-focal").textContent = `${focal % 1 === 0 ? focal : focal.toFixed(1)} ${uMm}`;
  $("dof-equiv-badge").textContent = sensor.crop === 1 ? "Full Frame (1:1)" : t("dof_equiv", { mm: res.equivFocalMm });
  $("val-aperture").textContent = `f/${aperture}`;
  $("val-dist").textContent = formatDistance(distM, lang);

  $("res-dof-total").textContent = formatDistance(res.totalM, lang);
  $("res-hyperfocal").textContent = formatDistance(res.hyperfocalM, lang);
  $("res-near").textContent = formatDistance(res.nearM, lang);
  $("res-far").textContent = formatDistance(res.farM, lang);
  $("dof-fov-badge").textContent = t("dof_fov", { h: res.hfovDeg.toFixed(1), v: res.vfovDeg.toFixed(1) });

  if (res.isInfinity) {
    $("res-front").textContent = formatDistance(res.inFrontM, lang);
    $("res-behind").textContent = "∞";
  } else {
    $("res-front").textContent = `${formatDistance(res.inFrontM, lang)} (${Math.round(res.frontPct)}%)`;
    $("res-behind").textContent = `${formatDistance(res.behindM, lang)} (${Math.round(res.behindPct)}%)`;
  }

  const maxScale = res.isInfinity ? Math.max(distM * 2, res.hyperfocalM * 1.4) : Math.max(res.farM * 1.15, distM * 1.6);
  const nearPct = Math.max(0, Math.min(98, (res.nearM / maxScale) * 100));
  const subjPct = Math.max(1, Math.min(99, (distM / maxScale) * 100));
  const farPct = res.isInfinity ? 100 : Math.max(nearPct + 1.5, Math.min(100, (res.farM / maxScale) * 100));

  $("dof-bar-zone").style.left = `${nearPct}%`;
  $("dof-bar-zone").style.width = `${Math.max(1.5, farPct - nearPct)}%`;
  $("dof-bar-subject").style.left = `${subjPct}%`;
  $("dof-bar-mid").textContent = `${t("dof_subject_lbl")} (${formatDistance(distM, lang)})`;
  $("dof-bar-max").textContent = res.isInfinity ? "∞" : formatDistance(maxScale, lang);
  refreshAstroUi();
}

function renderQuickKitChips() {
  const wrap = $("quick-kit-wrap");
  const box = $("quick-kit-chips");
  if (!state.myKit.length) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  box.innerHTML = state.myKit.map((k) => {
    const active = k.brandId === state.brandId && k.modelId === state.modelId && k.lensId === state.lensId;
    return `<button class="chip ${active ? "active" : ""}" data-kit-id="${k.id}" type="button">${escapeHtml(k.label)}</button>`;
  }).join("");

  box.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.myKit.find((x) => x.id === btn.dataset.kitId);
      if (!item) return;
      state.brandId = item.brandId;
      state.modelId = item.modelId;
      state.lensId = item.lensId;
      $("sel-brand").value = item.brandId;
      populateModels(true);
      populateLenses(true, false);
      renderQuickKitChips();
      showToast(t("dof_kit_selected", { label: item.label }));
    });
  });
}

function initDoFCalculator() {
  populateBrands();
  populateModels(true);
  populateLenses(true, true);
  $("rng-dist").value = String(distanceToSlider(state.distanceM));
  updateDoF();
  renderQuickKitChips();

  $("sel-brand").addEventListener("change", () => { populateModels(false); populateLenses(false, false); syncAstroMpFromModel(); renderQuickKitChips(); });
  $("sel-model").addEventListener("change", () => { populateLenses(false, false); syncAstroMpFromModel(); renderQuickKitChips(); });
  $("sel-lens").addEventListener("change", () => { applyLensLimits(false); renderQuickKitChips(); });
  $("rng-focal").addEventListener("input", updateDoF);
  $("rng-aperture").addEventListener("input", updateDoF);
  $("rng-dist").addEventListener("input", () => {
    state.distanceM = sliderToDistance($("rng-dist").value);
    updateDoF();
  });

  document.querySelectorAll("[data-dist]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.distanceM = Number(btn.dataset.dist);
      $("rng-dist").value = String(distanceToSlider(state.distanceM));
      updateDoF();
    });
  });

  $("btn-set-hyperfocal").addEventListener("click", () => {
    const { sensor } = getCurrentGear();
    const res = calculateDoF(state.focalMm, state.aperture, state.distanceM, sensor);
    state.distanceM = Math.max(0.25, Math.min(200, Number(res.hyperfocalM.toFixed(2))));
    $("rng-dist").value = String(distanceToSlider(state.distanceM));
    updateDoF();
    showToast(t("dof_hyper_toast", { val: formatDistance(res.hyperfocalM, getLang()) }));
  });

  $("btn-save-kit").addEventListener("click", () => {
    const { brand, model, lens } = getCurrentGear();
    if (state.myKit.some((k) => k.brandId === brand.id && k.modelId === model.id && k.lensId === lens.id)) {
      showToast(t("dof_kit_exists"));
      return;
    }
    const shortLens = lens.minFocal === lens.maxFocal
      ? `${lens.minFocal}mm f/${lens.maxAperture}`
      : `${lens.minFocal}-${lens.maxFocal}mm f/${lens.maxAperture}`;
    state.myKit.push({
      id: `kit_${Date.now()}`,
      brandId: brand.id,
      modelId: model.id,
      lensId: lens.id,
      label: `${model.name} + ${shortLens}`,
      fullName: `${brand.name} ${model.name} / ${lens.name}`,
    });
    saveAppState(state);
    renderQuickKitChips();
    renderKitTab();
    showToast(t("dof_kit_added"));
  });
}

// ------------------------ ЕКВІВАЛЕНТНА ЕКСПОЗИЦІЯ ------------------------

function initExposureCalculator() {
  const populateSelects = () => {
    const uS = t("unit_s");
    const apHtml = APERTURE_STOPS.map((a) => `<option value="${a}">f/${a}</option>`).join("");
    const shHtml = SHUTTER_SPEEDS.map((s, i) => `<option value="${i}">${s.label} ${uS}</option>`).join("");
    const isoHtml = ISO_VALUES.map((v) => `<option value="${v}">ISO ${v}</option>`).join("");

    $("sel-exp-b-ap").innerHTML = apHtml;
    $("sel-exp-t-ap").innerHTML = apHtml;
    $("sel-exp-b-shut").innerHTML = shHtml;
    $("sel-exp-t-shut").innerHTML = shHtml;
    $("sel-exp-b-iso").innerHTML = isoHtml;
    $("sel-exp-t-iso").innerHTML = isoHtml;

    $("sel-exp-b-ap").value = String(state.expBaseAp ?? 2.8);
    $("sel-exp-b-shut").value = String(state.expBaseShutIdx ?? 9);
    $("sel-exp-b-iso").value = String(state.expBaseIso ?? 400);
    $("sel-exp-t-ap").value = String(state.expTargetAp ?? 1.8);
    $("sel-exp-t-shut").value = String(state.expTargetShutIdx ?? 9);
    $("sel-exp-t-iso").value = String(state.expTargetIso ?? 400);
    $("rng-exp-comp").value = String(state.expComp ?? 0);
  };

  const syncSolveUi = () => {
    const mode = state.expSolveFor || "shutter";
    document.querySelectorAll("#expo-solve-btns [data-solve]").forEach((b) => {
      b.classList.toggle("btn-primary", b.dataset.solve === mode);
    });
    $("wrap-exp-t-ap").style.opacity = mode === "aperture" ? "0.4" : "1";
    $("sel-exp-t-ap").disabled = mode === "aperture";
    $("wrap-exp-t-shut").style.opacity = mode === "shutter" ? "0.4" : "1";
    $("sel-exp-t-shut").disabled = mode === "shutter";
    $("wrap-exp-t-iso").style.opacity = mode === "iso" ? "0.4" : "1";
    $("sel-exp-t-iso").disabled = mode === "iso";
  };

  const recalc = () => {
    const baseAp = Number($("sel-exp-b-ap").value) || 2.8;
    const baseShutIdx = Number($("sel-exp-b-shut").value) || 9;
    const baseIso = Number($("sel-exp-b-iso").value) || 400;
    const targetAp = Number($("sel-exp-t-ap").value) || 1.8;
    const targetShutIdx = Number($("sel-exp-t-shut").value) || 9;
    const targetIso = Number($("sel-exp-t-iso").value) || 400;
    const evComp = Math.round((Number($("rng-exp-comp").value) || 0) * 3) / 3;
    const solveFor = state.expSolveFor || "shutter";

    state.expBaseAp = baseAp;
    state.expBaseShutIdx = baseShutIdx;
    state.expBaseIso = baseIso;
    state.expTargetAp = targetAp;
    state.expTargetShutIdx = targetShutIdx;
    state.expTargetIso = targetIso;
    state.expComp = evComp;
    saveAppState(state);

    const res = calculateEquivalentExposure({
      baseAp,
      baseShutterSec: SHUTTER_SPEEDS[baseShutIdx]?.sec ?? 1 / 125,
      baseIso,
      targetAp,
      targetShutterSec: SHUTTER_SPEEDS[targetShutIdx]?.sec ?? 1 / 125,
      targetIso,
      solveFor,
      evComp,
    });

    $("expo-ev-badge").textContent = `EV₁₀₀ ${res.ev100.toFixed(1)}`;
    $("expo-scene-desc").textContent = t(res.sceneKey);
    $("val-exp-comp").textContent = `${evComp > 0 ? "+" : ""}${evComp.toFixed(1)} EV`;

    let hint = t("expo_ok_hint");
    if (solveFor === "shutter") {
      $("expo-res-label").textContent = `${t("expo_result_lbl")} (${t("expo_shut_lbl")})`;
      $("expo-res-value").textContent = formatExposure(res.shutterSec, getLang());
      if (res.shutterSec > 1 / Math.max(15, state.focalMm || 50)) hint = t("expo_handheld_warn");
    } else if (solveFor === "aperture") {
      $("expo-res-label").textContent = `${t("expo_result_lbl")} (${t("expo_ap_lbl")})`;
      $("expo-res-value").textContent = `f/${res.aperture < 10 ? res.aperture.toFixed(1) : Math.round(res.aperture)}`;
      if (res.aperture < 0.95 || res.aperture > 32) hint = t("expo_ap_out_warn");
    } else {
      $("expo-res-label").textContent = `${t("expo_result_lbl")} (ISO)`;
      const roundedIso = res.iso < 100 ? Math.round(res.iso) : Math.round(res.iso / 10) * 10;
      $("expo-res-value").textContent = `ISO ${Math.max(1, roundedIso)}`;
      if (res.iso > 6400) hint = t("expo_iso_warn");
    }
    $("expo-res-hint").textContent = hint;
  };

  refreshExpoUi = () => {
    populateSelects();
    syncSolveUi();
    recalc();
  };

  populateSelects();
  syncSolveUi();
  ["sel-exp-b-ap", "sel-exp-b-shut", "sel-exp-b-iso", "sel-exp-t-ap", "sel-exp-t-shut", "sel-exp-t-iso"].forEach((id) => {
    $(id).addEventListener("change", recalc);
  });
  $("rng-exp-comp").addEventListener("input", recalc);
  document.querySelectorAll("#expo-solve-btns [data-solve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.expSolveFor = btn.dataset.solve;
      syncSolveUi();
      recalc();
    });
  });
  recalc();
}

// ------------------------ АСТРО-КАЛЬКУЛЯТОР (NPF + МІСЯЦЬ) ------------------------

function initAstroCalculator() {
  const now = new Date();
  $("inp-astro-date").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  $("sel-astro-decl").value = String(state.astroDecl ?? 0);

  syncAstroMpFromModel = () => {
    const { model } = getCurrentGear();
    $("inp-astro-mp").value = String(getModelMegapixels(model.id));
    refreshAstroUi();
  };

  const recalc = () => {
    const lang = getLang();
    const uS = t("unit_s");
    const uMm = t("unit_mm");
    const { model, sensor } = getCurrentGear();
    const focal = state.focalMm || 24;
    const ap = state.aperture || 2.8;
    const mp = Number($("inp-astro-mp").value) || getModelMegapixels(model.id);
    const declDeg = Number($("sel-astro-decl").value) || 0;
    state.astroDecl = declDeg;
    saveAppState(state);

    $("astro-gear-badge").textContent = `${model.name} · ${focal}${uMm} f/${ap}`;

    const astro = calculateAstro({ focalMm: focal, aperture: ap, sensor, mp, declDeg });
    $("res-astro-npf1").textContent = `${astro.npfStrictSec.toFixed(1)} ${uS}`;
    $("res-astro-npf2").textContent = `${astro.npfRelaxedSec.toFixed(1)} ${uS}`;
    $("res-astro-500").textContent = `${astro.rule500Sec.toFixed(1)} ${uS}`;
    $("res-astro-pitch").textContent = `${astro.pixelPitchUm.toFixed(2)} µm`;

    const [y, m, d] = ($("inp-astro-date").value || "").split("-").map(Number);
    const moonDate = y ? new Date(y, (m || 1) - 1, d || 1, 23, 0, 0) : new Date();
    const moon = getMoonPhase(moonDate);
    const pct = Math.round(moon.fraction * 100);

    $("astro-moon-pct").textContent = `${pct}%`;
    $("astro-moon-svg").innerHTML = renderMoonSvg(moon.phase);
    $("astro-moon-name").textContent = t(`moon_${moon.phaseKey}`);
    $("astro-moon-age").textContent = t("astro_moon_age", { d: moon.ageDays.toFixed(1) });
    const rEl = $("astro-moon-rating");
    rEl.textContent = t(`astro_rating_${moon.astroRating}`);
    rEl.className = moon.astroRating === "ideal" ? "badge badge-green" : moon.astroRating === "ok" ? "badge badge-amber" : "badge";
  };

  refreshAstroUi = recalc;
  syncAstroMpFromModel();
  $("inp-astro-mp").addEventListener("input", recalc);
  $("sel-astro-decl").addEventListener("change", recalc);
  $("inp-astro-date").addEventListener("change", recalc);
  recalc();
}

// ------------------------ ND-ФІЛЬТРИ + ТАЙМЕР BULB ------------------------

function initNDCalculator() {
  const selBase = $("sel-base-shutter");

  const populateNdSelects = () => {
    const uS = t("unit_s");
    selBase.innerHTML = SHUTTER_SPEEDS.map((s, i) => `<option value="${i}">${s.label} ${uS}</option>`).join("");
    selBase.value = String(state.ndBaseIdx ?? 7);

    const ndHtml = ND_FILTERS.map((f, i) => `<option value="${i}">${escapeHtml(translateNdFilter(f))}</option>`).join("");
    $("sel-nd1").innerHTML = ndHtml;
    $("sel-nd2").innerHTML = ndHtml;
    $("sel-nd1").value = String(state.ndFilter1 ?? 11);
    $("sel-nd2").value = String(state.ndFilter2 ?? 0);
  };

  const recalc = () => {
    const bIdx = Number($("sel-base-shutter").value);
    const f1 = Number($("sel-nd1").value);
    const f2 = Number($("sel-nd2").value);
    state.ndBaseIdx = bIdx;
    state.ndFilter1 = f1;
    state.ndFilter2 = f2;
    saveAppState(state);

    const stops = ND_FILTERS[f1].stops + ND_FILTERS[f2].stops;
    const newSec = SHUTTER_SPEEDS[bIdx].sec * Math.pow(2, stops);

    $("nd-stops-badge").textContent = formatStopsBadge(stops);
    $("nd-new-shutter").textContent = formatExposure(newSec, getLang());
    $("nd-bulb-hint").textContent = newSec > 30
      ? t("nd_bulb_hint_bulb")
      : newSec >= 1 ? t("nd_bulb_hint_tripod") : t("nd_bulb_hint_hand");

    if (!timerInterval) {
      timerTargetSec = Math.max(1, Math.round(newSec));
      updateTimerDisplay(timerTargetSec, 0);
    }
  };

  refreshNdUi = () => {
    populateNdSelects();
    recalc();
    if (!timerInterval) {
      $("btn-timer-start").textContent = t("timer_start");
      $("timer-state-badge").textContent = t("timer_wait");
    }
  };

  populateNdSelects();
  selBase.addEventListener("change", recalc);
  $("sel-nd1").addEventListener("change", recalc);
  $("sel-nd2").addEventListener("change", recalc);
  $("btn-timer-start").addEventListener("click", () => (timerInterval ? stopTimer("timer_paused") : startTimer()));
  $("btn-timer-reset").addEventListener("click", () => { stopTimer("timer_wait"); recalc(); });
  recalc();
}

function updateTimerDisplay(remSec, pct) {
  const s = Math.max(0, Math.ceil(remSec));
  $("timer-display").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  $("timer-progress-fill").style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
}

async function acquireWakeLock() {
  try {
    if (window.AndroidBridge?.setKeepScreenOn) window.AndroidBridge.setKeepScreenOn(true);
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch { /* ignore */ }
}

function releaseWakeLock() {
  try {
    if (window.AndroidBridge?.setKeepScreenOn) window.AndroidBridge.setKeepScreenOn(false);
    wakeLock?.release();
    wakeLock = null;
  } catch { /* ignore */ }
}

function startTimer() {
  const totalMs = Math.max(1000, timerTargetSec * 1000);
  timerEndMs = Date.now() + totalMs;
  timerLastBeepSec = -1;
  $("btn-timer-start").textContent = t("timer_stop");
  $("timer-state-badge").textContent = t("timer_running");
  $("timer-state-badge").className = "badge badge-amber";
  playBeep(660, 90);
  vibrate(60);
  acquireWakeLock();

  timerInterval = setInterval(() => {
    const remMs = timerEndMs - Date.now();
    const remSec = Math.max(0, remMs / 1000);
    updateTimerDisplay(remSec, 1 - remMs / totalMs);
    const ceilSec = Math.ceil(remSec);
    if (ceilSec <= 3 && ceilSec >= 1 && ceilSec !== timerLastBeepSec) {
      timerLastBeepSec = ceilSec;
      playBeep(880, 90);
      vibrate(80);
    }
    if (remMs <= 0) {
      stopTimer("timer_done");
      updateTimerDisplay(0, 1);
      playBeep(1180, 400);
      vibrate([220, 100, 220]);
      showToast(t("timer_done_toast"));
    }
  }, 100);
}

function stopTimer(labelKey = "timer_wait") {
  clearInterval(timerInterval);
  timerInterval = null;
  releaseWakeLock();
  $("btn-timer-start").textContent = t("timer_start");
  $("timer-state-badge").textContent = t(labelKey);
  $("timer-state-badge").className = labelKey === "timer_done" ? "badge badge-green" : "badge";
}

// ------------------------ КАЛЬКУЛЯТОР ТАЙМЛАПСУ ------------------------

function initTimelapseCalculator() {
  $("rng-tl-clip").value = String(state.tlClipSec ?? 15);
  $("sel-tl-fps").value = String(state.tlFps ?? 24);
  $("rng-tl-interval").value = String(state.tlIntervalSec ?? 3);
  $("inp-tl-raw").value = String(state.tlRawMb ?? 35);

  const recalc = () => {
    const lang = getLang();
    const uS = t("unit_s");
    const clipSec = Number($("rng-tl-clip").value);
    const fps = Number($("sel-tl-fps").value);
    const intervalSec = Number($("rng-tl-interval").value);
    const rawMb = Math.max(1, Number($("inp-tl-raw").value) || 35);

    state.tlClipSec = clipSec;
    state.tlFps = fps;
    state.tlIntervalSec = intervalSec;
    state.tlRawMb = rawMb;
    saveAppState(state);

    const res = calculateTimelapse({ clipSec, fps, intervalSec, rawMb });
    $("val-tl-clip").textContent = `${clipSec} ${uS}`;
    $("val-tl-interval").textContent = `${intervalSec} ${uS}`;
    $("res-tl-shoot").textContent = formatDurationLong(res.shootTotalSec, lang);
    $("res-tl-frames").textContent = t("tl_frames_val", { n: res.frames });
    $("res-tl-storage").textContent = res.storageGb < 1
      ? `${Math.round(res.storageGb * 1024)} ${t("unit_mb")}`
      : `${res.storageGb.toFixed(1)} ${t("unit_gb")}`;
    $("res-tl-shutter").textContent = `≤ ${formatExposure(res.idealShutterSec, lang)}`;
  };

  refreshTimelapseUi = recalc;
  $("rng-tl-clip").addEventListener("input", recalc);
  $("sel-tl-fps").addEventListener("change", recalc);
  $("rng-tl-interval").addEventListener("input", recalc);
  $("inp-tl-raw").addEventListener("input", recalc);
  document.querySelectorAll("[data-tl-int]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("rng-tl-interval").value = btn.dataset.tlInt;
      recalc();
    });
  });

  recalc();
}

// ------------------------ СОНЦЕ + СКАУТ ЛОКАЦІЙ + ШЕДЕВРИ ------------------------

function getSelectedSunDateTime() {
  const [y, m, d] = $("inp-sun-date").value.split("-").map(Number);
  const mins = Number($("rng-sun-min").value);
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(mins / 60), mins % 60, 0);
}

function setSunTimeMinutes(mins) {
  $("rng-sun-min").value = String(Math.max(0, Math.min(1439, Math.round(mins))));
  updateSunView();
}

function ensureSunMap() {
  if (mapInitialized) return;
  mapInitialized = true;
  if (typeof window.L === "undefined") {
    $("sun-map").style.display = "none";
    $("compass-fallback").style.display = "flex";
    updateSunView();
    return;
  }
  map = L.map("sun-map", { zoomControl: true }).setView([sunLat, sunLng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OSM" }).addTo(map);
  mapMarker = L.circleMarker([sunLat, sunLng], {
    radius: 8, color: "#ffffff", weight: 2, fillColor: "#f97316", fillOpacity: 1,
  }).addTo(map);
  map.on("click", (e) => setSunCoords(e.latlng.lat, e.latlng.lng, false));
  map.on("zoomend", updateSunView);
  updateSunView();
}

function setSunCoords(lat, lng, panMap = true) {
  sunLat = Number(lat);
  sunLng = Number(lng);
  state.lastCoords = { lat: sunLat, lng: sunLng };
  saveAppState(state);
  if (map && mapMarker) {
    mapMarker.setLatLng([sunLat, sunLng]);
    if (panMap) map.setView([sunLat, sunLng], Math.max(map.getZoom(), 15));
  }
  updateSunView();
}

function offsetLatLng(lat, lng, azimuthDeg, distMeters) {
  const rad = (azimuthDeg * Math.PI) / 180;
  const dLat = (distMeters * Math.cos(rad)) / 111320;
  const dLng = (distMeters * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

function renderCompassFallback(sunPos, riseAz, setAz) {
  const en = getLang() === "en";
  const cx = 110, cy = 110, r = 84;
  const pt = (deg, radLen) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + Math.cos(a) * radLen, cy + Math.sin(a) * radLen];
  };
  const [sx, sy] = pt(sunPos.azimuthDeg, r);
  const [shx, shy] = pt((sunPos.azimuthDeg + 180) % 360, r * 0.72);
  const [rx, ry] = riseAz != null ? pt(riseAz, r * 0.9) : [cx, cy];
  const [tx, ty] = setAz != null ? pt(setAz, r * 0.9) : [cx, cy];
  $("compass-svg").innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#141822" stroke="#4d58d8" stroke-width="2" />
    <text x="${cx}" y="18" fill="#a5b4fc" font-size="12" text-anchor="middle" font-weight="700">${en ? "N" : "Пн"}</text>
    <text x="${cx}" y="212" fill="#a5b4fc" font-size="12" text-anchor="middle">${en ? "S" : "Пд"}</text>
    <text x="206" y="${cy + 4}" fill="#a5b4fc" font-size="12" text-anchor="middle">${en ? "E" : "Сх"}</text>
    <text x="14" y="${cy + 4}" fill="#a5b4fc" font-size="12" text-anchor="middle">${en ? "W" : "Зх"}</text>
    ${riseAz != null ? `<line x1="${cx}" y1="${cy}" x2="${rx}" y2="${ry}" stroke="#fb923c" stroke-width="2" stroke-dasharray="4 4"/>` : ""}
    ${setAz != null ? `<line x1="${cx}" y1="${cy}" x2="${tx}" y2="${ty}" stroke="#f43f5e" stroke-width="2" stroke-dasharray="4 4"/>` : ""}
    ${sunPos.altitudeDeg > 0 ? `<line x1="${cx}" y1="${cy}" x2="${shx}" y2="${shy}" stroke="#64748b" stroke-width="2" stroke-dasharray="3 3"/>` : ""}
    <line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" stroke="${sunPos.altitudeDeg > 0 ? "#fbbf24" : "#38bdf8"}" stroke-width="3.5"/>
    <circle cx="${sx}" cy="${sy}" r="6" fill="${sunPos.altitudeDeg > 0 ? "#fbbf24" : "#38bdf8"}"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#ffffff"/>
  `;
}

function updateSunView() {
  const lang = getLang();
  const dt = getSelectedSunDateTime();
  const pos = getSunPosition(dt, sunLat, sunLng);
  const times = getSunTimes(dt, sunLat, sunLng);

  $("sun-coords-badge").textContent = `${sunLat.toFixed(4)}, ${sunLng.toFixed(4)}`;
  $("val-sun-time").textContent = formatTimeHM(dt);
  $("res-sun-az").textContent = `${Math.round(pos.azimuthDeg)}° (${azimuthToCompass(pos.azimuthDeg, lang)})`;

  if (pos.altitudeDeg > 0.5) {
    const ratio = 1 / Math.tan((pos.altitudeDeg * Math.PI) / 180);
    const sh = ratio > 15 ? t("sun_long_shadow") : t("sun_shadow_x", { r: ratio.toFixed(1) });
    $("res-sun-alt").textContent = `+${pos.altitudeDeg.toFixed(1)}° (${sh})`;
  } else {
    $("res-sun-alt").textContent = `${pos.altitudeDeg.toFixed(1)}° (${t("sun_night")})`;
  }

  $("st-blue-am").textContent = `${formatTimeHM(times.blueMorningStart)} – ${formatTimeHM(times.blueMorningEnd)}`;
  $("st-sunrise").textContent = formatTimeHM(times.sunrise);
  $("st-gold-am").textContent = `${formatTimeHM(times.goldenMorningStart)} – ${formatTimeHM(times.goldenMorningEnd)}`;
  $("st-gold-pm").textContent = `${formatTimeHM(times.goldenEveningStart)} – ${formatTimeHM(times.goldenEveningEnd)}`;
  $("st-sunset").textContent = formatTimeHM(times.sunset);
  $("st-blue-pm").textContent = `${formatTimeHM(times.blueEveningStart)} – ${formatTimeHM(times.blueEveningEnd)}`;

  const riseAz = times.sunrise ? getSunPosition(times.sunrise, sunLat, sunLng).azimuthDeg : null;
  const setAz = times.sunset ? getSunPosition(times.sunset, sunLat, sunLng).azimuthDeg : null;

  if (map) {
    mapRays.forEach((r) => map.removeLayer(r));
    mapRays = [];
    const rayLenM = Math.max(80, Math.min(2500, 40000 / Math.pow(2, map.getZoom() - 9)));
    if (riseAz != null) {
      mapRays.push(L.polyline([[sunLat, sunLng], offsetLatLng(sunLat, sunLng, riseAz, rayLenM)], { color: "#fb923c", weight: 2.5, dashArray: "6 6", opacity: 0.85 }).addTo(map));
    }
    if (setAz != null) {
      mapRays.push(L.polyline([[sunLat, sunLng], offsetLatLng(sunLat, sunLng, setAz, rayLenM)], { color: "#f43f5e", weight: 2.5, dashArray: "6 6", opacity: 0.85 }).addTo(map));
    }
    if (pos.altitudeDeg > 0) {
      mapRays.push(L.polyline([[sunLat, sunLng], offsetLatLng(sunLat, sunLng, (pos.azimuthDeg + 180) % 360, rayLenM * 0.7)], { color: "#94a3b8", weight: 2.5, dashArray: "4 4", opacity: 0.8 }).addTo(map));
    }
    mapRays.push(L.polyline([[sunLat, sunLng], offsetLatLng(sunLat, sunLng, pos.azimuthDeg, rayLenM * 1.1)], { color: pos.altitudeDeg > 0 ? "#fbbf24" : "#38bdf8", weight: 4, opacity: 0.95 }).addTo(map));
  } else {
    renderCompassFallback(pos, riseAz, setAz);
  }
}

function renderSpotTagChips() {
  const box = $("spot-tag-chips");
  box.innerHTML = SPOT_TAGS.map((tag) =>
    `<button class="chip ${selectedSpotTags.has(tag) ? "active" : ""}" data-tag="${tag}" type="button">${escapeHtml(translateSpotTag(tag))}</button>`
  ).join("");
  box.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (selectedSpotTags.has(btn.dataset.tag)) selectedSpotTags.delete(btn.dataset.tag);
      else selectedSpotTags.add(btn.dataset.tag);
      renderSpotTagChips();
    });
  });
}

async function renderSpotsList() {
  cachedSpots = await dbGetAll("spots");
  $("spots-count-badge").textContent = String(cachedSpots.length);

  const filters = ["Усі", ...SPOT_TAGS];
  $("spots-filter-chips").innerHTML = filters.map((tag) =>
    `<button class="chip ${activeSpotFilter === tag ? "active" : ""}" data-filter="${tag}" type="button">${escapeHtml(translateSpotTag(tag))}</button>`
  ).join("");
  $("spots-filter-chips").querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => { activeSpotFilter = btn.dataset.filter; renderSpotsList(); });
  });

  const filtered = activeSpotFilter === "Усі" ? cachedSpots : cachedSpots.filter((s) => (s.tags || []).includes(activeSpotFilter));
  const list = $("spots-list");
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">${t("spot_empty")}</div>`;
    return;
  }

  list.innerHTML = filtered.map((s) => {
    const tagsHtml = (s.tags || []).map((tag) => `<span class="badge badge-amber">${escapeHtml(translateSpotTag(tag))}</span>`).join(" ");
    const times = getSunTimes(new Date(), s.lat, s.lng);
    return `
      <div class="spot-card">
        ${s.photo ? `<img class="spot-thumb" src="${s.photo}" data-lightbox="${s.id}" alt="Spot" />` : `<div class="spot-thumb" style="display:grid;place-items:center;color:#64748b;font-size:11px;">${escapeHtml(t("spot_no_photo"))}</div>`}
        <div class="spot-body">
          <div class="spot-name">${escapeHtml(s.name)}</div>
          <div class="spot-meta">Golden Hour: ${formatTimeHM(times.goldenEveningStart)} – ${formatTimeHM(times.sunset)}</div>
          ${s.note ? `<div class="muted" style="margin-bottom:6px;">${escapeHtml(s.note)}</div>` : ""}
          <div class="chips" style="margin-bottom:8px;">${tagsHtml}</div>
          <div class="btn-row">
            <button class="btn btn-sm btn-blue" data-jump-spot="${s.id}" type="button">${t("spot_on_map")}</button>
            <a class="btn btn-sm" style="text-decoration:none;" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${s.lat},${s.lng}">${t("spot_route")}</a>
            <button class="btn btn-sm btn-danger" data-del-spot="${s.id}" type="button">${t("btn_delete")}</button>
          </div>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-jump-spot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const spot = cachedSpots.find((x) => x.id === btn.dataset.jumpSpot);
      if (!spot) return;
      setSunCoords(spot.lat, spot.lng, true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast(t("spot_toast", { name: spot.name }));
    });
  });
  list.querySelectorAll("[data-lightbox]").forEach((img) => {
    img.addEventListener("click", () => {
      const spot = cachedSpots.find((x) => x.id === img.dataset.lightbox);
      if (spot?.photo) openLightbox(spot.photo, `${spot.name}${spot.note ? " — " + spot.note : ""}`);
    });
  });
  list.querySelectorAll("[data-del-spot]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await dbDelete("spots", btn.dataset.delSpot);
      showToast(t("spot_deleted"));
      renderSpotsList();
    });
  });
}

// -------- ШЕДЕВРИ З EXIF GPS І ОБМІНОМ (.fkspot) --------

async function renderMasterpieces() {
  cachedMasterpieces = await dbGetAll("masterpieces");
  $("mp-count-badge").textContent = String(cachedMasterpieces.length);
  const box = $("mp-list");
  if (!cachedMasterpieces.length) {
    box.innerHTML = `<div class="empty-state">${t("mp_empty")}</div>`;
    return;
  }

  box.innerHTML = cachedMasterpieces.map((m) => `
    <div class="masterpiece-card">
      <img class="masterpiece-img" src="${m.photo}" data-mp-open="${m.id}" alt="Photo" />
      <div class="masterpiece-body">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;">
          <strong style="font-size:14px;">${escapeHtml(m.title)}</strong>
          <span class="badge badge-amber">${escapeHtml(m.author || t("mp_default_author"))}</span>
        </div>
        ${m.gear ? `<div class="muted" style="margin-bottom:4px;">📷 ${escapeHtml(m.gear)}</div>` : ""}
        ${m.note ? `<div class="muted" style="margin-bottom:6px;">${escapeHtml(m.note)}</div>` : ""}
        <div class="spot-meta">GPS: ${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}</div>
        <div class="btn-row">
          <button class="btn btn-sm btn-blue" data-mp-map="${m.id}" type="button">${t("mp_show_map")}</button>
          <button class="btn btn-sm btn-primary" data-mp-share="${m.id}" type="button">${t("mp_share_btn")}</button>
          <a class="btn btn-sm" style="text-decoration:none;" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${m.lat},${m.lng}">Maps</a>
          <button class="btn btn-sm btn-danger" data-mp-del="${m.id}" type="button">×</button>
        </div>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-mp-open]").forEach((img) => {
    img.addEventListener("click", () => {
      const item = cachedMasterpieces.find((x) => x.id === img.dataset.mpOpen);
      if (item) openLightbox(item.photo, `${item.title} (${item.author || ""})${item.note ? " — " + item.note : ""}`);
    });
  });

  box.querySelectorAll("[data-mp-map]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = cachedMasterpieces.find((x) => x.id === btn.dataset.mpMap);
      if (!item) return;
      switchSubTab("tab-sun", "sunmap");
      setTimeout(() => {
        setSunCoords(item.lat, item.lng, true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast(t("mp_location_toast", { title: item.title }));
      }, 80);
    });
  });

  box.querySelectorAll("[data-mp-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = cachedMasterpieces.find((x) => x.id === btn.dataset.mpShare);
      if (!item) return;
      const safeName = (item.title || "masterpiece").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "spot";
      downloadOrShareText(`${safeName}.fkspot`, JSON.stringify({ type: "framekit_masterpiece", version: 1, item }));
    });
  });

  box.querySelectorAll("[data-mp-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await dbDelete("masterpieces", btn.dataset.mpDel);
      showToast(t("mp_deleted"));
      renderMasterpieces();
    });
  });
}

function initSunScout() {
  const now = new Date();
  $("inp-sun-date").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  $("rng-sun-min").value = String(now.getHours() * 60 + now.getMinutes());

  $("inp-sun-date").addEventListener("change", updateSunView);
  $("rng-sun-min").addEventListener("input", updateSunView);
  $("btn-sun-now").addEventListener("click", () => {
    const n = new Date();
    $("inp-sun-date").value = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    setSunTimeMinutes(n.getHours() * 60 + n.getMinutes());
  });
  $("btn-sun-golden").addEventListener("click", () => {
    const times = getSunTimes(getSelectedSunDateTime(), sunLat, sunLng);
    if (times.goldenEveningStart) {
      setSunTimeMinutes(times.goldenEveningStart.getHours() * 60 + times.goldenEveningStart.getMinutes());
      showToast(`Golden Hour: ${formatTimeHM(times.goldenEveningStart)}`);
    }
  });
  $("btn-open-gmaps").addEventListener("click", () => window.open(`https://www.google.com/maps?q=${sunLat},${sunLng}`, "_blank", "noopener"));

  const requestGps = (onGot) => {
    if (!navigator.geolocation) { showToast(t("gps_not_supported")); return; }
    showToast(t("gps_searching"));
    navigator.geolocation.getCurrentPosition(
      (pos) => onGot(pos.coords.latitude, pos.coords.longitude),
      () => showToast(t("gps_err")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  $("btn-gps").addEventListener("click", () => requestGps((la, lo) => { setSunCoords(la, lo, true); showToast(t("gps_updated")); }));

  $("inp-spot-photo").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingSpotPhoto = await compressImageFile(file, 960, 0.8);
      $("spot-photo-status").textContent = t("spot_photo_added");
    } catch { showToast(t("photo_err")); }
  });

  $("btn-save-spot").addEventListener("click", async () => {
    const name = $("inp-spot-name").value.trim();
    if (!name) { showToast(t("spot_enter_name")); return; }
    await dbPut("spots", {
      id: `spot_${Date.now()}`,
      name,
      note: $("inp-spot-note").value.trim(),
      tags: Array.from(selectedSpotTags),
      lat: sunLat,
      lng: sunLng,
      photo: pendingSpotPhoto,
      createdAt: Date.now(),
    });
    $("inp-spot-name").value = "";
    $("inp-spot-note").value = "";
    $("inp-spot-photo").value = "";
    pendingSpotPhoto = null;
    $("spot-photo-status").textContent = t("spot_no_photo");
    showToast(t("spot_saved"));
    renderSpotsList();
  });

  // Шедеври
  $("inp-mp-author").value = state.authorNick || "@AziMuT_156";
  $("inp-mp-photo").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const exif = await extractExifGps(file);
      pendingMpPhoto = await compressImageFile(file, 1100, 0.84);
      $("mp-preview").src = pendingMpPhoto;
      $("mp-preview").style.display = "block";
      if (exif) {
        pendingMpCoords = exif;
        $("mp-gps-badge").textContent = t("mp_exif_badge", { lat: exif.lat.toFixed(3), lng: exif.lng.toFixed(3) });
        showToast(t("mp_exif_found"));
      } else {
        pendingMpCoords = null;
        $("mp-gps-badge").textContent = t("mp_map_point_badge", { lat: sunLat.toFixed(3), lng: sunLng.toFixed(3) });
      }
    } catch { showToast(t("mp_photo_err")); }
  });

  $("btn-mp-use-gps").addEventListener("click", () => {
    requestGps((la, lo) => {
      pendingMpCoords = { lat: la, lng: lo };
      setSunCoords(la, lo, false);
      $("mp-gps-badge").textContent = `GPS ✓ (${la.toFixed(3)}, ${lo.toFixed(3)})`;
      showToast(t("mp_gps_bound"));
    });
  });

  $("btn-save-mp").addEventListener("click", async () => {
    if (!pendingMpPhoto) { showToast(t("mp_pick_first")); return; }
    const title = $("inp-mp-title").value.trim() || t("mp_untitled");
    const author = $("inp-mp-author").value.trim() || state.authorNick || t("mp_default_author");
    const coords = pendingMpCoords || { lat: sunLat, lng: sunLng };
    const { brand, model, lens } = getCurrentGear();
    await dbPut("masterpieces", {
      id: `mp_${Date.now()}`,
      title,
      author,
      note: $("inp-mp-note").value.trim(),
      gear: `${brand.name} ${model.name} · ${lens.name}`,
      lat: coords.lat,
      lng: coords.lng,
      photo: pendingMpPhoto,
      createdAt: Date.now(),
    });
    pendingMpPhoto = null;
    pendingMpCoords = null;
    $("inp-mp-photo").value = "";
    $("inp-mp-title").value = "";
    $("inp-mp-note").value = "";
    $("mp-preview").style.display = "none";
    $("mp-gps-badge").textContent = t("mp_gps_map_badge");
    showToast(t("mp_added"));
    renderMasterpieces();
  });

  $("inp-import-mp").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const item = parsed?.item || parsed;
      if (!item?.photo || typeof item.lat !== "number") throw new Error("Bad .fkspot");
      item.id = `mp_imp_${Date.now()}`;
      item.createdAt = Date.now();
      await dbPut("masterpieces", item);
      showToast(t("mp_imported", { title: item.title || t("mp_untitled") }));
      renderMasterpieces();
    } catch {
      showToast(t("mp_bad_file"));
    }
    $("inp-import-mp").value = "";
  });

  renderSpotTagChips();
  renderSpotsList();
  renderMasterpieces();
}

// ------------------------ ЗЙОМКА (ЧЕКЛИСТ + МУДБОРД + СВІТЛО) ------------------------

function renderChecklist() {
  const items = state.checklist;
  const doneCount = items.filter((i) => i.done).length;
  $("check-progress-badge").textContent = `${doneCount} / ${items.length}`;
  $("check-progress-fill").style.width = items.length ? `${(doneCount / items.length) * 100}%` : "0%";

  const groups = new Map();
  items.forEach((it) => {
    const loc = translateCheckItem(it);
    if (!groups.has(loc.cat)) groups.set(loc.cat, []);
    groups.get(loc.cat).push({ ...it, displayText: loc.text });
  });

  let html = "";
  for (const [cat, list] of groups.entries()) {
    html += `<div class="check-cat">${escapeHtml(cat)}</div>`;
    for (const it of list) {
      html += `
        <div class="check-item ${it.done ? "done" : ""}" data-toggle-check="${it.id}">
          <div class="check-box">${it.done ? "✓" : ""}</div>
          <div class="check-text">${escapeHtml(it.displayText)}</div>
          <button class="btn btn-sm btn-danger" style="min-height:28px;padding:2px 8px;" data-del-check="${it.id}" type="button">×</button>
        </div>`;
    }
  }
  $("checklist-container").innerHTML = html;

  $("checklist-container").querySelectorAll("[data-toggle-check]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-check]")) return;
      const item = state.checklist.find((x) => x.id === row.dataset.toggleCheck);
      if (!item) return;
      item.done = !item.done;
      saveAppState(state);
      renderChecklist();
    });
  });
  $("checklist-container").querySelectorAll("[data-del-check]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.checklist = state.checklist.filter((x) => x.id !== btn.dataset.delCheck);
      saveAppState(state);
      renderChecklist();
    });
  });
}

async function renderMoodboard() {
  cachedMoods = await dbGetAll("moodboard");
  $("mood-count-badge").textContent = String(cachedMoods.length);
  $("mood-filter-chips").innerHTML = MOOD_CATS.map((c) =>
    `<button class="chip ${activeMoodFilter === c ? "active" : ""}" data-mcat="${c}" type="button">${escapeHtml(translateMoodCat(c))}</button>`
  ).join("");
  $("mood-filter-chips").querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => { activeMoodFilter = btn.dataset.mcat; renderMoodboard(); });
  });

  const filtered = activeMoodFilter === "Усі" ? cachedMoods : cachedMoods.filter((m) => m.category === activeMoodFilter);
  const grid = $("mood-grid");
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${t("mood_empty")}</div>`;
    return;
  }

  grid.innerHTML = filtered.map((m) => `
    <div class="mood-card">
      <img class="mood-img" src="${m.photo}" data-mood-open="${m.id}" alt="Reference" />
      <button class="mood-del" data-mood-del="${m.id}" type="button">×</button>
      <div class="mood-caption">
        <span class="badge badge-amber" style="margin-bottom:3px;">${escapeHtml(translateMoodCat(m.category))}</span>
        ${m.note ? `<div class="muted">${escapeHtml(m.note)}</div>` : ""}
      </div>
    </div>`).join("");

  grid.querySelectorAll("[data-mood-open]").forEach((img) => {
    img.addEventListener("click", () => {
      const item = cachedMoods.find((x) => x.id === img.dataset.moodOpen);
      if (item) openLightbox(item.photo, `${translateMoodCat(item.category)}${item.note ? " — " + item.note : ""}`);
    });
  });
  grid.querySelectorAll("[data-mood-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await dbDelete("moodboard", btn.dataset.moodDel);
      showToast(t("mood_deleted"));
      renderMoodboard();
    });
  });
}

function initLightingSchemes() {
  let activeId = LIGHTING_SCHEMES[0].id;
  const render = () => {
    const raw = LIGHTING_SCHEMES.find((x) => x.id === activeId) || LIGHTING_SCHEMES[0];
    const sc = translateLightingScheme(raw);
    $("lighting-chips").innerHTML = LIGHTING_SCHEMES.map((s) => {
      const loc = translateLightingScheme(s);
      return `<button class="chip ${s.id === raw.id ? "active" : ""}" data-sc="${s.id}" type="button">${escapeHtml(loc.short)}</button>`;
    }).join("");
    $("lighting-chips").querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => { activeId = btn.dataset.sc; render(); });
    });
    $("light-scheme-tag").textContent = sc.tag;
    $("light-scheme-name").textContent = sc.name;
    $("light-scheme-desc").textContent = sc.desc;
    $("light-scheme-tip").textContent = sc.tip;
    $("lighting-svg-box").innerHTML = renderLightingSvg(raw, getLang());
  };
  refreshLightingUi = render;
  render();
}

function initShootTab() {
  renderChecklist();
  renderMoodboard();
  initLightingSchemes();

  $("btn-add-check").addEventListener("click", () => {
    const text = $("inp-new-check").value.trim();
    if (!text) return;
    state.checklist.push({ id: `c_${Date.now()}`, cat: "Своє", text, done: false });
    $("inp-new-check").value = "";
    saveAppState(state);
    renderChecklist();
  });
  $("btn-reset-checks").addEventListener("click", () => {
    state.checklist.forEach((i) => { i.done = false; });
    saveAppState(state);
    renderChecklist();
    showToast(t("check_reset_toast"));
  });
  $("inp-mood-photo").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const category = $("sel-mood-cat").value;
    const note = $("inp-mood-note").value.trim();
    let added = 0;
    for (const file of files) {
      try {
        const photo = await compressImageFile(file, 1000, 0.82);
        await dbPut("moodboard", { id: `mood_${Date.now()}_${added}`, category, note, photo, createdAt: Date.now() + added });
        added++;
      } catch { /* skip */ }
    }
    $("inp-mood-photo").value = "";
    $("inp-mood-note").value = "";
    showToast(t("mood_added", { n: added }));
    renderMoodboard();
  });
}

// ------------------------ AI-КРИТИК (GEMINI VISION — АВТОПІДБІР АКТУАЛЬНИХ МОДЕЛЕЙ) ------------------------

function refreshAiKeyUi() {
  const hasKey = Boolean(state.geminiApiKey && state.geminiApiKey.trim().length > 10);
  $("ai-key-status").textContent = hasKey ? t("ai_key_ok") : t("ai_key_missing");
  $("ai-key-status").className = hasKey ? "badge badge-green" : "badge badge-amber";
  $("ai-no-key-banner").style.display = hasKey ? "none" : "block";
}

async function discoverGeminiFlashModels(apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const list = (data.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((name) =>
        name.startsWith("gemini-") &&
        !/(embedding|aqa|tts|audio|imagen|veo|robotics|computer-use|learnlm)/i.test(name)
      );

    // Пріоритет: найновіші flash моделі (за версією у спадному порядку)
    const score = (n) => {
      const m = n.match(/gemini-(\d+(?:\.\d+)?)/);
      const ver = m ? parseFloat(m[1]) : 0;
      const flashBonus = n.includes("flash") ? 100 : 0;
      const litePenalty = n.includes("lite") ? -2 : 0;
      const latestBonus = n.includes("latest") ? 50 : 0;
      return ver * 10 + flashBonus + latestBonus + litePenalty;
    };
    list.sort((a, b) => score(b) - score(a));
    return list.slice(0, 4);
  } catch {
    return [];
  }
}

function buildAiPrompt(style, lang) {
  if (lang === "en") {
    const tone = style === "roast"
      ? "You are a brutally honest, witty senior art director. No fluff — point out flaws directly, while giving genuinely actionable fixes."
      : "You are an experienced photography mentor. Give a clear, friendly, and technically sharp critique.";
    return `${tone}
Analyze this photo in English. Keep the response structured, concise, and practical:
1. COMPOSITION & HORIZON: check level horizon, edge distractions, and better crop options (rule of thirds / leading lines).
2. LIGHT & COLOR: strengths and weaknesses of lighting, dynamic range, and white balance.
3. LIGHTROOM SLIDERS (concrete numbers, e.g. Exposure +0.3, Highlights -40, Shadows +25, Temp +5, Clarity +10, Vignette -15).
4. SCORE (X/10) & 1 KEY TIP FOR THE NEXT SHOOT.`;
  }
  const tone = style === "roast"
    ? "Ти — суворий, але чесний і дотепний арт-директор. Без води, чітко вказуй косяки, але давай реально корисні поради."
    : "Ти — досвідчений фотограф-наставник. Давай чіткий, дружній і технічно грамотний розбір.";
  return `${tone}
Проаналізуй це фото українською мовою. Відповідь структурована, коротка, без зайвої води:
1. КОМПОЗИЦІЯ Й ГОРИЗОНТ: чи не завалений горизонт, що зайве лізе в краї, як краще обрізати (правило третин/лінії).
2. СВІТЛО Й КОЛІР: сильні та слабкі сторони освітлення й балансу білого.
3. ПОВЗУНКИ LIGHTROOM (конкретні цифри, напр. Exposure +0.3, Highlights -40, Shadows +25, Temp +5, Clarity +10, Vignette -15).
4. ОЦІНКА (X/10) І 1 ГОЛОВНА ПОРАДА НА НАСТУПНУ ЗЙОМКУ.`;
}

function initAiCritic() {
  $("sel-ai-style").value = state.aiStyle || "balanced";
  refreshAiKeyUi();

  $("btn-goto-settings-key").addEventListener("click", () => {
    switchTab("tab-settings");
    $("inp-gemini-key").focus();
  });

  $("inp-ai-photo").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingAiPhoto = await compressImageFile(file, 1024, 0.82);
      $("ai-preview").src = pendingAiPhoto;
      $("ai-preview").style.display = "block";
    } catch { showToast(t("ai_load_err")); }
  });

  $("btn-run-ai").addEventListener("click", async () => {
    const key = (state.geminiApiKey || "").trim();
    if (!key) {
      showToast(t("ai_need_key_toast"));
      switchTab("tab-settings");
      return;
    }
    if (!pendingAiPhoto) {
      showToast(t("ai_need_photo_toast"));
      return;
    }

    state.aiStyle = $("sel-ai-style").value;
    saveAppState(state);

    const btn = $("btn-run-ai");
    btn.disabled = true;
    btn.textContent = t("ai_running_btn");
    $("ai-result-card").style.display = "block";
    $("ai-output").textContent = t("ai_sending");

    const base64 = pendingAiPhoto.split(",")[1];
    const prompt = buildAiPrompt(state.aiStyle, getLang());

    const tryModel = async (model) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64 } },
              ],
            }],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        const fatalAuth = res.status === 401 || res.status === 403 || /API[_ ]key/i.test(msg);
        return { ok: false, err: msg, fatalAuth };
      }
      const txt = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n").trim();
      return txt ? { ok: true, txt } : { ok: false, err: "Empty response", fatalAuth: false };
    };

    const primaryModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
    const tried = new Set();
    let finalText = null;
    let usedModel = "";
    let lastErr = "";
    let authFailed = false;

    for (const model of primaryModels) {
      tried.add(model);
      try {
        const r = await tryModel(model);
        if (r.ok) { finalText = r.txt; usedModel = model; break; }
        lastErr = r.err;
        if (r.fatalAuth) { authFailed = true; break; }
      } catch (err) {
        lastErr = err?.message || t("ai_no_net");
      }
    }

    // Якщо старі назви моделей оновилися в Google — автоматично шукаємо живі моделі через /v1beta/models
    if (!finalText && !authFailed) {
      const discovered = await discoverGeminiFlashModels(key);
      for (const model of discovered) {
        if (tried.has(model)) continue;
        tried.add(model);
        try {
          const r = await tryModel(model);
          if (r.ok) { finalText = r.txt; usedModel = model; break; }
          lastErr = r.err;
          if (r.fatalAuth) break;
        } catch (err) {
          lastErr = err?.message || t("ai_no_net");
        }
      }
    }

    if (finalText) {
      $("ai-model-badge").textContent = usedModel;
      $("ai-output").textContent = finalText;
      vibrate(60);
    } else {
      $("ai-output").textContent = t("ai_req_err", { err: lastErr });
    }

    btn.disabled = false;
    btn.textContent = t("ai_run_btn");
  });
}

// ------------------------ НАЛАШТУВАННЯ + РЮКЗАК + БЕКАП ------------------------

function renderKitTab() {
  $("kit-count-badge").textContent = String(state.myKit.length);
  const box = $("kit-list");
  if (!state.myKit.length) {
    box.innerHTML = `<div class="empty-state">${t("set_kit_empty")}</div>`;
    return;
  }
  box.innerHTML = state.myKit.map((k) => `
    <div class="check-item" style="cursor:default;">
      <div class="check-text">
        <strong>${escapeHtml(k.label)}</strong>
        <div class="muted">${escapeHtml(k.fullName || "")}</div>
      </div>
      <button class="btn btn-sm btn-danger" data-del-kit="${k.id}" type="button">${t("btn_delete")}</button>
    </div>`).join("");

  box.querySelectorAll("[data-del-kit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.myKit = state.myKit.filter((x) => x.id !== btn.dataset.delKit);
      saveAppState(state);
      renderKitTab();
      renderQuickKitChips();
    });
  });
}

function initSettingsAndPWA() {
  $("inp-author-nick").value = state.authorNick || "@AziMuT_156";
  $("inp-gemini-key").value = state.geminiApiKey || "";

  document.querySelectorAll("#lang-buttons [data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => applyLanguage(btn.dataset.lang, true));
  });

  document.querySelectorAll("#theme-buttons [data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.theme);
      showToast(t("theme_toast", { name: t(THEME_META[btn.dataset.theme].labelKey) }));
    });
  });

  $("btn-save-settings").addEventListener("click", () => {
    state.authorNick = $("inp-author-nick").value.trim() || "@AziMuT_156";
    state.geminiApiKey = $("inp-gemini-key").value.trim();
    $("inp-mp-author").value = state.authorNick;
    saveAppState(state);
    refreshAiKeyUi();
    showToast(t("set_saved_toast"));
  });

  $("btn-export-backup").addEventListener("click", async () => {
    const json = await exportBackupJSON();
    downloadOrShareText(`framekit-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
  });

  $("inp-import-backup").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importBackupJSON(await file.text());
      showToast(t("set_backup_restored"));
      setTimeout(() => location.reload(), 600);
    } catch { showToast(t("set_backup_err")); }
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("btn-install").style.display = "inline-flex";
  });
  $("btn-install").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("btn-install").style.display = "none";
  });

  if (!window.AndroidBridge && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// ------------------------ ФОТОРЕДАКТОР (LIGHTROOM STUDIO) ------------------------

function renderEditorPresets() {
  if (!studio) return;
  const list = studio.getCustomPresets();
  $("ed-presets-count").textContent = String(list.length);
  const box = $("ed-custom-presets-list");
  if (!list.length) {
    box.innerHTML = `<div class="empty-state">${t("ed_no_presets")}</div>`;
    return;
  }
  box.innerHTML = list.map((p) => `
    <div class="check-item" style="cursor:default;">
      <div class="check-text">
        <strong>${escapeHtml(p.name)}</strong>
        <div class="muted">${t("ed_custom_preset_sub")}</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-sm btn-blue" data-exp-preset="${p.id}" type="button">.fkpreset</button>
        <button class="btn btn-sm btn-danger" data-del-preset="${p.id}" type="button">×</button>
      </div>
    </div>`).join("");

  box.querySelectorAll("[data-exp-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pr = studio.getCustomPresets().find((x) => x.id === btn.dataset.expPreset);
      if (!pr) return;
      const safe = (pr.name || "preset").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "preset";
      downloadOrShareText(`${safe}.fkpreset`, JSON.stringify({ type: "framekit_preset", version: 1, preset: pr }));
    });
  });

  box.querySelectorAll("[data-del-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      studio.deleteCustomPreset(btn.dataset.delPreset);
      showToast(t("ed_preset_deleted"));
    });
  });
}

function initPhotoStudio() {
  studio = new PhotoStudioController({
    showToast,
    vibrate,
    onSendToAi: (dataUrl) => {
      pendingAiPhoto = dataUrl;
      $("ai-preview").src = dataUrl;
      $("ai-preview").style.display = "block";
      switchTab("tab-editor");
      switchSubTab("tab-editor", "ed-ai");
      showToast(t("ed_sent_to_ai"));
    },
    onPresetsChanged: () => renderEditorPresets(),
  });

  const handleStudioPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    studio.openFile(file);
    e.target.value = "";
  };
  $("inp-studio-file").addEventListener("change", handleStudioPick);
  $("inp-studio-raw").addEventListener("change", handleStudioPick);

  $("inp-import-preset").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const name = studio.importCustomPreset(await file.text());
      showToast(t("ed_preset_imported", { name }));
    } catch {
      showToast(t("ed_preset_bad_file"));
    }
    $("inp-import-preset").value = "";
  });

  renderEditorPresets();
}

// ------------------------ СТАРТ ------------------------

initNavigation();
initEasterEgg();
initPhotoStudio();
initDoFCalculator();
initExposureCalculator();
initNDCalculator();
initAstroCalculator();
initTimelapseCalculator();
initSunScout();
initShootTab();
initAiCritic();
renderKitTab();
initSettingsAndPWA();
applyLanguage(state.lang || "uk", false);
