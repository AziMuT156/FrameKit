import './dispose.js';
import { check, NATIVE_ABORT_CODE, WLibRawError } from './api.js';
import { WLibRawImage } from './image.js';
import { writeParams } from './params.js';
const LIBRAW_IMAGE_JPEG = 1;
/**
 * Sentinel code for a native call that aborted instead of returning: the
 * wasm build has C++ exceptions disabled, so an internal LibRaw throw
 * (e.g. unpacking a truncated file) surfaces as an uncaught
 * `Aborted(undefined)` rather than a LibRaw error code. Every call that can
 * enter LibRaw's parsing/decoding pipeline is guarded via
 * `checked()`/`guarded()` below so it still throws `WLibRawError`. This
 * `.code` is a wlibraw-internal placeholder, not a real LibRaw enum value —
 * there is no LibRaw code to report because LibRaw never returned at all —
 * and `.fatal` being `true` is this sentinel's own placement below
 * `FATAL_THRESHOLD` (api.ts), not LibRaw's own classification.
 *
 * Since the native build enables `-fwasm-exceptions`, this is a fallback
 * rather than the normal failure path: LibRaw's own handlers now unwind and
 * return real codes (a truncated file gives LIBRAW_IO_ERROR, a missing
 * preview LIBRAW_NO_THUMBNAIL). Reaching this sentinel means the module
 * aborted for a reason LibRaw did not convert — out of memory, or a genuine
 * bug — so it should be rare and is worth investigating rather than ignoring.
 * Do not remove `-fwasm-exceptions` from native/settings/build.sh: doing so
 * silently routes every LibRaw failure back through here.
 */
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
/** Calls `fn`, translating a native throw into a WLibRawError, then applies
 *  `check()` to the resulting LibRaw return code. */
function checked(bindings, context, fn) {
    let code;
    try {
        code = fn();
    }
    catch (err) {
        if (err instanceof WLibRawError)
            throw err;
        throw new WLibRawError(NATIVE_ABORT_CODE, `${context}: native module aborted unexpectedly (${errorMessage(err)})`);
    }
    check(bindings, code, context);
}
/** Calls a native function for its side effects/plain return value,
 *  translating a native throw into a WLibRawError without checking the
 *  result against LibRaw's error convention (used for void bindings and
 *  the make-mem-* accessors that report failure via out-parameter). */
function guarded(context, fn) {
    try {
        return fn();
    }
    catch (err) {
        if (err instanceof WLibRawError)
            throw err;
        throw new WLibRawError(NATIVE_ABORT_CODE, `${context}: native module aborted unexpectedly (${errorMessage(err)})`);
    }
}
/**
 * A handle on one opened raw file: `WLibRawFile.open()` runs
 * `libraw_init`/`libraw_open_buffer`, after which `metadata` and
 * `thumbnail()` are cheap and repeatable, and `decode()` runs the full
 * unpack/process/make-image pipeline.
 *
 * `decode()` may be called **only once** per opened file. LibRaw's
 * `libraw_unpack` cannot run twice against the same handle (a second call
 * fails with LibRaw's own "out of order call" error), and re-running
 * `dcraw_process` over already-transformed image data is not a supported
 * or meaningful operation, so this class does not attempt to paper over
 * either. `thumbnail()` has no such restriction and composes with
 * `decode()` in either order. To decode again, re-open the buffer with
 * `WLibRawFile.open()`.
 */
