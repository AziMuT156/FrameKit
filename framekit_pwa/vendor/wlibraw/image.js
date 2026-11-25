import './dispose.js';
import { WLibRawError } from './api.js';
export class WLibRawImage {
    #module;
    #bindings;
    #ptr;
    #freed = false;
    width;
    height;
    colors;
    bits;
    dataSize;
    /** ICC profile of the output colour space, exactly as LibRaw embeds it in
     *  a dcraw_emu `-T` TIFF: matrix/TRC primaries for `outputColor` with the
     *  decode's gamma. null for raw output (`OutputColor.Raw`) or a camera
     *  LibRaw has no colour matrix for. */
    icc;
    constructor(module, bindings, ptr, icc = null) {
        this.icc = icc;
        this.#module = module;
        this.#bindings = bindings;
        this.#ptr = ptr;
        // Read the header eagerly: these stay valid after free(), which makes
        // dimension queries on a released image harmless rather than a crash.
        this.width = bindings.imageWidth(ptr);
        this.height = bindings.imageHeight(ptr);
        this.colors = bindings.imageColors(ptr);
        this.bits = bindings.imageBits(ptr);
        this.dataSize = bindings.imageDataSize(ptr);
    }
    toUint8Array() {
        this.#assertLive();
        const ptr = this.#bindings.imageData(this.#ptr);
        return this.#module.HEAPU8.slice(ptr, ptr + this.dataSize);
    }
    toUint16Array() {
        this.#assertLive();
        if (this.bits !== 16) {
            throw new WLibRawError(-1, `image is ${this.bits}-bit; use toUint8Array()`);
        }
        const ptr = this.#bindings.imageData(this.#ptr);
        // HEAPU16 is indexed in 16-bit units, so halve the byte pointer.
        return this.#module.HEAPU16.slice(ptr >> 1, (ptr + this.dataSize) >> 1);
    }
    toPixels() {
        return {
            data: this.bits === 16 ? this.toUint16Array() : this.toUint8Array(),
            width: this.width,
            height: this.height,
            colors: this.colors,
            bits: this.bits,
            icc: this.icc ? this.icc.slice() : null,
        };
    }
    /** Structurally compatible with `new ImageData(data, width, height)`. */
    toImageData() {
        this.#assertLive();
        const src = this.bits === 16 ? this.toUint16Array() : this.toUint8Array();
        const shift = this.bits === 16 ? 8 : 0;
        const stride = this.colors;
        const out = new Uint8ClampedArray(this.width * this.height * 4);
        if (stride === 1) {
            // Monochrome source (Leica M Monochrom, Phase One achromatic, LibRaw
            // document mode): there is only one channel per pixel, so replicate
            // it across R, G and B instead of reading three consecutive pixels'
            // worth of single-channel data as if they were R/G/B of one pixel.
            for (let i = 0, p = 0; p < out.length; i += stride, p += 4) {
                const v = (src[i] ?? 0) >> shift;
                out[p] = v;
                out[p + 1] = v;
                out[p + 2] = v;
                out[p + 3] = 255;
            }
            return { data: out, width: this.width, height: this.height };
        }
        for (let i = 0, p = 0; p < out.length; i += stride, p += 4) {
            out[p] = (src[i] ?? 0) >> shift;
            out[p + 1] = (src[i + 1] ?? 0) >> shift;
            out[p + 2] = (src[i + 2] ?? 0) >> shift;
            out[p + 3] = 255;
        }
        return { data: out, width: this.width, height: this.height };
    }
    free() {
        if (this.#freed)
            return;
        this.#freed = true;
        this.#bindings.clearMem(this.#ptr);
        this.#ptr = 0;
    }
    [Symbol.dispose]() {
        this.free();
    }
    #assertLive() {
        if (this.#freed)
            throw new WLibRawError(-1, 'WLibRawImage has been freed');
    }
}
//# sourceMappingURL=image.js.map