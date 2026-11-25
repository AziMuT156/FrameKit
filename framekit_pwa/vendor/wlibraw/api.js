/** LibRaw treats codes below this threshold as unrecoverable;
 *  see LIBRAW_FATAL_ERROR in libraw_const.h. */
const FATAL_THRESHOLD = -100000;
/** wlibraw's own code for a failure LibRaw never reported — the module
 *  aborted rather than returning an error. Not a LibRaw enum value; see
 *  the comment above its use in file.ts. */
export const NATIVE_ABORT_CODE = -100099;
export class WLibRawError extends Error {
    code;
    fatal;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'WLibRawError';
        this.code = code;
        this.fatal = code < FATAL_THRESHOLD;
    }
}
export function createBindings(module) {
    const num = (name, args) => module.cwrap(name, 'number', args);
    const str = (name, args) => module.cwrap(name, 'string', args);
    const nil = (name, args) => module.cwrap(name, null, args);
    return {
        version: str('libraw_version', []),
        strerror: str('libraw_strerror', ['number']),
        init: num('libraw_init', ['number']),
        openBuffer: num('libraw_open_buffer', ['number', 'number', 'number']),
        unpack: num('libraw_unpack', ['number']),
        dcrawProcess: num('libraw_dcraw_process', ['number']),
        makeMemImage: num('libraw_dcraw_make_mem_image', ['number', 'number']),
        makeMemThumb: num('libraw_dcraw_make_mem_thumb', ['number', 'number']),
        unpackThumb: num('libraw_unpack_thumb', ['number']),
        clearMem: nil('libraw_dcraw_clear_mem', ['number']),
        close: nil('libraw_close', ['number']),
        metadataJson: str('wlibraw_metadata_json', ['number']),
        applyParams: nil('wlibraw_apply_params', ['number', 'number']),
        paramsSize: num('wlibraw_params_size', []),
        imageType: num('wlibraw_image_type', ['number']),
        imageWidth: num('wlibraw_image_width', ['number']),
        imageHeight: num('wlibraw_image_height', ['number']),
        imageColors: num('wlibraw_image_colors', ['number']),
        imageBits: num('wlibraw_image_bits', ['number']),
        imageDataSize: num('wlibraw_image_data_size', ['number']),
        imageData: num('wlibraw_image_data', ['number']),
        outputProfile: num('wlibraw_output_profile', ['number', 'number']),
    };
}
/** LibRaw returns 0 for success, positive errno values, and negative
 *  LibRaw-specific codes. Anything non-zero is thrown. */
export function check(bindings, code, context) {
    if (code === 0)
        return;
    throw new WLibRawError(code, `${context}: ${bindings.strerror(code)} (${code})`);
}
//# sourceMappingURL=api.js.map