export class WLibRawFile {
    #module;
    #bindings;
    #handle;
    /** The input bytes. LibRaw reads from this lazily, so it must outlive
     *  every unpack call and is freed only in close(). */
    #inputPtr;
    #metadata;
    #closed = false;
    #decoded = false;
    constructor(module, bindings, handle, inputPtr) {
        this.#module = module;
        this.#bindings = bindings;
        this.#handle = handle;
        this.#inputPtr = inputPtr;
    }
    static open(module, bindings, input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const inputPtr = module._malloc(bytes.length);
        if (inputPtr === 0) {
            throw new WLibRawError(-1, `failed to allocate ${bytes.length} bytes for input`);
        }
        module.HEAPU8.set(bytes, inputPtr);
        let handle;
        try {
            handle = guarded('libraw_init', () => bindings.init(0));
        }
        catch (err) {
            module._free(inputPtr);
            throw err;
        }
        if (handle === 0) {
            module._free(inputPtr);
            throw new WLibRawError(-1, 'libraw_init returned null');
        }
        try {
            checked(bindings, 'libraw_open_buffer', () => bindings.openBuffer(handle, inputPtr, bytes.length));
        }
        catch (err) {
            try {
                guarded('libraw_close', () => bindings.close(handle));
            }
            catch (closeErr) {
                // Best-effort cleanup after an open failure that is already in
                // flight: a second native failure here must not replace or
                // suppress `err`, which is the more informative error for the
                // caller. Still worth surfacing — silently swallowing a genuine
                // secondary failure would hide it entirely.
                console.warn('wlibraw: libraw_close failed while cleaning up after a failed open()', closeErr);
            }
            module._free(inputPtr);
            throw err;
        }
        return new WLibRawFile(module, bindings, handle, inputPtr);
    }
    get metadata() {
        this.#assertOpen();
        this.#metadata ??= JSON.parse(this.#bindings.metadataJson(this.#handle));
        return this.#metadata;
    }
    thumbnail() {
        this.#assertOpen();
        checked(this.#bindings, 'libraw_unpack_thumb', () => this.#bindings.unpackThumb(this.#handle));
        const errPtr = this.#module._malloc(4);
        new DataView(this.#module.HEAPU8.buffer).setInt32(errPtr, 0, true);
        try {
            const imgPtr = guarded('libraw_dcraw_make_mem_thumb', () => this.#bindings.makeMemThumb(this.#handle, errPtr));
            // LibRaw's own contract (mem_image.cpp): *errcode is written only on
            // the failure path (NULL return) — a successful call never touches
            // it. So imgPtr === 0 is the authoritative failure signal; errPtr is
            // only meaningful once that is true. Reading errPtr unconditionally
            // (as an earlier draft of this method did) treats whatever bytes
            // happen to be at that heap address on success as an error code,
            // which fails intermittently depending on what previously occupied
            // that memory. Confirmed by reading LibRaw's own reference sample
            // (samples/mem_image_sample.cpp), which only inspects the out-param
            // in the `if (!image)` branch.
            if (imgPtr === 0) {
                const code = new DataView(this.#module.HEAPU8.buffer).getInt32(errPtr, true);
                throw new WLibRawError(code, `libraw_dcraw_make_mem_thumb: ${this.#bindings.strerror(code)} (${code})`);
            }
            try {
                const size = this.#bindings.imageDataSize(imgPtr);
                const dataPtr = this.#bindings.imageData(imgPtr);
                return {
                    data: this.#module.HEAPU8.slice(dataPtr, dataPtr + size),
                    mime: this.#bindings.imageType(imgPtr) === LIBRAW_IMAGE_JPEG
                        ? 'image/jpeg'
                        : 'application/octet-stream',
                    width: this.#bindings.imageWidth(imgPtr),
                    height: this.#bindings.imageHeight(imgPtr),
                };
            }
            finally {
                this.#bindings.clearMem(imgPtr);
            }
        }
        finally {
            this.#module._free(errPtr);
        }
    }
    decode(options = {}) {
        this.#assertOpen();
        if (this.#decoded) {
            throw new WLibRawError(-1, 'decode() may be called once per opened file; re-open the buffer to decode again ' +
                '(libraw_unpack cannot run twice against the same handle)');
        }
        // Before #decoded is set: an invalid option throws without using up the decode.
        const paramsPtr = writeParams(this.#module, options);
        this.#decoded = true;
        try {
            this.#bindings.applyParams(this.#handle, paramsPtr);
        }
        finally {
            this.#module._free(paramsPtr);
        }
        checked(this.#bindings, 'libraw_unpack', () => this.#bindings.unpack(this.#handle));
        checked(this.#bindings, 'libraw_dcraw_process', () => this.#bindings.dcrawProcess(this.#handle));
        const icc = this.#outputProfile();
        const errPtr = this.#module._malloc(4);
        new DataView(this.#module.HEAPU8.buffer).setInt32(errPtr, 0, true);
        try {
            const imgPtr = guarded('libraw_dcraw_make_mem_image', () => this.#bindings.makeMemImage(this.#handle, errPtr));
            // See the identical comment in thumbnail(): *errcode is only written
            // by LibRaw on the failure path, so imgPtr === 0 is what actually
            // signals failure here.
            if (imgPtr === 0) {
                const code = new DataView(this.#module.HEAPU8.buffer).getInt32(errPtr, true);
                throw new WLibRawError(code, `libraw_dcraw_make_mem_image: ${this.#bindings.strerror(code)} (${code})`);
            }
            try {
                return new WLibRawImage(this.#module, this.#bindings, imgPtr, icc);
            }
            catch (err) {
                // The WLibRawImage constructor makes several wasm calls before
                // anything in JS owns imgPtr; if any of them throws, imgPtr would
                // otherwise be stranded with no reference left to free it (up to
                // ~144MB for a full-size image). Mirror thumbnail()'s try/finally
                // shape here so a constructor failure can't leak the image.
                this.#bindings.clearMem(imgPtr);
                throw err;
            }
        }
        finally {
            this.#module._free(errPtr);
        }
    }
    close() {
        if (this.#closed)
            return;
        this.#closed = true;
        try {
            guarded('libraw_close', () => this.#bindings.close(this.#handle));
        }
        finally {
            // The input allocation must be freed even if the native close call
            // itself aborts — this runs during Symbol.dispose unwind, and a
            // leaked allocation there is strictly worse than a close() that
            // still throws after cleaning up correctly.
            this.#module._free(this.#inputPtr);
            this.#handle = 0;
            this.#inputPtr = 0;
        }
    }
    [Symbol.dispose]() {
        this.close();
    }
    /** A copy of the ICC profile LibRaw built for this decode, or null. */
    #outputProfile() {
        const sizePtr = this.#module._malloc(4);
        try {
            const ptr = guarded('wlibraw_output_profile', () => this.#bindings.outputProfile(this.#handle, sizePtr));
            const size = new DataView(this.#module.HEAPU8.buffer).getUint32(sizePtr, true);
            return ptr === 0 || size === 0 ? null : this.#module.HEAPU8.slice(ptr, ptr + size);
        }
        finally {
            this.#module._free(sizePtr);
        }
    }
    #assertOpen() {
        if (this.#closed)
            throw new WLibRawError(-1, 'WLibRawFile is closed');
    }
}
//# sourceMappingURL=file.js.map