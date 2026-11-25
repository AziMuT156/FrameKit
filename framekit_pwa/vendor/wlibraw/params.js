import { WLibRawError } from './api.js';
import { OutputColor } from './types.js';
/** Byte offsets into wlibraw_params_t as declared in
 *  native/bindings/api-exports.c. Ten int32s, one float, float[4], an
 *  int32 flag, then double[2] (8-byte aligned). */
const OFF = {
    halfSize: 0,
    outputBps: 4,
    outputColor: 8,
    userQual: 12,
    useCameraWb: 16,
    useAutoWb: 20,
    noAutoBright: 24,
    highlight: 28,
    userFlip: 32,
    fourColorRgb: 36,
    bright: 40,
    userMul: 44,
    setGamma: 60,
    gamm: 64,
};
export const PARAMS_SIZE = 80;
const bool = (v, fallback = 0) => (v === undefined ? fallback : v ? 1 : 0);
/** The `[power, toeSlope]` curve to apply, in dcraw_emu `-g` terms, or
 *  undefined to keep LibRaw's default (BT.709: 1/0.45, 4.5). */
function gammaCurve(options) {
    if (options.linear && options.gamma !== undefined) {
        throw new WLibRawError(-1, 'decode(): pass either linear or gamma, not both');
    }
    if (options.linear)
        return [1, 1];
    if (options.gamma === undefined)
        return undefined;
    const [power, toeSlope] = options.gamma;
    if (!(Number.isFinite(power) && power > 0 && Number.isFinite(toeSlope) && toeSlope >= 0)) {
        throw new WLibRawError(-1, `decode(): gamma must be [power > 0, toeSlope >= 0], got ${JSON.stringify(options.gamma)}`);
    }
    return [power, toeSlope];
}
export function writeParams(module, options) {
    const gamma = gammaCurve(options);
    const ptr = module._malloc(PARAMS_SIZE);
    const view = new DataView(module.HEAPU8.buffer, ptr, PARAMS_SIZE);
    // Defaults mirror LibRaw's own, so `{}` behaves like dcraw_emu with no flags.
    view.setInt32(OFF.halfSize, bool(options.halfSize), true);
    view.setInt32(OFF.outputBps, options.outputBps ?? 8, true);
    view.setInt32(OFF.outputColor, options.outputColor ?? OutputColor.SRGB, true);
    view.setInt32(OFF.userQual, options.userQual ?? 3, true);
    view.setInt32(OFF.useCameraWb, bool(options.useCameraWb), true);
    view.setInt32(OFF.useAutoWb, bool(options.useAutoWb), true);
    view.setInt32(OFF.noAutoBright, bool(options.noAutoBright), true);
    view.setInt32(OFF.highlight, options.highlightMode ?? 0, true);
    view.setInt32(OFF.userFlip, options.userFlip ?? -1, true);
    view.setInt32(OFF.fourColorRgb, bool(options.fourColorRgb), true);
    view.setFloat32(OFF.bright, options.brightness ?? 1.0, true);
    const mul = options.userWb ?? [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
        view.setFloat32(OFF.userMul + i * 4, mul[i] ?? 0, true);
    }
    // LibRaw stores the curve's exponent, the reciprocal of dcraw_emu's -g power.
    view.setInt32(OFF.setGamma, gamma ? 1 : 0, true);
    view.setFloat64(OFF.gamm, gamma ? 1 / gamma[0] : 0, true);
    view.setFloat64(OFF.gamm + 8, gamma ? gamma[1] : 0, true);
    return ptr;
}
//# sourceMappingURL=params.js.map