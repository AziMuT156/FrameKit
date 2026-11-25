/**
 * WebGL2 GPU-движок обробки фото для FrameKit Studio (рівень міні-Lightroom, 100% офлайн).
 * Підтримує: Світло (EV, Contrast, Highlights, Shadows, Whites, Blacks),
 * Колір (Temp, Tint, Vibrance, Saturation), 8-канальний HSL мікшер, Color Grading,
 * 5-точкову тональну криву, Clarity/Sharpen, Vignette, Film Grain, Fade,
 * до 4 локальних масок (Лінійний градієнт, Радіальна, Пензель) та Кроп/Горизонт.
 */

export const HSL_BANDS = [
  { key: "red",     name: "Черв.",   color: "#ef4444", hue: 0 },
  { key: "orange",  name: "Помар.",  color: "#f97316", hue: 30 },
  { key: "yellow",  name: "Жовт.",   color: "#eab308", hue: 60 },
  { key: "green",   name: "Зелен.",  color: "#22c55e", hue: 120 },
  { key: "aqua",    name: "Аква",    color: "#06b6d4", hue: 180 },
  { key: "blue",    name: "Синій",   color: "#3b82f6", hue: 230 },
  { key: "purple",  name: "Фіол.",   color: "#8b5cf6", hue: 280 },
  { key: "magenta", name: "Мадж.",   color: "#ec4899", hue: 325 },
];

export function createDefaultEdits() {
  return {
    // Світло
    exposure: 0,      // -3 .. +3 EV
    contrast: 0,      // -100 .. +100
    highlights: 0,    // -100 .. +100
    shadows: 0,       // -100 .. +100
    whites: 0,        // -100 .. +100
    blacks: 0,        // -100 .. +100
    // Колір
    temp: 0,          // -100 .. +100
    tint: 0,          // -100 .. +100
    vibrance: 0,      // -100 .. +100
    saturation: 0,    // -100 .. +100
    // HSL: 8 діапазонів (hue: -100..100, sat: -100..100, lum: -100..100)
    hslH: [0, 0, 0, 0, 0, 0, 0, 0],
    hslS: [0, 0, 0, 0, 0, 0, 0, 0],
    hslL: [0, 0, 0, 0, 0, 0, 0, 0],
    // Color Grading (Тонування)
    shadowHue: 210,   // 0..360
    shadowSat: 0,     // 0..100
    highHue: 38,      // 0..360
    highSat: 0,       // 0..100
    // Тональна крива (5 точок: 0, 25%, 50%, 75%, 100%, зміщення -50..+50)
    curve: [0, 0, 0, 0, 0],
    // Ефекти
    clarity: 0,       // -100 .. +100
    sharpen: 0,       // 0 .. 100
    vignette: 0,      // -100 .. +100
    grain: 0,         // 0 .. 100
    fade: 0,          // 0 .. 100
    // Геометрія / Кроп
    straighten: 0,    // -45 .. +45 deg
    rotate90: 0,      // 0, 1, 2, 3
    flipH: false,
    aspect: "orig",   // "orig" | "4:5" | "1:1" | "3:2" | "16:9" | "9:16"
  };
}

export function createMask(type, id) {
  return {
    id,
    type, // "linear" | "radial" | "brush"
    name: type === "linear" ? "Градієнт" : type === "radial" ? "Радіальна" : "Пензель",
    enabled: true,
    invert: false,
    // Лінійна: точка початку (100%) -> точка кінця (0%)
    x1: 0.5, y1: 0.12,
    x2: 0.5, y2: 0.58,
    // Радіальна: центр + радіуси + м'якість
    cx: 0.5, cy: 0.45,
    rx: 0.28, ry: 0.32,
    feather: 0.45,
    // Локальні корекції маски
    exposure: type === "linear" ? -0.6 : 0.35,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    temp: 0,
    saturation: 0,
    clarity: 0,
  };
}

