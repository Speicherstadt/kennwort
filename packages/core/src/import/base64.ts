/**
 * Base64 as KeePass writes it, in KDBX 4 times, protected values and XML key files: the standard
 * alphabet with padding, checked the way KeePassXC checks it (src/core/Tools.cpp, isBase64), so
 * `atob`'s leniency never decides what a value is.
 */
const BASE64 = /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{3}=|[a-z0-9+/]{2}==)?$/i;

/** The bytes, or `undefined` for text that is no such Base64 */
export const fromBase64 = (text: string): Uint8Array | undefined =>
  BASE64.test(text) ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) : undefined;
