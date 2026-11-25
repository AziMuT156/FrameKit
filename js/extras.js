/**
 * Додаткові модулі FrameKit v1.1:
 * 1. Офлайн-парсер GPS-координат із EXIF фотографій (JPEG).
 * 2. Піксельні SVG-схеми світла для портретів.
 * 3. Калькулятор таймлапсу (Timelapse).
 */

// ---------------- 1. EXIF GPS ПАРСЕР (чистий JS, 100% офлайн) ----------------

export async function extractExifGps(file) {
  try {
    const buf = await file.slice(0, 131072).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        // APP1 (EXIF)
        const len = view.getUint16(offset, false);
        if (offset + 8 > view.byteLength) return null;
        // "Exif\0\0"
        if (
          view.getUint32(offset + 2, false) !== 0x45786966 ||
          view.getUint16(offset + 6, false) !== 0x0000
        ) {
          offset += len;
          continue;
        }
        const tiff = offset + 8;
        const le = view.getUint16(tiff, false) === 0x4949;
        const firstIfd = view.getUint32(tiff + 4, le);
        const gpsPtr = findTagInIfd(view, tiff, tiff + firstIfd, 0x8825, le);
        if (!gpsPtr) return null;
        return parseGpsIfd(view, tiff, tiff + gpsPtr, le);
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        const size = view.getUint16(offset, false);
        offset += size;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function findTagInIfd(view, tiff, dirStart, targetTag, le) {
  if (dirStart + 2 > view.byteLength) return null;
  const count = view.getUint16(dirStart, le);
  for (let i = 0; i < count; i++) {
    const entry = dirStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    if (view.getUint16(entry, le) === targetTag) {
      return view.getUint32(entry + 8, le);
    }
  }
  return null;
}

function readRational3(view, offset, le) {
  if (offset + 24 > view.byteLength) return null;
  const d = view.getUint32(offset, le) / (view.getUint32(offset + 4, le) || 1);
  const m = view.getUint32(offset + 8, le) / (view.getUint32(offset + 12, le) || 1);
  const s = view.getUint32(offset + 16, le) / (view.getUint32(offset + 20, le) || 1);
  return d + m / 60 + s / 3600;
}

function parseGpsIfd(view, tiff, dirStart, le) {
  if (dirStart + 2 > view.byteLength) return null;
  const count = view.getUint16(dirStart, le);
  let latRef = "N", lngRef = "E", lat = null, lng = null;

  for (let i = 0; i < count; i++) {
    const entry = dirStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, le);
    if (tag === 0x0001) {
      latRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if (tag === 0x0002) {
      lat = readRational3(view, tiff + view.getUint32(entry + 8, le), le);
    } else if (tag === 0x0003) {
      lngRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if (tag === 0x0004) {
      lng = readRational3(view, tiff + view.getUint32(entry + 8, le), le);
    }
  }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (latRef === "S") lat = -lat;
  if (lngRef === "W") lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

// ---------------- 2. КАЛЬКУЛЯТОР ТАЙМЛАПСУ ----------------

export function calculateTimelapse({ clipSec, fps, intervalSec, rawMb }) {
  const frames = Math.max(1, Math.round(clipSec * fps));
  const shootTotalSec = frames * intervalSec;
  const storageGb = (frames * rawMb) / 1024;
  // Правило 180° для кіношного змазу руху: витримка ≈ інтервал / 2
  const idealShutterSec = Math.min(intervalSec * 0.5, Math.max(0.01, intervalSec - 0.5));
  return { frames, shootTotalSec, storageGb, idealShutterSec };
}

export function formatDurationLong(totalSec, lang = "uk") {
  const en = lang === "en";
  const uS = en ? "s" : "с";
  const uM = en ? "min" : "хв";
  const uH = en ? "h" : "год";
  const s = Math.round(totalSec);
  if (s < 60) return `${s} ${uS}`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS ? `${m} ${uM} ${remS} ${uS}` : `${m} ${uM}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h} ${uH} ${String(remM).padStart(2, "0")} ${uM}`;
}

// ---------------- 2B. АСТРО-КАЛЬКУЛЯТОР (ПРАВИЛО NPF + 500) ----------------

export function calculateAstro({ focalMm, aperture, sensor, mp = 24.2, declDeg = 0 }) {
  const f = Math.max(4, Number(focalMm) || 24);
  const N = Math.max(0.7, Number(aperture) || 2.8);
  const megapixels = Math.max(4, Math.min(200, Number(mp) || 24));
  const aspect = sensor.w / Math.max(1, sensor.h);
  const widthPx = Math.sqrt(megapixels * 1e6 * aspect);
  const pixelPitchUm = (sensor.w * 1000) / widthPx;
  const cosD = Math.max(0.15, Math.cos((Math.min(80, Math.abs(Number(declDeg) || 0)) * Math.PI) / 180));

  // Офіційна точна формула NPF (SAH): k=1 (ідеальні точкові зорі), k=2 (допустимо без зуму)
  const npfBase = (16.856 * N + 0.0997 * f + 13.713 * pixelPitchUm) / (f * cosD);
  const npfStrictSec = Math.max(0.5, npfBase);
  const npfRelaxedSec = Math.max(1.0, npfBase * 2.0);
  const rule500Sec = Math.max(0.5, 500 / (f * sensor.crop));
  const rule300Sec = Math.max(0.5, 300 / (f * sensor.crop));

  return {
    pixelPitchUm,
    npfStrictSec,
    npfRelaxedSec,
    rule500Sec,
    rule300Sec,
  };
}

// ---------------- 2C. ЕКВІВАЛЕНТНА ЕКСПОЗИЦІЯ (ЕКСПОПАРА) ----------------

export function calculateEquivalentExposure({
  baseAp,
  baseShutterSec,
  baseIso,
  targetAp,
  targetShutterSec,
  targetIso,
  solveFor = "shutter",
  evComp = 0,
}) {
  const ev100 = Math.log2((baseAp * baseAp) / Math.max(1e-6, baseShutterSec)) - Math.log2(Math.max(1, baseIso) / 100);
  const baseLight = (baseShutterSec * baseIso) / (baseAp * baseAp);
  const targetLight = baseLight * Math.pow(2, evComp);

  let outAp = targetAp;
  let outShutterSec = targetShutterSec;
  let outIso = targetIso;

  if (solveFor === "shutter") {
    outShutterSec = (targetLight * targetAp * targetAp) / Math.max(1, targetIso);
  } else if (solveFor === "aperture") {
    outAp = Math.sqrt((targetShutterSec * targetIso) / Math.max(1e-9, targetLight));
  } else if (solveFor === "iso") {
    outIso = (targetLight * targetAp * targetAp) / Math.max(1e-6, targetShutterSec);
  }

  let sceneKey = "ev_night";
  if (ev100 >= 14.2) sceneKey = "ev_bright_sun";
  else if (ev100 >= 11.5) sceneKey = "ev_overcast";
  else if (ev100 >= 8.5) sceneKey = "ev_golden";
  else if (ev100 >= 5.0) sceneKey = "ev_indoor";
  else if (ev100 >= 1.5) sceneKey = "ev_night_street";
  else sceneKey = "ev_stars";

  return {
    ev100,
    sceneKey,
    aperture: outAp,
    shutterSec: outShutterSec,
    iso: outIso,
  };
}

// ---------------- 3. ПІКСЕЛЬНІ СХЕМИ СВІТЛА ДЛЯ ПОРТРЕТІВ ----------------

export const LIGHTING_SCHEMES = [
  {
    id: "rembrandt",
    name: "Рембрандт (Rembrandt)",
    tag: "Драма / Кіно",
    desc: "Світло під 45° збоку і трохи зверху. На тіньовій щоці утворюється характерний світлий трикутник під оком.",
    tip: "Став джерело (або вікно) під 45° від моделі й на 30–40 см вище очей. Для м'якших тіней постав білий відбивач із протилежного боку.",
    light: { x: 48, y: 84, angle: 35 },
    fill: { x: 174, y: 102, type: "reflector" },
    faceShadow: "rembrandt",
  },
  {
    id: "loop",
    name: "Петля (Loop)",
    tag: "Універсальний",
    desc: "Найпопулярніша портретна схема: маленька м'яка тінь від носа йде трохи вниз і вбік, обличчя виглядає об'ємним і природним.",
    tip: "Джерело під ~25–30° збоку і трохи вище голови. Ідеально підходить майже для будь-якої форми обличчя.",
    light: { x: 68, y: 122, angle: 55 },
    fill: null,
    faceShadow: "loop",
  },
  {
    id: "butterfly",
    name: "Метелик (Butterfly / Beauty)",
    tag: "Фешн / Б'юті",
    desc: "Світло рівно над камерою й світить вниз — під носом утворюється симетрична тінь «метелик», гарно підкреслює вилиці.",
    tip: "Попроси модель тримати сріблястий/білий відбивач на рівні грудей (схема Clamshell), щоб прибрати тіні під очима.",
    light: { x: 110, y: 128, angle: 90 },
    fill: { x: 110, y: 104, type: "bottom" },
    faceShadow: "butterfly",
  },
  {
    id: "split",
    name: "Роздільне (Split)",
    tag: "Контраст / ЧБ",
    desc: "Рівно половина обличчя освітлена, інша — у глибокій тіні. Дуже сильний, похмурий і фактурний настрій.",
    tip: "Постав світло чітко під 90° збоку на рівні очей моделі. Круто працює в ч/б та для чоловічих портретів.",
    light: { x: 34, y: 62, angle: 0 },
    fill: null,
    faceShadow: "split",
  },
  {
    id: "rim",
    name: "Контрове + відбивач (Backlight)",
    tag: "Golden Hour / Атмосфера",
    desc: "Сонце або лампа позаду моделі створює золотий контур на волоссі й плечах, а обличчя м'яко підсвічується спереду.",
    tip: "На заході сонця став модель спиною до сонця, експонуй по обличчю (+0.7..+1 EV) і додай відбивач або легкий спалах спереду.",
    light: { x: 110, y: 20, angle: 270 },
    fill: { x: 110, y: 132, type: "reflector_front" },
    faceShadow: "rim",
  },
  {
    id: "broad_short",
    name: "Коротке світло (Short Lighting)",
    tag: "Стрункість / Об'єм",
    desc: "Освітлюється та сторона обличчя, яка повернута ДАЛІ від камери, а ближча сторона в тіні — візуально звужує обличчя і додає глибини.",
    tip: "Поверни голову моделі на 30–45° у бік джерела світла — найпростіший прийом, щоб кадр одразу виглядав «дорожче».",
    light: { x: 168, y: 74, angle: 145 },
    fill: null,
    faceShadow: "short",
  },
];

export function renderLightingSvg(scheme, lang = "uk") {
  const en = lang === "en";
  const lblReflShort = en ? "REFL." : "ВІДБ.";
  const lblRefl = en ? "REFLECTOR" : "ВІДБИВАЧ";
  const lblModel = en ? "MODEL" : "МОДЕЛЬ";
  const lblLight = en ? "KEY LIGHT" : "СВІТЛО";
  const lblCam = en ? "CAMERA" : "КАМЕРА";

  // Піксельна зверху-вниз схема (220×176): Модель у (110, 62), Камера в (110, 152)
  const L = scheme.light;
  let fillSvg = "";
  if (scheme.fill?.type === "reflector") {
    fillSvg = `<rect x="164" y="88" width="8" height="30" fill="#e2e8f0" stroke="#38bdf8" stroke-width="2"/>
               <text x="168" y="130" fill="#94a3b8" font-size="8" text-anchor="middle">${lblReflShort}</text>`;
  } else if (scheme.fill?.type === "reflector_front") {
    fillSvg = `<rect x="92" y="114" width="36" height="7" fill="#e2e8f0" stroke="#38bdf8" stroke-width="2"/>
               <text x="110" y="109" fill="#94a3b8" font-size="8" text-anchor="middle">${lblRefl}</text>`;
  } else if (scheme.fill?.type === "bottom") {
    fillSvg = `<rect x="94" y="96" width="32" height="6" fill="#e2e8f0" stroke="#38bdf8" stroke-width="2"/>`;
  }

  // Тіньова частина на голові моделі для наочності
  let headShadow = "";
  if (scheme.faceShadow === "rembrandt") {
    headShadow = `<rect x="110" y="48" width="14" height="28" fill="#0f172a" opacity="0.72"/>
                  <polygon points="113,62 120,62 116,69" fill="#fde68a"/>`;
  } else if (scheme.faceShadow === "loop") {
    headShadow = `<rect x="114" y="48" width="10" height="28" fill="#0f172a" opacity="0.55"/>`;
  } else if (scheme.faceShadow === "split") {
    headShadow = `<rect x="110" y="48" width="14" height="28" fill="#0f172a" opacity="0.88"/>`;
  } else if (scheme.faceShadow === "butterfly") {
    headShadow = `<rect x="104" y="70" width="12" height="5" fill="#0f172a" opacity="0.65"/>`;
  } else if (scheme.faceShadow === "rim") {
    headShadow = `<rect x="96" y="52" width="28" height="24" fill="#0f172a" opacity="0.45"/>
                  <rect x="96" y="48" width="28" height="4" fill="#fde047"/>`;
  } else if (scheme.faceShadow === "short") {
    headShadow = `<rect x="96" y="48" width="15" height="28" fill="#0f172a" opacity="0.68"/>`;
  }

  return `
    <svg viewBox="0 0 220 176" width="100%" style="max-width:260px;display:block;margin:0 auto;image-rendering:pixelated;">
      <rect x="2" y="2" width="216" height="172" fill="#0b0f22" stroke="#4d58d8" stroke-width="2"/>
      <!-- Промінь світла -->
      <line x1="${L.x}" y1="${L.y}" x2="110" y2="62" stroke="#facc15" stroke-width="3" stroke-dasharray="5 4"/>
      <!-- Лінія камери -->
      <line x1="110" y1="142" x2="110" y2="80" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3 4"/>

      <!-- Модель (вид зверху: плечі + голова) -->
      <rect x="82" y="54" width="56" height="16" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
      <rect x="96" y="48" width="28" height="28" fill="#fed7aa" stroke="#ffffff" stroke-width="2"/>
      ${headShadow}
      <!-- Ніс моделі (дивиться вниз до камери) -->
      <rect x="108" y="76" width="4" height="4" fill="#ffffff"/>
      <text x="110" y="42" fill="#cbd5e1" font-size="8" text-anchor="middle" font-weight="700">${lblModel}</text>

      <!-- Джерело світла -->
      <rect x="${L.x - 10}" y="${L.y - 10}" width="20" height="20" fill="#f97316" stroke="#fde047" stroke-width="2"/>
      <rect x="${L.x - 4}" y="${L.y - 4}" width="8" height="8" fill="#fef08a"/>
      <text x="${L.x}" y="${L.y + 20}" fill="#fde047" font-size="8" text-anchor="middle" font-weight="700">${lblLight}</text>

      ${fillSvg}

      <!-- Піксельна камера -->
      <rect x="96" y="144" width="28" height="18" fill="#1e293b" stroke="#ffffff" stroke-width="2"/>
      <rect x="104" y="138" width="12" height="6" fill="#00a8f3" stroke="#ffffff" stroke-width="1.5"/>
      <rect x="100" y="147" width="4" height="4" fill="#f97316"/>
      <text x="150" y="157" fill="#38bdf8" font-size="8" font-weight="700">${lblCam}</text>
    </svg>
  `;
}
