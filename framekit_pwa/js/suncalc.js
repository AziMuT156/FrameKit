/**
 * Офлайн-калькулятор положення сонця, Golden Hour та Blue Hour.
 * Засновано на точних астрономічних формулах (алгоритм SunCalc / Jean Meeus).
 * Азимут повертається в градусах від Півночі за годинниковою стрілкою:
 * 0° = Північ, 90° = Схід, 180° = Південь, 270° = Захід.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;
const J0 = 0.0009;

function toJulian(date) {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}

function fromJulian(j) {
  return new Date((j + 0.5 - J1970) * DAY_MS);
}

function toDays(date) {
  return toJulian(date) - J2000;
}

function rightAscension(l, b) {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
}

function declination(l, b) {
  return Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
}

function azimuthSouth(H, phi, dec) {
  return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}

function altitudeRad(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

function siderealTime(d, lw) {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function solarMeanAnomaly(d) {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function julianCycle(d, lw) {
  return Math.round(d - J0 - lw / (2 * Math.PI));
}

function approxTransit(Ht, lw, n) {
  return J0 + (Ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h, phi, dec) {
  const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH < -1 || cosH > 1) return NaN;
  return Math.acos(cosH);
}

function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  if (Number.isNaN(w)) return NaN;
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

/**
 * Положення сонця для конкретної дати/часу та координат.
 * Повертає azimuthDeg (0..360° від Півночі) і altitudeDeg (-90..+90°).
 */
export function getSunPosition(date, lat, lng) {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;

  const azFromSouth = azimuthSouth(H, phi, c.dec) * DEG;
  const azimuthDeg = (azFromSouth + 180 + 360) % 360;
  const altitudeDeg = altitudeRad(H, phi, c.dec) * DEG;

  return { azimuthDeg, altitudeDeg };
}

/**
 * Ключові часи освітлення для дня: Blue Hour, Golden Hour, схід, полудень, захід.
 */
export function getSunTimes(date, lat, lng) {
  // Беремо локальний полудень дня, щоб правильно вирахувати добу у будь-якому часовому поясі
  const noonLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(noonLocal);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const calcPair = (angleDeg) => {
    const Jset = getSetJ(angleDeg * RAD, lw, phi, dec, n, M, L);
    if (Number.isNaN(Jset)) return [null, null];
    const Jrise = Jnoon - (Jset - Jnoon);
    return [fromJulian(Jrise), fromJulian(Jset)];
  };

  const [dawn, dusk] = calcPair(-6);           // Цивільні сутінки (початок/кінець Blue Hour)
  const [blueEndMorning, blueStartEvening] = calcPair(-4);
  const [sunrise, sunset] = calcPair(-0.833);  // Схід / Захід
  const [goldenMorningEnd, goldenEveningStart] = calcPair(6); // Golden Hour (+6°..-4°)

  return {
    solarNoon: fromJulian(Jnoon),
    dawn,
    blueMorningStart: dawn,
    blueMorningEnd: blueEndMorning,
    sunrise,
    goldenMorningStart: blueEndMorning,
    goldenMorningEnd,
    goldenEveningStart,
    sunset,
    goldenEveningEnd: blueStartEvening,
    blueEveningStart: blueStartEvening,
    blueEveningEnd: dusk,
    dusk,
  };
}

