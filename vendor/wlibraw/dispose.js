/**
 * Guarded `Symbol.dispose` polyfill, imported for its side effect by
 * `file.ts` and `image.ts` before they define their classes.
 *
 * Browsers without explicit resource management have no `Symbol.dispose`,
 * so a class member keyed `[Symbol.dispose]` would be keyed `"undefined"`
 * and a caller's `using` (native or transpiled) could never find it. Filling
 * the gap with the registered symbol `Symbol.for('Symbol.dispose')` is the
 * pattern TypeScript recommends: it is the same symbol TypeScript's own
 * `using` helper falls back to, and `??=` leaves a native implementation
 * untouched.
 *
 * The library itself does not depend on this: its internal code releases
 * handles with explicit `try`/`finally`, never `using`. Only
 * `Symbol.dispose` is filled; nothing in wlibraw is async-disposable.
 */
const symbolCtor = Symbol;
symbolCtor.dispose ??= Symbol.for('Symbol.dispose');
export {};
//# sourceMappingURL=dispose.js.map