/**
 * The few CBOR items (RFC 8949) a passkey's registration needs: unsigned and negative integers,
 * byte and text strings, and maps, written in the order given. The callers give their keys in
 * CTAP2's canonical order (FIDO CTAP 2.1, §8: shorter encoding first, then bytewise), so the COSE
 * key and the attestation object come out as an authenticator writes them. Only encoding: Kennwort
 * never reads CBOR from a page or a server.
 */

export type CborValue =
  | number
  | string
  | Uint8Array
  | ReadonlyArray<readonly [CborValue, CborValue]>;

const UNSIGNED = 0;
const NEGATIVE = 1;
const BYTES = 2;
const TEXT = 3;
const MAP = 5;

const utf8 = new TextEncoder();

/** The head of an item: major type and argument, in the shortest form (RFC 8949, §3) */
const head = (major: number, argument: number): number[] => {
  if (!Number.isSafeInteger(argument) || argument > 0xffff_ffff)
    throw new RangeError("CBOR argument out of range");
  const type = major << 5;
  if (argument < 24) return [type | argument];
  if (argument < 0x100) return [type | 24, argument];
  if (argument < 0x1_0000) return [type | 25, argument >> 8, argument & 0xff];
  return [
    type | 26,
    argument >>> 24,
    (argument >> 16) & 0xff,
    (argument >> 8) & 0xff,
    argument & 0xff,
  ];
};

const items = (value: CborValue): number[] => {
  if (typeof value === "number")
    return value < 0 ? head(NEGATIVE, -1 - value) : head(UNSIGNED, value);
  if (typeof value === "string") {
    const bytes = utf8.encode(value);
    return [...head(TEXT, bytes.length), ...bytes];
  }
  if (value instanceof Uint8Array) return [...head(BYTES, value.length), ...value];
  return [
    ...head(MAP, value.length),
    ...value.flatMap(([key, item]) => [...items(key), ...items(item)]),
  ];
};

/** One CBOR item; a map is a list of key and value pairs, kept in its order */
export const cbor = (value: CborValue): Uint8Array => Uint8Array.from(items(value));