export const BUILTIN_PRESETS = [
  { id: "orig", name: "Оригінал", patch: {} },
  {
    id: "portra",
    name: "Kodak Portra",
    patch: {
      exposure: 0.15, contrast: -8, highlights: -22, shadows: 24, blacks: 8,
      temp: 14, tint: 4, vibrance: 10, saturation: -4,
      hslH: [6, 4, -8, -14, 0, -6, 0, 0], hslS: [4, -4, -12, -26, -10, -14, -8, 0], hslL: [4, 8, 4, -6, 0, 4, 0, 0],
      shadowHue: 195, shadowSat: 10, highHue: 40, highSat: 16,
      fade: 14, grain: 18, vignette: -10,
    },
  },
  {
    id: "cinestill",
    name: "CineStill 800T",
    patch: {
      exposure: 0.05, contrast: 18, highlights: -30, shadows: 18, blacks: -8,
      temp: -22, tint: 8, vibrance: 18, saturation: 4,
      hslH: [-6, -8, -10, 18, 12, -10, 8, -8], hslS: [18, 12, -8, -22, 18, 14, 10, 14], hslL: [0, 4, 0, -8, 6, -6, 0, 0],
      shadowHue: 192, shadowSat: 32, highHue: 34, highSat: 20,
      clarity: 12, fade: 8, grain: 24, vignette: -18,
    },
  },
  {
    id: "teal_orange",
    name: "Teal & Orange",
    patch: {
      contrast: 16, highlights: -24, shadows: 14, temp: 8, vibrance: 14, saturation: -4,
      hslH: [8, 4, -22, -32, -14, -18, 0, 0], hslS: [12, 18, -16, -34, 16, 12, -25, -20], hslL: [0, 6, 0, -10, -4, -10, 0, 0],
      shadowHue: 195, shadowSat: 34, highHue: 35, highSat: 24,
      clarity: 16, vignette: -16,
    },
  },
  {
    id: "moody_dark",
    name: "Moody Dark",
    patch: {
      exposure: -0.25, contrast: 24, highlights: -38, shadows: -10, blacks: -14,
      temp: -6, vibrance: -12, saturation: -18,
      hslH: [0, -4, -12, -26, -10, -10, 0, 0], hslS: [-10, -14, -30, -52, -32, -22, -30, -30], hslL: [-4, 2, -6, -18, -12, -14, 0, 0],
      shadowHue: 215, shadowSat: 20, highHue: 45, highSat: 8,
      clarity: 22, fade: 16, vignette: -28, grain: 14,
    },
  },
  {
    id: "golden_warm",
    name: "Golden Hour",
    patch: {
      exposure: 0.1, contrast: 10, highlights: -26, shadows: 22,
      temp: 26, tint: 6, vibrance: 16, saturation: 4,
      shadowHue: 28, shadowSat: 14, highHue: 42, highSat: 28,
      fade: 8, vignette: -12,
    },
  },
  {
    id: "fuji_classic",
    name: "Fuji Chrome",
    patch: {
      contrast: 18, highlights: -16, shadows: -6, blacks: -6,
      temp: -4, tint: -4, vibrance: -6, saturation: -14,
      hslH: [4, -4, -6, 10, -8, -14, 0, 0], hslS: [-8, -10, -12, -20, -10, -16, -12, -12], hslL: [-4, 4, 0, -10, -4, -8, 0, 0],
      shadowHue: 185, shadowSat: 12, highHue: 48, highSat: 10,
      clarity: 10, grain: 16, fade: 6,
    },
  },
  {
    id: "bw_drama",
    name: "B&W Drama",
    patch: {
      contrast: 36, highlights: -28, shadows: 14, whites: 18, blacks: -18,
      saturation: -100, clarity: 32, sharpen: 25, grain: 26, vignette: -24, fade: 6,
    },
  },
];

// ---------------- WEBGL SHADERS (GLSL ES 3.00) ----------------

const VS_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform sampler2D u_curveLut;
uniform sampler2D u_brushTex;
uniform vec2 u_texelSize;
uniform float u_aspect; // width / height

// Глобальні параметри
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temp;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;

uniform float u_hslH[8];
uniform float u_hslS[8];
uniform float u_hslL[8];

uniform float u_shadowHue;
uniform float u_shadowSat;
uniform float u_highHue;
uniform float u_highSat;

uniform float u_clarity;
uniform float u_sharpen;
uniform float u_vignette;
uniform float u_grain;
uniform float u_fade;

// Режим До/Після, 16-бітний лінійний RAW та індикатор пересвітів (J-зебра)
uniform int u_showOriginal;
uniform int u_isRawLinear;
uniform int u_showClipping;

