/**
 * The encoding of docs/sicherheitsdesign.md (F-04): every part as a 4-byte big-endian length and its
 * bytes, so a sequence of parts is unambiguous and no part can run into the next. Strings are UTF-8
 * in NFC, numbers 8 bytes big-endian, IDs their raw bytes.
 */

export type Part = Uint8Array | string | number;

const utf8 = new TextEncoder();

const partBytes = (part: Part): Uint8Array => {
  if (part instanceof Uint8Array) return part;
  if (typeof part === "string") {
    // A lone surrogate is not text; TextEncoder would turn it into U+FFFD and two parts alike
    if (!part.isWellFormed()) throw new RangeError("not well-formed text");
    return utf8.encode(part.normalize("NFC"));
  }
  if (!Number.isSafeInteger(part) || part < 0) throw new RangeError(`not a counter: ${part}`);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(part));
  return bytes;
};

/** enc(t₁, …, tₙ) */
export const encode = (...parts: Part[]): Uint8Array => {
  const bytes = parts.map(partBytes);
  const out = new Uint8Array(bytes.reduce((sum, part) => sum + 4 + part.length, 0));
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of bytes) {
    view.setUint32(offset, part.length);
    out.set(part, offset + 4);
    offset += 4 + part.length;
  }
  return out;
};
