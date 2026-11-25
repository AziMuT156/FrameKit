/**
 * База камер та об'єктивів для FrameKit.
 * Кожна камера має фізичний розмір матриці (мм), кроп-фактор, коло розсіювання CoC (мм) та байонет.
 * CoC розраховано за стандартом d/1500 (Zeiss): FF=0.030, APS-C=0.020, Canon APS-C=0.019, MFT=0.015, MF=0.036.
 */

export const SENSOR_PRESETS = {
  ff:   { label: "Full Frame (36×24 мм)",     w: 36.0, h: 24.0, crop: 1.0,  coc: 0.030 },
  apsc: { label: "APS-C 1.5× (23.5×15.6 мм)", w: 23.5, h: 15.6, crop: 1.53, coc: 0.020 },
  apsc_c: { label: "APS-C Canon 1.6× (22.3×14.9 мм)", w: 22.3, h: 14.9, crop: 1.61, coc: 0.019 },
  mft:  { label: "Micro 4/3 2.0× (17.3×13 мм)", w: 17.3, h: 13.0, crop: 2.0,  coc: 0.015 },
  mf:   { label: "Medium Format (43.8×32.9 мм)", w: 43.8, h: 32.9, crop: 0.79, coc: 0.036 },
  inch1:{ label: "1-inch 2.7× (13.2×8.8 мм)", w: 13.2, h: 8.8,  crop: 2.73, coc: 0.011 },
};

