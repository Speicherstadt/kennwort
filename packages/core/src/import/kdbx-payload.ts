/**
 * The framing of a KDBX 4 payload (K-502 Teil 3): the HMAC blocks after the header, and the inner
 * header at the start of the decrypted, unpacked payload, which names the stream that hides the
 * protected values. Sources: keepassxreboot/keepassxc, src/streams/HmacBlockStream.cpp
 * (readHashedBlock) and src/format/Kdbx4Reader.cpp (readInnerHeaderField, setInnerRandomStreamID
 * in src/format/KdbxReader.cpp).
 *
 * Every length is checked against the bytes there are; errors are values, nothing throws.
 */
import {
  constantTimeEqual,
  type KdbxInnerStream,
  kdbxBlockMac,
  type Result,
} from "@kennwort/crypto";
import { err, ok } from "../result.ts";

const MAC_LENGTH = 32;
const BLOCK_HEAD = MAC_LENGTH + 4;

/** The parts one after another in one array */
export const joinBytes = (parts: Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
};

/** What a block's HMAC covers: its index as uint64 LE, its size as int32 LE, its data */
const macInput = (index: number, sizeAndData: Uint8Array) => {
  const input = new Uint8Array(8 + sizeAndData.length);
  new DataView(input.buffer).setBigUint64(0, BigInt(index), true);
  input.set(sizeAndData, 8);
  return input;
};

/**
 * The blocks' data joined, each block's HMAC checked under its own key, up to the empty block that
 * ends them. A block cut short, a negative size or a wrong HMAC is a changed file: `bad-kdbx`.
 */
export const readHmacBlocks = (
  file: Uint8Array,
  start: number,
  hmacKey: Uint8Array,
): Result<Uint8Array, "bad-kdbx"> => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const blocks: Uint8Array[] = [];
  for (let at = start, index = 0; ; index++) {
    if (file.length - at < BLOCK_HEAD) return err("bad-kdbx");
    // Read unsigned, so a negative size is a huge one: a size past the end leaves no room for the
    // end block, and the HMAC covers the size, so either way the file is refused
    const size = view.getUint32(at + MAC_LENGTH, true);
    const mac = kdbxBlockMac(
      hmacKey,
      BigInt(index),
      macInput(index, file.subarray(at + MAC_LENGTH, at + BLOCK_HEAD + size)),
    );
    if (!constantTimeEqual(mac, file.subarray(at, at + MAC_LENGTH))) return err("bad-kdbx");
    if (size === 0) break;
    blocks.push(file.subarray(at + BLOCK_HEAD, at + BLOCK_HEAD + size));
    at += BLOCK_HEAD + size;
  }
  return ok(joinBytes(blocks));
};

export type InnerHeader = { stream: KdbxInnerStream; key: Uint8Array; xml: Uint8Array };

/** KeePass2::InnerHeaderFieldID */
const END = 0;
const STREAM_ID = 1;
const STREAM_KEY = 2;
const BINARY = 3;
/** KeePass2::ProtectedStreamAlgo; ArcFourVariant (1) KeePassXC refuses as well */
export const INNER_STREAMS: Record<number, KdbxInnerStream> = { 2: "salsa20", 3: "chacha20" };

/**
 * The inner header's stream and its key, and the XML after it. Attachments (field 3) stay out of
 * the import; their bytes take nothing from the stream in KDBX 4. Unknown fields are skipped, as
 * KeePassXC does.
 */
export const readInnerHeader = (
  payload: Uint8Array,
): Result<InnerHeader, "unsupported" | "bad-kdbx"> => {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let stream: KdbxInnerStream | undefined;
  let key: Uint8Array | undefined;
  for (let at = 0; ; ) {
    if (payload.length - at < 5) return err("bad-kdbx");
    const id = view.getUint8(at);
    const length = view.getUint32(at + 1, true);
    if (length > payload.length - at - 5) return err("bad-kdbx");
    const value = payload.subarray(at + 5, at + 5 + length);
    at += 5 + length;
    if (id === END)
      return stream && key ? ok({ stream, key, xml: payload.subarray(at) }) : err("bad-kdbx");
    if (id === STREAM_ID) {
      if (length !== 4) return err("bad-kdbx");
      stream = INNER_STREAMS[view.getUint32(at - 4, true)];
      if (!stream) return err("unsupported");
    }
    if (id === STREAM_KEY) key = value;
    if (id === BINARY && length < 1) return err("bad-kdbx");
  }
};