export function azimuthToCompass(deg, lang = "uk") {
  const dirs = lang === "en"
    ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    : ["Пн", "ПнСх", "Сх", "ПдСх", "Пд", "ПдЗх", "Зх", "ПнЗх"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

export function formatTimeHM(date) {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Точна оптична математика: ГРІП (DoF), гіперфокальна відстань та кут огляду.
 * @param {number} focalMm   Фізична фокусна відстань (мм)
 * @param {number} aperture  Діафрагма (f-number)
 * @param {number} distM     Дистанція фокусування (метри)
 * @param {{w:number, h:number, coc:number, crop:number}} sensor
 */
export function calculateDoF(focalMm, aperture, distM, sensor) {
  const f = Math.max(1, Number(focalMm));
  const N = Math.max(0.7, Number(aperture));
  const c = sensor.coc;
  const s = Math.max(0.05, Number(distM)) * 1000; // у міліметрах

  const H = (f * f) / (N * c) + f; // гіперфокальна відстань (мм)
  const nearMm = (s * (H - f)) / (H + s - 2 * f);
  const isInf = s >= H;
  const farMm = isInf ? Infinity : (s * (H - f)) / (H - s);
  const totalMm = isInf ? Infinity : Math.max(0, farMm - nearMm);

  const inFrontMm = Math.max(0, s - nearMm);
  const behindMm = isInf ? Infinity : Math.max(0, farMm - s);
  const frontPct = isInf || totalMm <= 0 ? 0 : (inFrontMm / totalMm) * 100;
  const behindPct = isInf || totalMm <= 0 ? 100 : (behindMm / totalMm) * 100;

  const hfov = 2 * Math.atan(sensor.w / (2 * f)) * DEG;
  const vfov = 2 * Math.atan(sensor.h / (2 * f)) * DEG;

  return {
    hyperfocalM: H / 1000,
    nearM: Math.max(0, nearMm / 1000),
    farM: isInf ? Infinity : farMm / 1000,
    totalM: isInf ? Infinity : totalMm / 1000,
    inFrontM: inFrontMm / 1000,
    behindM: isInf ? Infinity : behindMm / 1000,
    frontPct,
    behindPct,
    isInfinity: isInf,
    equivFocalMm: Math.round(f * sensor.crop),
    hfovDeg: hfov,
    vfovDeg: vfov,
  };
}

export function formatDistance(meters, lang = "uk") {
  const en = lang === "en";
  if (!Number.isFinite(meters)) return en ? "∞ (infinity)" : "∞ (нескінченність)";
  if (meters < 0.01) return `${(meters * 1000).toFixed(1)} ${en ? "mm" : "мм"}`;
  if (meters < 1.0) return `${(meters * 100).toFixed(1)} ${en ? "cm" : "см"}`;
  if (meters < 10.0) return `${meters.toFixed(2)} ${en ? "m" : "м"}`;
  if (meters < 100.0) return `${meters.toFixed(1)} ${en ? "m" : "м"}`;
  return `${Math.round(meters)} ${en ? "m" : "м"}`;
}

export function formatExposure(sec, lang = "uk") {
  const en = lang === "en";
  const uS = en ? "s" : "с";
  const uM = en ? "min" : "хв";
  const uH = en ? "h" : "год";
  if (sec < 0.4) {
    const denom = Math.max(1, Math.round(1 / sec));
    return `1/${denom} ${uS}`;
  }
  if (sec < 60) {
    return sec < 10 ? `${sec.toFixed(1)} ${uS}` : `${Math.round(sec)} ${uS}`;
  }
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  if (mins < 60) return `${mins} ${uM} ${String(rem).padStart(2, "0")} ${uS}`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  return `${hrs} ${uH} ${String(remM).padStart(2, "0")} ${uM}`;
}

/**
 * Офлайн-розрахунок фази та освітленості Місяця (астрономічна модель Jean Meeus / SunCalc).
 * Повертає fraction (0..1), phase (0..1: 0=Молодик, 0.5=Повня), ageDays (0..29.53), phaseKey та astroRating.
 */
export function getMoonPhase(date) {
  const d = toDays(date);
  const s = sunCoords(d);
  const L = RAD * (218.316 + 13.176396 * d); // екліптична довгота Місяця
  const M = RAD * (134.963 + 13.064993 * d); // середня аномалія
  const F = RAD * (93.272 + 13.229350 * d);  // аргумент широти
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const mRa = rightAscension(l, b);
  const mDec = declination(l, b);
  const mDist = 385001 - 20905 * Math.cos(M);
  const sDist = 149598000;

  const phi = Math.acos(
    Math.max(-1, Math.min(1, Math.sin(s.dec) * Math.sin(mDec) + Math.cos(s.dec) * Math.cos(mDec) * Math.cos(s.ra - mRa)))
  );
  const inc = Math.atan2(sDist * Math.sin(phi), mDist - sDist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - mRa),
    Math.sin(s.dec) * Math.cos(mDec) - Math.cos(s.dec) * Math.sin(mDec) * Math.cos(s.ra - mRa)
  );

  const fraction = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  const ageDays = phase * 29.53058867;

  let phaseKey = "new";
  if (phase < 0.03 || phase >= 0.97) phaseKey = "new";
  else if (phase < 0.22) phaseKey = "waxing_crescent";
  else if (phase < 0.28) phaseKey = "first_quarter";
  else if (phase < 0.47) phaseKey = "waxing_gibbous";
  else if (phase < 0.53) phaseKey = "full";
  else if (phase < 0.72) phaseKey = "waning_gibbous";
  else if (phase < 0.78) phaseKey = "last_quarter";
  else phaseKey = "waning_crescent";

  const astroRating = fraction < 0.16 ? "ideal" : fraction < 0.45 ? "ok" : "bright";
  return { fraction, phase, ageDays, phaseKey, astroRating };
}

/**
 * Піксельна SVG-ілюстрація фази Місяця для Астро-калькулятора.
 */
export function renderMoonSvg(phase) {
  // phase: 0=new, 0.25=first quarter (right lit), 0.5=full, 0.75=last quarter (left lit)
  const r = 34;
  const cx = 44;
  const cy = 44;
  const waxing = phase <= 0.5;
  // rx термінатора: від +r (new) через 0 (quarter) до -r (full)
  const cosP = Math.cos(phase * Math.PI * 2);
  const rx = Math.abs(cosP) * r;
  let litPath = "";

  if (phase < 0.015 || phase > 0.985) {
    litPath = "";
  } else if (Math.abs(phase - 0.5) < 0.015) {
    litPath = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fef08a"/>`;
  } else if (waxing) {
    // Права півкуля освітлена; якщо phase > 0.25 (gibbous), термінатор вигинається вліво (sweep=0)
    const sweepInner = phase > 0.25 ? 0 : 1;
    litPath = `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z" fill="#fef08a"/>`;
  } else {
    // Ліва півкуля освітлена; якщо phase < 0.75 (gibbous), термінатор вигинається вправо (sweep=1)
    const sweepInner = phase < 0.75 ? 1 : 0;
    litPath = `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z" fill="#fef08a"/>`;
  }

  return `
    <svg viewBox="0 0 88 88" width="76" height="76" style="display:block;flex-shrink:0;">
      <rect x="2" y="2" width="84" height="84" fill="#070a18" stroke="#4d58d8" stroke-width="2"/>
      <rect x="10" y="10" width="2" height="2" fill="#94a3b8"/>
      <rect x="74" y="14" width="2" height="2" fill="#e2e8f0"/>
      <rect x="14" y="72" width="2" height="2" fill="#cbd5e1"/>
      <rect x="70" y="70" width="2" height="2" fill="#94a3b8"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#171e38" stroke="#64748b" stroke-width="2"/>
      ${litPath}
      <circle cx="${cx - 10}" cy="${cy - 8}" r="4" fill="#000000" opacity="0.14"/>
      <circle cx="${cx + 12}" cy="${cy + 9}" r="6" fill="#000000" opacity="0.12"/>
      <circle cx="${cx + 6}" cy="${cy - 14}" r="3" fill="#000000" opacity="0.14"/>
    </svg>`;
}