export const CAMERA_BRANDS = [
  {
    id: "sony",
    name: "Sony",
    models: [
      { id: "sony_a7iii",   name: "Alpha A7 III",      sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7iv",    name: "Alpha A7 IV",       sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7c",     name: "Alpha A7C",         sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7cii",   name: "Alpha A7C II",      sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7cr",    name: "Alpha A7CR",        sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7riii",  name: "Alpha A7R III",     sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7riv",   name: "Alpha A7R IV",      sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7rv",    name: "Alpha A7R V",       sensor: "ff",   mount: "sony_e" },
      { id: "sony_a7siii",  name: "Alpha A7S III",     sensor: "ff",   mount: "sony_e" },
      { id: "sony_a9iii",   name: "Alpha A9 III",      sensor: "ff",   mount: "sony_e" },
      { id: "sony_a1",      name: "Alpha A1",          sensor: "ff",   mount: "sony_e" },
      { id: "sony_fx3",     name: "FX3 / ZV-E1",       sensor: "ff",   mount: "sony_e" },
      { id: "sony_a6000",   name: "Alpha A6000",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6100",   name: "Alpha A6100",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6300",   name: "Alpha A6300",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6400",   name: "Alpha A6400",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6500",   name: "Alpha A6500",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6600",   name: "Alpha A6600",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_a6700",   name: "Alpha A6700",       sensor: "apsc", mount: "sony_e" },
      { id: "sony_zve10",   name: "ZV-E10 / ZV-E10 II",sensor: "apsc", mount: "sony_e" },
      { id: "sony_fx30",    name: "FX30",              sensor: "apsc", mount: "sony_e" },
    ],
  },
  {
    id: "canon",
    name: "Canon",
    models: [
      { id: "canon_r",      name: "EOS R",             sensor: "ff",     mount: "canon_rf" },
      { id: "canon_rp",     name: "EOS RP",            sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r8",     name: "EOS R8",            sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r6",     name: "EOS R6",            sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r6ii",   name: "EOS R6 Mark II",    sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r5",     name: "EOS R5",            sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r5ii",   name: "EOS R5 Mark II",    sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r3",     name: "EOS R3",            sensor: "ff",     mount: "canon_rf" },
      { id: "canon_r7",     name: "EOS R7",            sensor: "apsc_c", mount: "canon_rf" },
      { id: "canon_r10",    name: "EOS R10",           sensor: "apsc_c", mount: "canon_rf" },
      { id: "canon_r50",    name: "EOS R50",           sensor: "apsc_c", mount: "canon_rf" },
      { id: "canon_r100",   name: "EOS R100",          sensor: "apsc_c", mount: "canon_rf" },
      { id: "canon_5diii",  name: "EOS 5D Mark III",   sensor: "ff",     mount: "canon_ef" },
      { id: "canon_5div",   name: "EOS 5D Mark IV",    sensor: "ff",     mount: "canon_ef" },
      { id: "canon_6d",     name: "EOS 6D / 6D Mark II", sensor: "ff",   mount: "canon_ef" },
      { id: "canon_80d",    name: "EOS 80D / 90D",     sensor: "apsc_c", mount: "canon_ef" },
      { id: "canon_250d",   name: "EOS 250D / 200D / 2000D", sensor: "apsc_c", mount: "canon_ef" },
      { id: "canon_m50",    name: "EOS M50 / M50 Mark II", sensor: "apsc_c", mount: "canon_efm" },
    ],
  },
  {
    id: "nikon",
    name: "Nikon",
    models: [
      { id: "nikon_z5",     name: "Z5",                sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z6",     name: "Z6 / Z6 II",        sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z6iii",  name: "Z6 III",            sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z7ii",   name: "Z7 / Z7 II",        sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z8",     name: "Z8",                sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z9",     name: "Z9",                sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_zf",     name: "Zf",                sensor: "ff",   mount: "nikon_z" },
      { id: "nikon_z30",    name: "Z30",               sensor: "apsc", mount: "nikon_z" },
      { id: "nikon_z50",    name: "Z50 / Z50 II",      sensor: "apsc", mount: "nikon_z" },
      { id: "nikon_zfc",    name: "Zfc",               sensor: "apsc", mount: "nikon_z" },
      { id: "nikon_d750",   name: "D750 / D780",       sensor: "ff",   mount: "nikon_f" },
      { id: "nikon_d850",   name: "D850",              sensor: "ff",   mount: "nikon_f" },
      { id: "nikon_d7500",  name: "D7500 / D5600 / D3500", sensor: "apsc", mount: "nikon_f" },
    ],
  },
  {
    id: "fujifilm",
    name: "Fujifilm",
    models: [
      { id: "fuji_xt3",     name: "X-T3",              sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xt4",     name: "X-T4",              sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xt5",     name: "X-T5",              sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xt30ii",  name: "X-T30 II / X-T50",  sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xs10",    name: "X-S10 / X-S20",     sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xh2",     name: "X-H2 / X-H2S",      sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_xpro3",   name: "X-Pro3 / X-E4 / X-M5", sensor: "apsc", mount: "fuji_x" },
      { id: "fuji_x100vi",  name: "X100V / X100VI (вбуд. 23mm f/2)", sensor: "apsc", mount: "fixed",
        fixedLens: { id: "fixed_x100", name: "Fujinon 23mm f/2 (вбудований)", minFocal: 23, maxFocal: 23, maxAperture: 2.0, minAperture: 16 } },
      { id: "fuji_gfx50s2", name: "GFX 50S II / 100S / 100S II", sensor: "mf", mount: "fuji_gfx" },
    ],
  },
  {
    id: "panasonic",
    name: "Panasonic Lumix",
    models: [
      { id: "lumix_s5",     name: "Lumix S5",          sensor: "ff",  mount: "l_mount" },
      { id: "lumix_s5ii",   name: "Lumix S5 II / S5 IIX", sensor: "ff", mount: "l_mount" },
      { id: "lumix_s9",     name: "Lumix S9",          sensor: "ff",  mount: "l_mount" },
      { id: "lumix_gh5",    name: "Lumix GH5 / GH5 II",sensor: "mft", mount: "mft" },
      { id: "lumix_gh6",    name: "Lumix GH6 / GH7",   sensor: "mft", mount: "mft" },
      { id: "lumix_g9",     name: "Lumix G9 / G9 II",  sensor: "mft", mount: "mft" },
      { id: "lumix_g85",    name: "Lumix G85 / GX85",  sensor: "mft", mount: "mft" },
    ],
  },
  {
    id: "olympus",
    name: "OM System / Olympus",
    models: [
      { id: "om_1",         name: "OM-1 / OM-1 Mark II", sensor: "mft", mount: "mft" },
      { id: "om_5",         name: "OM-5 / E-M5 Mark III", sensor: "mft", mount: "mft" },
      { id: "om_em10iv",    name: "E-M10 Mark IV / PEN E-P7", sensor: "mft", mount: "mft" },
    ],
  },
  {
    id: "ricoh_leica",
    name: "Ricoh / Leica",
    models: [
      { id: "ricoh_gr3",    name: "Ricoh GR III (18.3mm f/2.8)", sensor: "apsc", mount: "fixed",
        fixedLens: { id: "fixed_gr3", name: "GR 18.3mm f/2.8 (екв. 28мм)", minFocal: 18.3, maxFocal: 18.3, maxAperture: 2.8, minAperture: 16 } },
      { id: "ricoh_gr3x",   name: "Ricoh GR IIIx (26.1mm f/2.8)", sensor: "apsc", mount: "fixed",
        fixedLens: { id: "fixed_gr3x", name: "GR 26.1mm f/2.8 (екв. 40мм)", minFocal: 26.1, maxFocal: 26.1, maxAperture: 2.8, minAperture: 16 } },
      { id: "leica_q3",     name: "Leica Q2 / Q3 (28mm f/1.7)", sensor: "ff", mount: "fixed",
        fixedLens: { id: "fixed_q3", name: "Summilux 28mm f/1.7 ASPH", minFocal: 28, maxFocal: 28, maxAperture: 1.7, minAperture: 16 } },
      { id: "leica_m11",    name: "Leica M10 / M11",   sensor: "ff", mount: "leica_m" },
      { id: "leica_sl2",    name: "Leica SL2 / SL3",   sensor: "ff", mount: "l_mount" },
    ],
  },
  {
    id: "custom",
    name: "Інша камера / За розміром матриці",
    models: [
      { id: "custom_ff",    name: "Будь-яка Full Frame (36×24 мм)",        sensor: "ff",     mount: "universal" },
      { id: "custom_apsc",  name: "Будь-яка APS-C 1.5× (Sony/Nikon/Fuji)", sensor: "apsc",   mount: "universal" },
      { id: "custom_apscc", name: "Будь-яка APS-C 1.6× (Canon)",           sensor: "apsc_c", mount: "universal" },
      { id: "custom_mft",   name: "Будь-яка Micro 4/3 (2.0×)",             sensor: "mft",    mount: "mft" },
      { id: "custom_mf",    name: "Будь-який Середній формат (44×33 мм)",  sensor: "mf",     mount: "fuji_gfx" },
      { id: "custom_1in",   name: "Компакт 1-inch (RX100 / G7X)",          sensor: "inch1",  mount: "universal" },
    ],
  },
];

// База популярних об'єктивів за байонетами (рідні + Sigma / Tamron / Viltrox / Samyang)
export const LENSES_BY_MOUNT = {
  sony_e: [
    { id: "se_50_18",   name: "Sony FE 50mm f/1.8",                  minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 22 },
    { id: "se_50_14gm", name: "Sony FE 50mm f/1.4 GM",               minFocal: 50, maxFocal: 50,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_50_12gm", name: "Sony FE 50mm f/1.2 GM",               minFocal: 50, maxFocal: 50,  maxAperture: 1.2, minAperture: 16 },
    { id: "se_35_18",   name: "Sony FE 35mm f/1.8",                  minFocal: 35, maxFocal: 35,  maxAperture: 1.8, minAperture: 22 },
    { id: "se_35_14gm", name: "Sony FE 35mm f/1.4 GM",               minFocal: 35, maxFocal: 35,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_85_18",   name: "Sony FE 85mm f/1.8",                  minFocal: 85, maxFocal: 85,  maxAperture: 1.8, minAperture: 22 },
    { id: "se_85_14gm", name: "Sony FE 85mm f/1.4 GM / GM II",       minFocal: 85, maxFocal: 85,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_20_18g",  name: "Sony FE 20mm f/1.8 G",                minFocal: 20, maxFocal: 20,  maxAperture: 1.8, minAperture: 22 },
    { id: "se_24_14gm", name: "Sony FE 24mm f/1.4 GM",               minFocal: 24, maxFocal: 24,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_2470_28", name: "Sony FE 24-70mm f/2.8 GM / GM II",    minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "se_2870_35", name: "Sony FE 28-70mm f/3.5-5.6 (Kit)",     minFocal: 28, maxFocal: 70,  maxAperture: 3.5, minAperture: 22 },
    { id: "se_70200_28",name: "Sony FE 70-200mm f/2.8 GM II",        minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 22 },
    { id: "se_1635_28", name: "Sony FE 16-35mm f/2.8 GM / f/4 PZ",   minFocal: 16, maxFocal: 35,  maxAperture: 2.8, minAperture: 22 },
    { id: "se_tam2875", name: "Tamron 28-75mm f/2.8 Di III VXD G2",  minFocal: 28, maxFocal: 75,  maxAperture: 2.8, minAperture: 22 },
    { id: "se_tam35150",name: "Tamron 35-150mm f/2-2.8 Di III VXD",  minFocal: 35, maxFocal: 150, maxAperture: 2.0, minAperture: 16 },
    { id: "se_sig2470", name: "Sigma 24-70mm f/2.8 DG DN Art II",    minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "se_sig85",   name: "Sigma 85mm f/1.4 DG DN Art",          minFocal: 85, maxFocal: 85,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_sig1850", name: "Sigma 18-50mm f/2.8 DC DN (APS-C)",   minFocal: 18, maxFocal: 50,  maxAperture: 2.8, minAperture: 22 },
    { id: "se_sig16",   name: "Sigma 16mm f/1.4 DC DN (APS-C)",      minFocal: 16, maxFocal: 16,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_sig30",   name: "Sigma 30mm f/1.4 DC DN (APS-C)",      minFocal: 30, maxFocal: 30,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_sig56",   name: "Sigma 56mm f/1.4 DC DN (APS-C)",      minFocal: 56, maxFocal: 56,  maxAperture: 1.4, minAperture: 16 },
    { id: "se_vilt85",  name: "Viltrox 85mm f/1.8 / 75mm f/1.2 Pro", minFocal: 75, maxFocal: 85,  maxAperture: 1.2, minAperture: 16 },
    { id: "se_1650kit", name: "Sony E 16-50mm f/3.5-5.6 PZ (Kit)",   minFocal: 16, maxFocal: 50,  maxAperture: 3.5, minAperture: 22 },
  ],
  canon_rf: [
    { id: "rf_50_18",   name: "Canon RF 50mm f/1.8 STM",             minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 22 },
    { id: "rf_50_12l",  name: "Canon RF 50mm f/1.2L USM",            minFocal: 50, maxFocal: 50,  maxAperture: 1.2, minAperture: 16 },
    { id: "rf_35_18",   name: "Canon RF 35mm f/1.8 Macro IS STM",    minFocal: 35, maxFocal: 35,  maxAperture: 1.8, minAperture: 22 },
    { id: "rf_85_20",   name: "Canon RF 85mm f/2 Macro IS STM",      minFocal: 85, maxFocal: 85,  maxAperture: 2.0, minAperture: 29 },
    { id: "rf_85_12l",  name: "Canon RF 85mm f/1.2L USM",            minFocal: 85, maxFocal: 85,  maxAperture: 1.2, minAperture: 16 },
    { id: "rf_28_28",   name: "Canon RF 28mm f/2.8 STM (Pancake)",   minFocal: 28, maxFocal: 28,  maxAperture: 2.8, minAperture: 22 },
    { id: "rf_16_28",   name: "Canon RF 16mm f/2.8 STM",             minFocal: 16, maxFocal: 16,  maxAperture: 2.8, minAperture: 22 },
    { id: "rf_2470_28", name: "Canon RF 24-70mm f/2.8L IS USM",      minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "rf_2870_20", name: "Canon RF 28-70mm f/2L USM",           minFocal: 28, maxFocal: 70,  maxAperture: 2.0, minAperture: 22 },
    { id: "rf_24105_4", name: "Canon RF 24-105mm f/4L IS USM",       minFocal: 24, maxFocal: 105, maxAperture: 4.0, minAperture: 22 },
    { id: "rf_70200_28",name: "Canon RF 70-200mm f/2.8L IS USM",     minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 32 },
    { id: "rf_1845kit", name: "Canon RF-S 18-45mm f/4.5-6.3 (Kit)",  minFocal: 18, maxFocal: 45,  maxAperture: 4.5, minAperture: 22 },
    { id: "rf_sig1850", name: "Sigma RF-S 18-50mm f/2.8 DC DN",      minFocal: 18, maxFocal: 50,  maxAperture: 2.8, minAperture: 22 },
  ],
  canon_ef: [
    { id: "ef_50_18",   name: "Canon EF 50mm f/1.8 STM",             minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 22 },
    { id: "ef_50_14",   name: "Canon EF 50mm f/1.4 USM",             minFocal: 50, maxFocal: 50,  maxAperture: 1.4, minAperture: 22 },
    { id: "ef_85_18",   name: "Canon EF 85mm f/1.8 USM",             minFocal: 85, maxFocal: 85,  maxAperture: 1.8, minAperture: 22 },
    { id: "ef_35_14",   name: "Canon EF 35mm f/1.4L II / Sigma Art", minFocal: 35, maxFocal: 35,  maxAperture: 1.4, minAperture: 22 },
    { id: "ef_2470_28", name: "Canon EF 24-70mm f/2.8L II USM",      minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "ef_24105_4", name: "Canon EF 24-105mm f/4L IS USM",       minFocal: 24, maxFocal: 105, maxAperture: 4.0, minAperture: 22 },
    { id: "ef_70200_28",name: "Canon EF 70-200mm f/2.8L IS II/III",  minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 32 },
    { id: "ef_1855kit", name: "Canon EF-S 18-55mm f/3.5-5.6 (Kit)",  minFocal: 18, maxFocal: 55,  maxAperture: 3.5, minAperture: 22 },
    { id: "ef_1755_28", name: "Canon EF-S 17-55mm f/2.8 / Sigma 18-35 f/1.8", minFocal: 17, maxFocal: 55, maxAperture: 1.8, minAperture: 22 },
    { id: "ef_24_28",   name: "Canon EF-S 24mm f/2.8 STM",           minFocal: 24, maxFocal: 24,  maxAperture: 2.8, minAperture: 22 },
  ],
  canon_efm: [
    { id: "efm_1545",   name: "Canon EF-M 15-45mm f/3.5-6.3 (Kit)",  minFocal: 15, maxFocal: 45,  maxAperture: 3.5, minAperture: 22 },
    { id: "efm_22_2",   name: "Canon EF-M 22mm f/2 STM",             minFocal: 22, maxFocal: 22,  maxAperture: 2.0, minAperture: 22 },
    { id: "efm_32_14",  name: "Canon EF-M 32mm f/1.4 STM",           minFocal: 32, maxFocal: 32,  maxAperture: 1.4, minAperture: 16 },
    { id: "efm_sig16",  name: "Sigma 16mm f/1.4 DC DN (EF-M)",       minFocal: 16, maxFocal: 16,  maxAperture: 1.4, minAperture: 16 },
    { id: "efm_sig30",  name: "Sigma 30mm f/1.4 DC DN (EF-M)",       minFocal: 30, maxFocal: 30,  maxAperture: 1.4, minAperture: 16 },
    { id: "efm_sig56",  name: "Sigma 56mm f/1.4 DC DN (EF-M)",       minFocal: 56, maxFocal: 56,  maxAperture: 1.4, minAperture: 16 },
  ],
  nikon_z: [
    { id: "nz_50_18",   name: "NIKKOR Z 50mm f/1.8 S",               minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 16 },
    { id: "nz_40_20",   name: "NIKKOR Z 40mm f/2",                   minFocal: 40, maxFocal: 40,  maxAperture: 2.0, minAperture: 16 },
    { id: "nz_35_18",   name: "NIKKOR Z 35mm f/1.8 S / f/1.4",       minFocal: 35, maxFocal: 35,  maxAperture: 1.4, minAperture: 16 },
    { id: "nz_85_18",   name: "NIKKOR Z 85mm f/1.8 S / f/1.2 S",     minFocal: 85, maxFocal: 85,  maxAperture: 1.2, minAperture: 16 },
    { id: "nz_28_28",   name: "NIKKOR Z 28mm f/2.8",                 minFocal: 28, maxFocal: 28,  maxAperture: 2.8, minAperture: 16 },
    { id: "nz_2470_28", name: "NIKKOR Z 24-70mm f/2.8 S / f/4 S",    minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "nz_24120_4", name: "NIKKOR Z 24-120mm f/4 S",             minFocal: 24, maxFocal: 120, maxAperture: 4.0, minAperture: 22 },
    { id: "nz_70200_28",name: "NIKKOR Z 70-200mm f/2.8 VR S",        minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 22 },
    { id: "nz_1650dx",  name: "NIKKOR Z DX 16-50mm f/3.5-6.3 VR",    minFocal: 16, maxFocal: 50,  maxAperture: 3.5, minAperture: 22 },
    { id: "nz_tam2875", name: "Tamron 28-75mm f/2.8 G2 (Z)",         minFocal: 28, maxFocal: 75,  maxAperture: 2.8, minAperture: 22 },
    { id: "nz_vilt85",  name: "Viltrox 85mm f/1.8 Z / 56mm f/1.4 DX",minFocal: 56, maxFocal: 85,  maxAperture: 1.4, minAperture: 16 },
  ],
  nikon_f: [
    { id: "nf_50_18",   name: "AF-S NIKKOR 50mm f/1.8G / f/1.4G",    minFocal: 50, maxFocal: 50,  maxAperture: 1.4, minAperture: 16 },
    { id: "nf_35_18dx", name: "AF-S DX 35mm f/1.8G",                 minFocal: 35, maxFocal: 35,  maxAperture: 1.8, minAperture: 22 },
    { id: "nf_85_18",   name: "AF-S NIKKOR 85mm f/1.8G / f/1.4G",    minFocal: 85, maxFocal: 85,  maxAperture: 1.4, minAperture: 16 },
    { id: "nf_2470_28", name: "AF-S NIKKOR 24-70mm f/2.8G / E VR",   minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "nf_70200_28",name: "AF-S NIKKOR 70-200mm f/2.8E FL ED",   minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 22 },
    { id: "nf_1855",    name: "AF-P DX 18-55mm f/3.5-5.6G VR (Kit)",minFocal: 18, maxFocal: 55,  maxAperture: 3.5, minAperture: 22 },
  ],
  fuji_x: [
    { id: "fx_1855",    name: "Fujinon XF 18-55mm f/2.8-4 R LM OIS", minFocal: 18, maxFocal: 55,  maxAperture: 2.8, minAperture: 22 },
    { id: "fx_1655",    name: "Fujinon XF 16-55mm f/2.8 R LM WR",    minFocal: 16, maxFocal: 55,  maxAperture: 2.8, minAperture: 22 },
    { id: "fx_23_14",   name: "Fujinon XF 23mm f/1.4 R LM WR / f/2", minFocal: 23, maxFocal: 23,  maxAperture: 1.4, minAperture: 16 },
    { id: "fx_27_28",   name: "Fujinon XF 27mm f/2.8 R WR (Pancake)",minFocal: 27, maxFocal: 27,  maxAperture: 2.8, minAperture: 16 },
    { id: "fx_33_14",   name: "Fujinon XF 33mm f/1.4 / 35mm f/1.4",  minFocal: 33, maxFocal: 35,  maxAperture: 1.4, minAperture: 16 },
    { id: "fx_35_20",   name: "Fujinon XF 35mm f/2 R WR",            minFocal: 35, maxFocal: 35,  maxAperture: 2.0, minAperture: 16 },
    { id: "fx_56_12",   name: "Fujinon XF 56mm f/1.2 R WR",          minFocal: 56, maxFocal: 56,  maxAperture: 1.2, minAperture: 16 },
    { id: "fx_50_20",   name: "Fujinon XF 50mm f/2 R WR",            minFocal: 50, maxFocal: 50,  maxAperture: 2.0, minAperture: 16 },
    { id: "fx_90_20",   name: "Fujinon XF 90mm f/2 R LM WR",         minFocal: 90, maxFocal: 90,  maxAperture: 2.0, minAperture: 16 },
    { id: "fx_sig1850", name: "Sigma 18-50mm f/2.8 DC DN (X)",       minFocal: 18, maxFocal: 50,  maxAperture: 2.8, minAperture: 22 },
    { id: "fx_vilt75",  name: "Viltrox 75mm f/1.2 Pro / 27mm f/1.2", minFocal: 27, maxFocal: 75,  maxAperture: 1.2, minAperture: 16 },
    { id: "fx_tam1770", name: "Tamron 17-70mm f/2.8 Di III-A VC",    minFocal: 17, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
  ],
  fuji_gfx: [
    { id: "gfx_50_35",  name: "Fujinon GF 50mm f/3.5 R LM WR",       minFocal: 50, maxFocal: 50,  maxAperture: 3.5, minAperture: 32 },
    { id: "gfx_55_17",  name: "Fujinon GF 55mm f/1.7 R WR",          minFocal: 55, maxFocal: 55,  maxAperture: 1.7, minAperture: 22 },
    { id: "gfx_80_17",  name: "Fujinon GF 80mm f/1.7 R WR",          minFocal: 80, maxFocal: 80,  maxAperture: 1.7, minAperture: 22 },
    { id: "gfx_110_2",  name: "Fujinon GF 110mm f/2 R LM WR",        minFocal: 110,maxFocal: 110, maxAperture: 2.0, minAperture: 22 },
    { id: "gfx_3264",   name: "Fujinon GF 32-64mm f/4 R LM WR",      minFocal: 32, maxFocal: 64,  maxAperture: 4.0, minAperture: 32 },
  ],
  l_mount: [
    { id: "lm_50_18",   name: "Lumix S 50mm f/1.8",                  minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 22 },
    { id: "lm_35_18",   name: "Lumix S 35mm f/1.8",                  minFocal: 35, maxFocal: 35,  maxAperture: 1.8, minAperture: 22 },
    { id: "lm_85_18",   name: "Lumix S 85mm f/1.8",                  minFocal: 85, maxFocal: 85,  maxAperture: 1.8, minAperture: 22 },
    { id: "lm_2060",    name: "Lumix S 20-60mm f/3.5-5.6 (Kit)",     minFocal: 20, maxFocal: 60,  maxAperture: 3.5, minAperture: 22 },
    { id: "lm_2470",    name: "Sigma 24-70mm f/2.8 DG DN Art II",    minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "lm_2870",    name: "Sigma 28-70mm f/2.8 DG DN Contemp.",  minFocal: 28, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
  ],
  mft: [
    { id: "mft_25_17",  name: "Lumix G 25mm f/1.7 (екв. 50мм)",      minFocal: 25, maxFocal: 25,  maxAperture: 1.7, minAperture: 22 },
    { id: "mft_20_17",  name: "Lumix G 20mm f/1.7 II (Pancake)",     minFocal: 20, maxFocal: 20,  maxAperture: 1.7, minAperture: 16 },
    { id: "mft_425_17", name: "Lumix G 42.5mm f/1.7 / Olympus 45mm f/1.8", minFocal: 42.5, maxFocal: 45, maxAperture: 1.7, minAperture: 22 },
    { id: "mft_1235",   name: "Lumix X 12-35mm f/2.8 / Oly 12-40mm f/2.8", minFocal: 12, maxFocal: 40, maxAperture: 2.8, minAperture: 22 },
    { id: "mft_15_17",  name: "Leica DG Summilux 15mm f/1.7",        minFocal: 15, maxFocal: 15,  maxAperture: 1.7, minAperture: 16 },
    { id: "mft_40150",  name: "Olympus 40-150mm f/2.8 PRO",          minFocal: 40, maxFocal: 150, maxAperture: 2.8, minAperture: 22 },
  ],
  leica_m: [
    { id: "m_35_14",    name: "Leica Summilux-M 35mm f/1.4 ASPH",    minFocal: 35, maxFocal: 35,  maxAperture: 1.4, minAperture: 16 },
    { id: "m_50_14",    name: "Leica Summilux-M 50mm f/1.4 ASPH",    minFocal: 50, maxFocal: 50,  maxAperture: 1.4, minAperture: 16 },
    { id: "m_50_20",    name: "Leica Summicron-M 50mm f/2",          minFocal: 50, maxFocal: 50,  maxAperture: 2.0, minAperture: 16 },
    { id: "m_28_20",    name: "Leica Summicron-M 28mm f/2",          minFocal: 28, maxFocal: 28,  maxAperture: 2.0, minAperture: 16 },
  ],
  universal: [
    { id: "uni_24_14",  name: "Фікс 24mm f/1.4",                     minFocal: 24, maxFocal: 24,  maxAperture: 1.4, minAperture: 22 },
    { id: "uni_35_18",  name: "Фікс 35mm f/1.8",                     minFocal: 35, maxFocal: 35,  maxAperture: 1.8, minAperture: 22 },
    { id: "uni_50_18",  name: "Фікс 50mm f/1.8",                     minFocal: 50, maxFocal: 50,  maxAperture: 1.8, minAperture: 22 },
    { id: "uni_85_18",  name: "Портретник 85mm f/1.8",               minFocal: 85, maxFocal: 85,  maxAperture: 1.8, minAperture: 22 },
    { id: "uni_2470",   name: "Зум 24-70mm f/2.8",                   minFocal: 24, maxFocal: 70,  maxAperture: 2.8, minAperture: 22 },
    { id: "uni_1855",   name: "Кіт-зум 18-55mm f/3.5-5.6",           minFocal: 18, maxFocal: 55,  maxAperture: 3.5, minAperture: 22 },
    { id: "uni_70200",  name: "Телезум 70-200mm f/2.8",              minFocal: 70, maxFocal: 200, maxAperture: 2.8, minAperture: 22 },
  ],
};

// Стандартний ряд діафрагм (1/3 стопа)
export const APERTURE_STOPS = [
  1.2, 1.4, 1.6, 1.7, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5,
  4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13, 14, 16, 18, 20, 22, 32,
];

// Стандартний ряд витримок (секунди)
export const SHUTTER_SPEEDS = [
  { label: "1/8000", sec: 1 / 8000 },
  { label: "1/4000", sec: 1 / 4000 },
  { label: "1/2000", sec: 1 / 2000 },
  { label: "1/1000", sec: 1 / 1000 },
  { label: "1/500",  sec: 1 / 500 },
  { label: "1/250",  sec: 1 / 250 },
  { label: "1/160",  sec: 1 / 160 },
  { label: "1/125",  sec: 1 / 125 },
  { label: "1/100",  sec: 1 / 100 },
  { label: "1/80",   sec: 1 / 80 },
  { label: "1/60",   sec: 1 / 60 },
  { label: "1/50",   sec: 1 / 50 },
  { label: "1/40",   sec: 1 / 40 },
  { label: "1/30",   sec: 1 / 30 },
  { label: "1/20",   sec: 1 / 20 },
  { label: "1/15",   sec: 1 / 15 },
  { label: "1/10",   sec: 1 / 10 },
  { label: "1/8",    sec: 1 / 8 },
  { label: "1/4",    sec: 1 / 4 },
  { label: "1/2",    sec: 1 / 2 },
  { label: '1"',     sec: 1 },
  { label: '2"',     sec: 2 },
  { label: '4"',     sec: 4 },
  { label: '8"',     sec: 8 },
  { label: '15"',    sec: 15 },
  { label: '30"',    sec: 30 },
];

export const ND_FILTERS = [
  { label: "Без фільтра (0 стопів)", stops: 0 },
  { label: "ND2 (0.3 / 1 стоп)",     stops: 1 },
  { label: "CPL Полярик (~1.5 стопи)", stops: 1.5 },
  { label: "ND4 (0.6 / 2 стопи)",    stops: 2 },
  { label: "ND8 (0.9 / 3 стопи)",    stops: 3 },
  { label: "ND16 (1.2 / 4 стопи)",   stops: 4 },
  { label: "ND32 (1.5 / 5 стопів)",  stops: 5 },
  { label: "ND64 (1.8 / 6 стопів)",  stops: 6 },
  { label: "ND128 (2.1 / 7 стопів)", stops: 7 },
  { label: "ND256 (2.4 / 8 стопів)", stops: 8 },
  { label: "ND500 (2.7 / 9 стопів)", stops: 9 },
  { label: "ND1000 (3.0 / 10 стопів)", stops: 10 },
  { label: "ND2000 (3.3 / 11 стопів)", stops: 11 },
  { label: "ND4000 (3.6 / 12 стопів)", stops: 12 },
  { label: "ND32000 (4.5 / 15 стопів)", stops: 15 },
  { label: "ND64000 (4.8 / 16 стопів)", stops: 16 },
];

export const ISO_VALUES = [
  50, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800,
  1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400,
  8000, 10000, 12800, 16000, 25600, 51200,
];

const MODEL_MP_MAP = {
  sony_a7iii: 24.2, sony_a7iv: 33.0, sony_a7c: 24.2, sony_a7cii: 33.0, sony_a7cr: 61.0,
  sony_a7riii: 42.4, sony_a7riv: 61.0, sony_a7rv: 61.0, sony_a7siii: 12.1, sony_a9iii: 24.6,
  sony_a1: 50.1, sony_fx3: 12.1, sony_a6000: 24.3, sony_a6100: 24.2, sony_a6300: 24.2,
  sony_a6400: 24.2, sony_a6500: 24.2, sony_a6600: 24.2, sony_a6700: 26.0, sony_zve10: 24.2, sony_fx30: 26.0,
  canon_r: 30.3, canon_rp: 26.2, canon_r8: 24.2, canon_r6: 20.1, canon_r6ii: 24.2,
  canon_r5: 45.0, canon_r5ii: 45.0, canon_r3: 24.1, canon_r7: 32.5, canon_r10: 24.2,
  canon_r50: 24.2, canon_r100: 24.1, canon_5diii: 22.3, canon_5div: 30.4, canon_6d: 26.2,
  canon_80d: 32.5, canon_250d: 24.1, canon_m50: 24.1,
  nikon_z5: 24.3, nikon_z6: 24.5, nikon_z6iii: 24.5, nikon_z7ii: 45.7, nikon_z8: 45.7,
  nikon_z9: 45.7, nikon_zf: 24.5, nikon_z30: 20.9, nikon_z50: 20.9, nikon_zfc: 20.9,
  nikon_d750: 24.3, nikon_d850: 45.7, nikon_d7500: 20.9,
  fuji_xt3: 26.1, fuji_xt4: 26.1, fuji_xt5: 40.2, fuji_xt30ii: 26.1, fuji_xs10: 26.1,
  fuji_xh2: 40.2, fuji_xpro3: 26.1, fuji_x100vi: 40.2, fuji_gfx50s2: 51.4,
  lumix_s5: 24.2, lumix_s5ii: 24.2, lumix_s9: 24.2, lumix_gh5: 20.3, lumix_gh6: 25.2,
  lumix_g9: 25.2, lumix_g85: 16.0, om_1: 20.4, om_5: 20.4, om_em10iv: 20.3,
  ricoh_gr3: 24.2, ricoh_gr3x: 24.2, leica_q3: 60.3, leica_m11: 60.3, leica_sl2: 47.3,
};

export function getModelMegapixels(modelId) {
  return MODEL_MP_MAP[modelId] ?? 24.2;
}

export function getBrandById(brandId) {
  return CAMERA_BRANDS.find((b) => b.id === brandId) || CAMERA_BRANDS[0];
}

export function getModelById(brandId, modelId) {
  const brand = getBrandById(brandId);
  return brand.models.find((m) => m.id === modelId) || brand.models[0];
}

export function getLensesForModel(model, manualLabel = "Інший об'єктив (ввести вручну)") {
  if (!model) return LENSES_BY_MOUNT.universal;
  if (model.mount === "fixed" && model.fixedLens) {
    return [model.fixedLens];
  }
  const native = LENSES_BY_MOUNT[model.mount] || LENSES_BY_MOUNT.universal;
  return [
    ...native,
    { id: "custom_manual", name: manualLabel, minFocal: 8, maxFocal: 600, maxAperture: 1.2, minAperture: 32, isManual: true },
  ];
}
