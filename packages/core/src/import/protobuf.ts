/**
 * Just enough Protocol Buffers to read Google Authenticator's migration payload (K-503): the
 * fields of one message, flat, with varints and length-delimited values; fixed 64- and 32-bit
 * values are stepped over. Nested messages are read by calling this again on a field's bytes, so
 * there is no recursion here. Source: the wire format in protobuf.dev/programming-guides/encoding.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";

/** A field as the wire has it: a whole number (varint) or bytes (length-delimited) */
export type ProtoField =
  | { field: number; wire: "varint"; value: number }
  | { field: number; wire: "bytes"; value: Uint8Array };

/** A varint has at most ten bytes of seven bits (64 bits) */
const MAX_VARINT_BYTES = 10;
/** Wire types (encoding guide, "Message Structure") */
const VARINT = 0;
const I64 = 1;
const LEN = 2;
const I32 = 5;

type Read<T> = Result<{ value: T; next: number }, "bad-proto">;

/**
 * The varint at `at`; above 2^53 the number loses its lowest bits, which no field of the payload
 * reaches (its numbers are enums, counts and a counter)
 */
export const readVarint = (bytes: Uint8Array, at: number): Read<number> => {
  let value = 0;
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    // Past the end reads as a byte that goes on, so a varint cut short ends at the limit
    const byte = bytes[at + i] ?? 0x80;
    value += (byte & 0x7f) * 2 ** (7 * i);
    if (byte < 0x80) return ok({ value, next: at + i + 1 });
  }
  return err("bad-proto");
};

/** The bytes from `at` on, if there are that many */
const take = (bytes: Uint8Array, at: number, length: number): Read<Uint8Array> =>
  at + length > bytes.length
    ? err("bad-proto")
    : ok({ value: bytes.subarray(at, at + length), next: at + length });

/** One field from `at`: its tag, then its value */
const readField = (bytes: Uint8Array, at: number): Read<ProtoField | undefined> => {
  const tag = readVarint(bytes, at);
  if (!tag.ok) return tag;
  const field = Math.floor(tag.value.value / 8);
  const wire = tag.value.value % 8;
  const from = tag.value.next;
  if (field === 0) return err("bad-proto");
  if (wire === VARINT) {
    const value = readVarint(bytes, from);
    return value.ok
      ? ok({ value: { field, wire: "varint", value: value.value.value }, next: value.value.next })
      : value;
  }
  if (wire === LEN) {
    const length = readVarint(bytes, from);
    if (!length.ok) return length;
    const value = take(bytes, length.value.next, length.value.value);
    return value.ok
      ? ok({ value: { field, wire: "bytes", value: value.value.value }, next: value.value.next })
      : value;
  }
  // Fixed-width values: no field of the payload has one, so they are only stepped over
  if (wire === I64 || wire === I32) {
    const skipped = take(bytes, from, wire === I64 ? 8 : 4);
    return skipped.ok ? ok({ value: undefined, next: skipped.value.next }) : skipped;
  }
  // Groups (3, 4) are long deprecated and 6, 7 do not exist
  return err("bad-proto");
};

/** Every varint and length-delimited field of one message, in the order of the bytes */
export const readMessage = (bytes: Uint8Array): Result<ProtoField[], "bad-proto"> => {
  const fields: ProtoField[] = [];
  for (let at = 0; at < bytes.length; ) {
    const read = readField(bytes, at);
    if (!read.ok) return read;
    if (read.value.value) fields.push(read.value.value);
    at = read.value.next;
  }
  return ok(fields);
};