// Маски (до 4 шт.)
uniform int u_maskCount;
uniform int u_maskType[4];      // 0=off, 1=linear, 2=radial, 3=brush(R-chan of brushTex)
uniform int u_maskInvert[4];
uniform vec4 u_maskGeom[4];     // linear: x1,y1,x2,y2 | radial: cx,cy,rx,ry
uniform float u_maskFeather[4];
uniform vec4 u_maskLight[4];    // exp, contrast, highlights, shadows
uniform vec3 u_maskColor[4];    // temp, saturation, clarity
uniform int u_overlayMaskIdx;   // -1 = off, 0..3 = показати червоним обрану маску

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / max(0.0001, 2.0 - maxC - minC) : d / max(0.0001, maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

float hueDist(float h1, float h2) {
  float d = abs(h1 - h2);
  return min(d, 1.0 - d);
}

vec3 applyBasicTone(vec3 c, float expVal, float conVal, float hiVal, float shVal, float whVal, float blVal) {
  // Експозиція в реальних EV
  c *= exp2(expVal);

  // Highlights / Shadows (уникаємо pow(0.0, 2.2) на мобільних GPU)
  float y = clamp(luma(c), 0.0, 1.0);
  float shMask = pow(max(0.0001, 1.0 - y), 2.2);
  float hiMask = pow(max(0.0001, y), 2.2);
  c += shVal * 0.45 * shMask * (c + 0.08);
  c += hiVal * 0.45 * hiMask * (1.0 - c * 0.4);

  // Whites / Blacks
  float whMask = smoothstep(0.55, 1.0, y);
  float blMask = 1.0 - smoothstep(0.0, 0.45, y);
  c += whVal * 0.30 * whMask;
  c += blVal * 0.25 * blMask;

  // Контраст (плавна S-подібна крива навколо 0.5)
  float cf = 1.0 + conVal * 0.85;
  c = (c - 0.5) * cf + 0.5;
  return clamp(c, 0.0, 1.0);
}

vec3 applyTempTint(vec3 c, float tempVal, float tintVal) {
  c.r += tempVal * 0.14;
  c.b -= tempVal * 0.14;
  c.g -= tintVal * 0.10;
  c.r += tintVal * 0.04;
  c.b += tintVal * 0.04;
  return clamp(c, 0.0, 1.0);
}

vec3 applyVibSat(vec3 c, float vib, float sat) {
  float y = luma(c);
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float curSat = maxC - minC;
  // Vibrance сильніше піднімає менш насичені кольори
  float vibBoost = vib * (1.0 - curSat) * 0.75;
  c = mix(vec3(y), c, clamp(1.0 + sat + vibBoost, 0.0, 2.5));
  return clamp(c, 0.0, 1.0);
}

float evalMaskWeight(int idx, vec2 uv) {
  int t = u_maskType[idx];
  if (t == 0) return 0.0;
  float w = 0.0;
  if (t == 1) {
    // Лінійний градієнт від (x1,y1)=1 до (x2,y2)=0
    vec2 p1 = u_maskGeom[idx].xy;
    vec2 p2 = u_maskGeom[idx].zw;
    vec2 d = p2 - p1;
    float len2 = max(0.0001, dot(d, d));
    float proj = clamp(dot(uv - p1, d) / len2, 0.0, 1.0);
    w = 1.0 - smoothstep(0.0, 1.0, proj);
  } else if (t == 2) {
    // Радіальна маска (еліпс)
    vec2 c = u_maskGeom[idx].xy;
    vec2 r = max(vec2(0.02), u_maskGeom[idx].zw);
    float dist = length((uv - c) / r);
    float f = clamp(u_maskFeather[idx], 0.05, 0.95);
    w = 1.0 - smoothstep(1.0 - f, 1.0 + f * 0.35, dist);
  } else if (t == 3) {
    // Пензель із текстури u_brushTex (кожен канал R/G/B/A може зберігати маску, або використовуємо канал idx)
    vec4 b = texture(u_brushTex, uv);
    w = (idx == 0) ? b.r : (idx == 1) ? b.g : (idx == 2) ? b.b : b.a;
  }
  if (u_maskInvert[idx] == 1) w = 1.0 - w;
  return clamp(w, 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Плавна фільмічна крива для HDR-світлих > 0.85 та точний sRGB OETF для 16-біт RAW
vec3 softHighlightRolloff(vec3 x) {
  x = max(x, vec3(0.0));
  vec3 knee = vec3(0.82);
  vec3 over = max(x - knee, vec3(0.0));
  return min(x, knee) + over / (1.0 + over * 1.15);
}

vec3 linearToSrgb(vec3 x) {
  x = clamp(x, 0.0, 1.0);
  vec3 lo = x * 12.92;
  vec3 hi = 1.055 * pow(max(x, vec3(0.00001)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), x));
}

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y); // flip Y для Canvas координат
  vec3 rawSample = texture(u_image, uv).rgb;
  vec3 origSrgb = (u_isRawLinear == 1) ? linearToSrgb(softHighlightRolloff(rawSample)) : rawSample;

  if (u_showOriginal == 1) {
    outColor = vec4(origSrgb, 1.0);
    return;
  }

  // 1. Локальне розмиття для Clarity + Sharpen (3x3 швидке ядро)
  vec3 s00 = texture(u_image, uv + vec2(-u_texelSize.x, -u_texelSize.y)).rgb;
  vec3 s10 = texture(u_image, uv + vec2( 0.0,           -u_texelSize.y)).rgb;
  vec3 s20 = texture(u_image, uv + vec2( u_texelSize.x, -u_texelSize.y)).rgb;
  vec3 s01 = texture(u_image, uv + vec2(-u_texelSize.x,  0.0          )).rgb;
  vec3 s21 = texture(u_image, uv + vec2( u_texelSize.x,  0.0          )).rgb;
  vec3 s02 = texture(u_image, uv + vec2(-u_texelSize.x,  u_texelSize.y)).rgb;
  vec3 s12 = texture(u_image, uv + vec2( 0.0,            u_texelSize.y)).rgb;
  vec3 s22 = texture(u_image, uv + vec2( u_texelSize.x,  u_texelSize.y)).rgb;
  vec3 blurRaw = (s00 + s10 * 2.0 + s20 + s01 * 2.0 + rawSample * 4.0 + s21 * 2.0 + s02 + s12 * 2.0 + s22) / 16.0;
  vec3 blurSrgb = (u_isRawLinear == 1) ? linearToSrgb(softHighlightRolloff(blurRaw)) : blurRaw;
  vec3 detail = origSrgb - blurSrgb;

  // 2. Глобальне світло + баланс білого
  vec3 c;
  if (u_isRawLinear == 1) {
    // Справжня 16-бітна лінійна проявка RAW (як у Lightroom / Camera Raw):
    // Експозиція та ББ у лінійному світлі + реальне витягування HDR-пересвітів (> 1.0)
    vec3 lin = max(rawSample, vec3(0.0));
    lin *= exp2(u_exposure);

    // Фізичний лінійний баланс білого (мультиплікативні коефіцієнти R/G/B)
    lin.r *= max(0.35, 1.0 + u_temp * 0.42 + u_tint * 0.10);
    lin.g *= max(0.35, 1.0 - u_tint * 0.28);
    lin.b *= max(0.35, 1.0 - u_temp * 0.42 + u_tint * 0.10);

    // Лінійне витягування світлих ділянок (працює навіть для HDR-піків > 1.0!) та тіней
    float ly = max(0.0001, luma(lin));
    float hiWeight = smoothstep(0.28, 1.25, ly);
    float shWeight = 1.0 - smoothstep(0.0, 0.24, ly);
    lin *= exp2(u_highlights * 1.35 * hiWeight);
    lin *= exp2(u_shadows * 1.45 * shWeight);

    // Плавний перехід у sRGB + Whites / Blacks / Contrast
    c = linearToSrgb(softHighlightRolloff(lin));
    float sy = clamp(luma(c), 0.0, 1.0);
    float whMask = smoothstep(0.55, 1.0, sy);
    float blMask = 1.0 - smoothstep(0.0, 0.45, sy);
    c += u_whites * 0.30 * whMask;
    c += u_blacks * 0.25 * blMask;
    float cf = 1.0 + u_contrast * 0.85;
    c = clamp((c - 0.5) * cf + 0.5, 0.0, 1.0);
  } else {
    c = applyBasicTone(origSrgb, u_exposure, u_contrast, u_highlights, u_shadows, u_whites, u_blacks);
    c = applyTempTint(c, u_temp, u_tint);
  }
  c = applyVibSat(c, u_vibrance, u_saturation);

  // 3. 8-канальний HSL мікшер
  vec3 hsl = rgb2hsl(c);
  if (hsl.y > 0.02) {
    float centers[8] = float[8](0.0, 0.0833, 0.1667, 0.3333, 0.5000, 0.6389, 0.7778, 0.9028);
    float dH = 0.0, dS = 0.0, dL = 0.0;
    for (int i = 0; i < 8; i++) {
      float dist = hueDist(hsl.x, centers[i]);
      float w = 1.0 - smoothstep(0.0, 0.11, dist);
      dH += w * u_hslH[i];
      dS += w * u_hslS[i];
      dL += w * u_hslL[i];
    }
    hsl.x = fract(hsl.x + dH * 0.10 + 1.0);
    hsl.y = clamp(hsl.y * (1.0 + dS * 0.9), 0.0, 1.0);
    hsl.z = clamp(hsl.z + dL * 0.25 * hsl.y, 0.0, 1.0);
    c = hsl2rgb(hsl);
  }

  // 4. Тональна крива (LUT текстура)
  c.r = texture(u_curveLut, vec2(c.r, 0.5)).r;
  c.g = texture(u_curveLut, vec2(c.g, 0.5)).r;
  c.b = texture(u_curveLut, vec2(c.b, 0.5)).r;

  // 5. Color Grading (тонування тіней та світлих)
  float cy = luma(c);
  if (u_shadowSat > 0.001) {
    vec3 shCol = hsl2rgb(vec3(u_shadowHue / 360.0, 0.65, 0.5));
    c = mix(c, mix(c, shCol, 0.35), (1.0 - smoothstep(0.0, 0.65, cy)) * u_shadowSat);
  }
  if (u_highSat > 0.001) {
    vec3 hiCol = hsl2rgb(vec3(u_highHue / 360.0, 0.65, 0.55));
    c = mix(c, mix(c, hiCol, 0.35), smoothstep(0.35, 1.0, cy) * u_highSat);
  }

  // 6. Глобальні Clarity та Sharpen
  float midWeight = 1.0 - abs(cy - 0.5) * 1.6;
  c += detail * (u_clarity * 0.9 * max(0.15, midWeight) + u_sharpen * 1.25);
  c = clamp(c, 0.0, 1.0);

  // 7. Локальні маски (до 4 активних масок)
  for (int m = 0; m < 4; m++) {
    if (m >= u_maskCount) break;
    float mw = evalMaskWeight(m, uv);
    if (mw > 0.002) {
      vec3 mc = c;
      vec4 ml = u_maskLight[m];
      vec3 mcol = u_maskColor[m];
      mc = applyBasicTone(mc, ml.x, ml.y, ml.z, ml.w, 0.0, 0.0);
      mc = applyTempTint(mc, mcol.x, 0.0);
      mc = applyVibSat(mc, 0.0, mcol.y);
      mc += detail * (mcol.z * 0.95);
      c = mix(c, clamp(mc, 0.0, 1.0), mw);
    }
  }

  // 8. Fade (плівковий підйом чорного)
  if (u_fade > 0.001) {
    c = mix(c, vec3(0.11, 0.11, 0.12) + c * 0.85, u_fade * 0.85);
  }

  // 9. Віньєтка
  if (abs(u_vignette) > 0.001) {
    vec2 centered = (uv - 0.5) * vec2(max(1.0, u_aspect * 0.8), 1.0);
    float d = length(centered) * 1.45;
    float vf = smoothstep(0.35, 1.15, d);
    if (u_vignette < 0.0) {
      c *= 1.0 + u_vignette * 0.85 * vf;
    } else {
      c = mix(c, vec3(1.0), u_vignette * 0.65 * vf);
    }
  }

  // 10. Плівкове зерно
  if (u_grain > 0.001) {
    float n = (hash12(uv * vec2(1200.0, 900.0)) - 0.5) * u_grain * 0.22;
    c += vec3(n);
  }

  c = clamp(c, 0.0, 1.0);

  // Підсвітка активної маски червоним оверлеєм (як у Lightroom)
  if (u_overlayMaskIdx >= 0 && u_overlayMaskIdx < u_maskCount) {
    float ow = evalMaskWeight(u_overlayMaskIdx, uv);
    c = mix(c, vec3(0.95, 0.15, 0.18), ow * 0.48);
  }

  // Індикатор пересвітів (червоний) і провалів у чорне (синій) — як клавіша J у Lightroom
  if (u_showClipping == 1) {
    float maxCh = max(c.r, max(c.g, c.b));
    float minCh = min(c.r, min(c.g, c.b));
    if (maxCh >= 0.992) {
      c = vec3(1.0, 0.12, 0.12);
    } else if (minCh <= 0.008) {
      c = vec3(0.12, 0.38, 1.0);
    }
  }

  outColor = vec4(c, 1.0);
}`;

export class PhotoEditorEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!this.gl) throw new Error("WebGL2 не підтримується на цьому пристрої");

    this.sourceImg = null;
    this.previewImgCanvas = null;
    this.isRawMode = false;
    this.previewRawData = null; // { floatData, width, height }
    this.program = null;
    this.imageTex = null;
    this.curveTex = null;
    this.brushTex = null;

    // Offscreen 512x512 RGBA canvas для пензлевих масок (до 4 каналів R/G/B/A)
    this.brushCanvases = [0, 1, 2, 3].map(() => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 512;
      return c;
    });
    this.brushData = new Uint8Array(512 * 512 * 4);

    this._initGL();
  }

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _initGL() {
    const gl = this.gl;
    const vs = this._compile(gl.VERTEX_SHADER, VS_SRC);
    const fs = this._compile(gl.FRAGMENT_SHADER, FS_SRC);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    this.program = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.imageTex = this._makeTex(0);
    this.curveTex = this._makeTex(1);
    this.brushTex = this._makeTex(2);
    this.uploadBrushMasks();
  }

  _makeTex(unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  loadImage(img) {
    this.isRawMode = false;
    this.previewRawData = null;
    this.sourceImg = img;
    // Прев'ю до 1600px для 60fps без підвисань навіть на важких 50MP фотках
    const maxPreview = 1600;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > maxPreview || h > maxPreview) {
      const r = Math.min(maxPreview / w, maxPreview / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    this.previewImgCanvas = c;

    this._uploadSourceTexture(c);
    this.clearAllBrushMasks();
  }

  /**
   * Завантажує 16-бітний лінійний RAW (Float32Array RGBA) напряму у WebGL2 RGBA16F HDR текстуру.
   */
  loadRawFloat(floatData, width, height) {
    this.isRawMode = true;
    this.sourceImg = null;
    this.previewImgCanvas = null;
    this.previewRawData = { floatData, width, height };
    this._uploadRawFloatTexture(floatData, width, height);
    this.clearAllBrushMasks();
  }

  _uploadRawFloatTexture(floatData, w, h) {
    const gl = this.gl;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.getError(); // clear previous error state
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, floatData);
    if (gl.getError() !== gl.NO_ERROR) {
      // Резервний шлях для старих GPU без RGBA16F: конвертуємо у 8-біт sRGB з фільмік-ролофом
      this.isRawMode = false;
      const u8 = new Uint8Array(w * h * 4);
      for (let i = 0; i < u8.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) {
          let x = Math.max(0, floatData[i + ch]);
          if (x > 0.82) x = 0.82 + (x - 0.82) / (1 + (x - 0.82) * 1.15);
          x = Math.min(1, x);
          const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
          u8[i + ch] = Math.max(0, Math.min(255, Math.round(s * 255)));
        }
        u8[i + 3] = 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, u8);
    }
  }

  getMaxExportSize() {
    return Math.min(4096, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096);
  }

  _uploadSourceTexture(sourceCanvasOrImg) {
    const gl = this.gl;
    const w = sourceCanvasOrImg.width || sourceCanvasOrImg.naturalWidth;
    const h = sourceCanvasOrImg.height || sourceCanvasOrImg.naturalHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvasOrImg);
  }

  clearAllBrushMasks() {
    for (const c of this.brushCanvases) {
      c.getContext("2d", { willReadFrequently: true }).clearRect(0, 0, 512, 512);
    }
    this.brushData.fill(0);
    this.uploadBrushMasks(-2);
  }

  clearBrushMask(slotIdx) {
    if (slotIdx < 0 || slotIdx >= 4) return;
    this.brushCanvases[slotIdx].getContext("2d", { willReadFrequently: true }).clearRect(0, 0, 512, 512);
    this.uploadBrushMasks(slotIdx);
  }

  removeBrushSlot(slotIdx) {
    if (slotIdx < 0 || slotIdx >= 4) return;
    this.brushCanvases.splice(slotIdx, 1);
    const fresh = document.createElement("canvas");
    fresh.width = 512;
    fresh.height = 512;
    this.brushCanvases.push(fresh);
    this.uploadBrushMasks(-1);
  }

  paintBrushStroke(slotIdx, u, v, radiusNorm = 0.08, feather = 0.6, erase = false) {
    if (slotIdx < 0 || slotIdx >= 4) return;
    const ctx = this.brushCanvases[slotIdx].getContext("2d", { willReadFrequently: true });
    const x = u * 512;
    const y = v * 512;
    const r = Math.max(4, radiusNorm * 512);
    const inner = r * (1 - Math.min(0.95, Math.max(0.05, feather)));

    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    const grad = ctx.createRadialGradient(x, y, inner, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.65)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.uploadBrushMasks(slotIdx);
  }

  uploadBrushMasks(onlyChannel = -1) {
    // Пакуємо 4 окремі альфа-маски в R, G, B, A канали однієї 512x512 текстури
    const data = this.brushData;
    if (onlyChannel >= 0 && onlyChannel < 4) {
      const src = this.brushCanvases[onlyChannel].getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 512, 512).data;
      for (let i = 0, p = 3; i < 512 * 512; i++, p += 4) {
        data[i * 4 + onlyChannel] = src[p];
      }
    } else if (onlyChannel === -1) {
      for (let ch = 0; ch < 4; ch++) {
        const src = this.brushCanvases[ch].getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 512, 512).data;
        for (let i = 0, p = 3; i < 512 * 512; i++, p += 4) {
          data[i * 4 + ch] = src[p];
        }
      }
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.brushTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  _uploadCurveLut(curveOffsets) {
    // 5 точок на x = 0, 0.25, 0.5, 0.75, 1.0 -> кубічна/лінійна плавна інтерполяція Catmull-Rom
    const ys = [0, 0.25, 0.5, 0.75, 1.0].map((base, i) =>
      Math.max(0, Math.min(1, base + (curveOffsets[i] || 0) / 140))
    );
    const lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const tAll = (i / 255) * 4;
      const seg = Math.min(3, Math.floor(tAll));
      const t = tAll - seg;
      const p0 = ys[Math.max(0, seg - 1)];
      const p1 = ys[seg];
      const p2 = ys[Math.min(4, seg + 1)];
      const p3 = ys[Math.min(4, seg + 2)];
      // Catmull-Rom
      const v = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
      );
      const byte = Math.max(0, Math.min(255, Math.round(v * 255)));
      lut[i * 4] = byte;
      lut[i * 4 + 1] = byte;
      lut[i * 4 + 2] = byte;
      lut[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
  }

  render(edits, masks = [], options = {}) {
    if (!this.previewImgCanvas && !this.previewRawData) return;
    const gl = this.gl;
    const prog = this.program;
    gl.useProgram(prog);

    this._uploadCurveLut(edits.curve || [0, 0, 0, 0, 0]);

    const u = (name) => gl.getUniformLocation(prog, name);
    gl.uniform1i(u("u_image"), 0);
    gl.uniform1i(u("u_curveLut"), 1);
    gl.uniform1i(u("u_brushTex"), 2);
    gl.uniform2f(u("u_texelSize"), 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1f(u("u_aspect"), this.canvas.width / Math.max(1, this.canvas.height));

    gl.uniform1f(u("u_exposure"), edits.exposure);
    gl.uniform1f(u("u_contrast"), edits.contrast / 100);
    gl.uniform1f(u("u_highlights"), edits.highlights / 100);
    gl.uniform1f(u("u_shadows"), edits.shadows / 100);
    gl.uniform1f(u("u_whites"), edits.whites / 100);
    gl.uniform1f(u("u_blacks"), edits.blacks / 100);
    gl.uniform1f(u("u_temp"), edits.temp / 100);
    gl.uniform1f(u("u_tint"), edits.tint / 100);
    gl.uniform1f(u("u_vibrance"), edits.vibrance / 100);
    gl.uniform1f(u("u_saturation"), edits.saturation / 100);

    gl.uniform1fv(u("u_hslH"), edits.hslH.map((v) => v / 100));
    gl.uniform1fv(u("u_hslS"), edits.hslS.map((v) => v / 100));
    gl.uniform1fv(u("u_hslL"), edits.hslL.map((v) => v / 100));

    gl.uniform1f(u("u_shadowHue"), edits.shadowHue);
    gl.uniform1f(u("u_shadowSat"), edits.shadowSat / 100);
    gl.uniform1f(u("u_highHue"), edits.highHue);
    gl.uniform1f(u("u_highSat"), edits.highSat / 100);

    gl.uniform1f(u("u_clarity"), edits.clarity / 100);
    gl.uniform1f(u("u_sharpen"), edits.sharpen / 100);
    gl.uniform1f(u("u_vignette"), edits.vignette / 100);
    gl.uniform1f(u("u_grain"), edits.grain / 100);
    gl.uniform1f(u("u_fade"), edits.fade / 100);
    gl.uniform1i(u("u_showOriginal"), options.showOriginal ? 1 : 0);
    gl.uniform1i(u("u_isRawLinear"), this.isRawMode ? 1 : 0);
    gl.uniform1i(u("u_showClipping"), options.showClipping ? 1 : 0);

    // Пакуємо до 4 масок
    const types = [0, 0, 0, 0];
    const inverts = [0, 0, 0, 0];
    const geoms = new Float32Array(16);
    const feathers = [0.4, 0.4, 0.4, 0.4];
    const lights = new Float32Array(16);
    const colors = new Float32Array(12);

    const activeCount = Math.min(4, masks.length);
    for (let i = 0; i < activeCount; i++) {
      const m = masks[i];
      types[i] = !m.enabled ? 0 : m.type === "linear" ? 1 : m.type === "radial" ? 2 : 3;
      inverts[i] = m.invert ? 1 : 0;
      if (m.type === "linear") {
        geoms[i * 4 + 0] = m.x1;
        geoms[i * 4 + 1] = m.y1;
        geoms[i * 4 + 2] = m.x2;
        geoms[i * 4 + 3] = m.y2;
      } else {
        geoms[i * 4 + 0] = m.cx;
        geoms[i * 4 + 1] = m.cy;
        geoms[i * 4 + 2] = m.rx;
        geoms[i * 4 + 3] = m.ry;
      }
      feathers[i] = m.feather;
      lights[i * 4 + 0] = m.exposure;
      lights[i * 4 + 1] = m.contrast / 100;
      lights[i * 4 + 2] = m.highlights / 100;
      lights[i * 4 + 3] = m.shadows / 100;
      colors[i * 3 + 0] = m.temp / 100;
      colors[i * 3 + 1] = m.saturation / 100;
      colors[i * 3 + 2] = m.clarity / 100;
    }

    gl.uniform1i(u("u_maskCount"), activeCount);
    gl.uniform1iv(u("u_maskType"), types);
    gl.uniform1iv(u("u_maskInvert"), inverts);
    gl.uniform4fv(u("u_maskGeom"), geoms);
    gl.uniform1fv(u("u_maskFeather"), feathers);
    gl.uniform4fv(u("u_maskLight"), lights);
    gl.uniform3fv(u("u_maskColor"), colors);
    gl.uniform1i(u("u_overlayMaskIdx"), options.overlayMaskIdx ?? -1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Повнорозмірний експорт у JPEG із застосуванням кропу, вирівнювання горизонту,
   * повороту на 90° і віддзеркалення. Потім миттєво повертає прев'ю-текстуру.
   */
  exportFullResDataUrl(edits, masks, quality = 0.93) {
    if (!this.sourceImg) return null;
    const maxTex = this.getMaxExportSize();
    let w = this.sourceImg.naturalWidth || this.sourceImg.width;
    let h = this.sourceImg.naturalHeight || this.sourceImg.height;
    if (w > maxTex || h > maxTex) {
      const r = Math.min(maxTex / w, maxTex / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }

    const fullSrc = document.createElement("canvas");
    fullSrc.width = w;
    fullSrc.height = h;
    fullSrc.getContext("2d").drawImage(this.sourceImg, 0, 0, w, h);

    this._uploadSourceTexture(fullSrc);
    this.render(edits, masks, { showOriginal: false, overlayMaskIdx: -1, showClipping: false });

    const out = this._applyGeometryCrop(this.canvas, edits);
    const dataUrl = out.toDataURL("image/jpeg", quality);

    // Повертаємо прев'ю-текстуру назад
    this._uploadSourceTexture(this.previewImgCanvas);
    this.render(edits, masks, { showOriginal: false, overlayMaskIdx: -1, showClipping: false });
    return dataUrl;
  }

  /**
   * Повнорозмірний експорт 16-бітного RAW (Float32Array RGBA) у JPEG.
   */
  exportRawFloatDataUrl(floatData, width, height, edits, masks, quality = 0.95) {
    this._uploadRawFloatTexture(floatData, width, height);
    this.render(edits, masks, { showOriginal: false, overlayMaskIdx: -1, showClipping: false });

    const out = this._applyGeometryCrop(this.canvas, edits);
    const dataUrl = out.toDataURL("image/jpeg", quality);

    // Повертаємо 16-бітну прев'ю-текстуру назад
    if (this.previewRawData) {
      this._uploadRawFloatTexture(this.previewRawData.floatData, this.previewRawData.width, this.previewRawData.height);
      this.render(edits, masks, { showOriginal: false, overlayMaskIdx: -1, showClipping: false });
    }
    return dataUrl;
  }

  _applyGeometryCrop(srcCanvas, edits) {
    const rot90 = ((edits.rotate90 || 0) % 4 + 4) % 4;
    const swapped = rot90 === 1 || rot90 === 3;
    const baseW = swapped ? srcCanvas.height : srcCanvas.width;
    const baseH = swapped ? srcCanvas.width : srcCanvas.height;

    const aspectMap = {
      "4:5": 4 / 5,
      "1:1": 1,
      "3:2": 3 / 2,
      "16:9": 16 / 9,
      "9:16": 9 / 16,
    };
    let outW = baseW;
    let outH = baseH;
    const targetAr = aspectMap[edits.aspect];
    if (targetAr) {
      const curAr = baseW / baseH;
      if (curAr > targetAr) {
        outW = Math.round(baseH * targetAr);
      } else {
        outH = Math.round(baseW / targetAr);
      }
    }

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    ctx.translate(outW / 2, outH / 2);

    // Автозум при вирівнюванні горизонту, щоб не лишалось чорних кутів
    const rad = ((edits.straighten || 0) * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(rad));
    const sinA = Math.abs(Math.sin(rad));
    const scaleBoost = Math.max(
      (outW * cosA + outH * sinA) / baseW,
      (outW * sinA + outH * cosA) / baseH,
      1.0
    );
    ctx.scale(edits.flipH ? -scaleBoost : scaleBoost, scaleBoost);
    ctx.rotate(rad + rot90 * (Math.PI / 2));
    ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
    return out;
  }
}

/**
 * Малює живу RGB-гістограму на маленькому canvas за ~0.3 мс.
 */
export function drawHistogram(sourceCanvas, histCanvas) {
  if (!sourceCanvas || !histCanvas || !sourceCanvas.width) return;
  const sample = document.createElement("canvas");
  sample.width = 96;
  sample.height = 96;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(sourceCanvas, 0, 0, 96, 96);
  const px = sctx.getImageData(0, 0, 96, 96).data;

  const rB = new Uint32Array(64);
  const gB = new Uint32Array(64);
  const bB = new Uint32Array(64);
  for (let i = 0; i < px.length; i += 4) {
    rB[px[i] >> 2]++;
    gB[px[i + 1] >> 2]++;
    bB[px[i + 2] >> 2]++;
  }
  let maxV = 1;
  for (let i = 2; i < 62; i++) {
    if (rB[i] > maxV) maxV = rB[i];
    if (gB[i] > maxV) maxV = gB[i];
    if (bB[i] > maxV) maxV = bB[i];
  }

  const ctx = histCanvas.getContext("2d");
  const W = histCanvas.width;
  const H = histCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(7, 9, 20, 0.72)";
  ctx.fillRect(0, 0, W, H);

  const drawChan = (bins, col) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < 64; i++) {
      const x = (i / 63) * W;
      const y = H - Math.min(1, bins[i] / maxV) * (H - 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  ctx.globalCompositeOperation = "screen";
  drawChan(rB, "rgba(239, 68, 68, 0.65)");
  drawChan(gB, "rgba(34, 197, 94, 0.65)");
  drawChan(bB, "rgba(56, 189, 248, 0.75)");
  ctx.globalCompositeOperation = "source-over";
}
