/**
 * A small ZIP reader for the export containers (K-502 Teil 2): 1Password's 1PUX and the ZIPs of
 * Dashlane and Proton Pass. It reads the central directory and unpacks only the files asked for,
 * stored or deflated, with the platform's `DecompressionStream`; no library. Source: PKWARE's
 * APPNOTE.TXT (6.3.10), the section of each record named where it is read.
 *
 * The file comes from outside, so none of its numbers is trusted: ZIP64, archives across disks and
 * encryption are refused, every offset and length is checked against the file, and a zip bomb ends
 * at the limits (entries, bytes unpacked in all, compression ratio) before anything is inflated.
 * What comes out must have the declared size and CRC-32. Names only find a file, they are never a
 * path; still a name that climbs out (`..`, a leading `/`, `\`, a drive letter) or appears twice
 * refuses the archive, as no export a manager writes has one. Errors are values; nothing throws.
 */
import type { Result } from "@kennwort/crypto";
import { err, ok } from "../result.ts";
import type { ImportError, ImportResult } from "./types.ts";

export type ZipError = Extract<
  ImportError,
  "bad-zip" | "unsupported-zip" | "encrypted" | "too-large"
>;
export type ZipFile = { name: string; bytes: Uint8Array };

/**
 * How much an archive may make the reader do. Exports with every entry of a team are a few
 * megabytes; deflate packs at most about 1:1032, and text exports land far below 1:200.
 */
export type ZipLimits = { entries: number; bytes: number; ratio: number };
export const ZIP_LIMITS: ZipLimits = { entries: 10_000, bytes: 64 * 1024 * 1024, ratio: 200 };

/** APPNOTE 4.3.16: end of central directory record */
const END_SIGNATURE = 0x06054b50;
const END_SIZE = 22;
/** APPNOTE 4.3.15: the ZIP64 locator sits right before the end record */
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
/** APPNOTE 4.3.12: central directory file header */
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_SIZE = 46;
/** APPNOTE 4.3.7: local file header */
const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_SIZE = 30;
/** APPNOTE 4.4.4: bit 0 of the general purpose flags, set for every kind of encryption */
const ENCRYPTED = 1;
/** APPNOTE 4.4.5: compression methods */
const STORED = 0;
const DEFLATED = 8;

type Entry = {
  name: string;
  flags: number;
  method: number;
  crc: number;
  packed: number;
  size: number;
  offset: number;
};

type Archive = { bytes: Uint8Array; data: DataView; limits: ZipLimits };

const u16 = (data: DataView, at: number) => data.getUint16(at, true);
const u32 = (data: DataView, at: number) => data.getUint32(at, true);

/**
 * Where the end record starts, searched from the back: the last signature whose comment ends
 * exactly with the file (APPNOTE 4.3.16). The match also bounds the search to 64 KiB of comment.
 */
const findEnd = (data: DataView): number => {
  for (let at = data.byteLength - END_SIZE; at >= 0; at--)
    if (u32(data, at) === END_SIGNATURE && at + END_SIZE + u16(data, at + 20) === data.byteLength)
      return at;
  return -1;
};

/** CRC-32 as ZIP uses it (APPNOTE 4.4.7): polynomial 0xEDB88320, reflected */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DRIVE = /^[a-z]:/i;

/** A name that would leave the folder it is unpacked into, were it ever used as a path */
const climbsOut = (name: string) =>
  name.startsWith("/") || name.includes("\\") || DRIVE.test(name) || name.split("/").includes("..");

// Names are UTF-8 (APPNOTE 4.4.4 bit 11) or CP437; the names looked up are ASCII, the same in both
const names = new TextDecoder();

/** One central directory header (APPNOTE 4.3.12) and where the next one starts */
const central = (
  { bytes, data }: Archive,
  at: number,
  limit: number,
): Result<{ entry: Entry; next: number }, ZipError> => {
  if (at + CENTRAL_SIZE > limit || u32(data, at) !== CENTRAL_SIGNATURE) return err("bad-zip");
  const nameEnd = at + CENTRAL_SIZE + u16(data, at + 28);
  const next = nameEnd + u16(data, at + 30) + u16(data, at + 32);
  if (next > limit) return err("bad-zip");
  return ok({
    entry: {
      name: names.decode(bytes.subarray(at + CENTRAL_SIZE, nameEnd)),
      flags: u16(data, at + 8),
      method: u16(data, at + 10),
      crc: u32(data, at + 16),
      packed: u32(data, at + 20),
      size: u32(data, at + 24),
      offset: u32(data, at + 42),
    },
    next,
  });
};

type Directory = { entries: Entry[]; start: number };

/** The central directory the end record at `end` points to (APPNOTE 4.3.16) */
const directory = (archive: Archive, end: number): Result<Directory, ZipError> => {
  const { data, limits } = archive;
  const locator = end - ZIP64_LOCATOR_SIZE;
  if (locator >= 0 && u32(data, locator) === ZIP64_LOCATOR_SIGNATURE) return err("unsupported-zip");
  const count = u16(data, end + 10);
  const onThisDisk = u16(data, end + 8) === count;
  if (u16(data, end + 4) !== 0 || u16(data, end + 6) !== 0 || !onThisDisk)
    return err("unsupported-zip");
  if (count > limits.entries) return err("too-large");
  const start = u32(data, end + 16);
  const limit = start + u32(data, end + 12);
  if (limit > end) return err("bad-zip");
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (let i = 0, at = start; i < count; i++) {
    const header = central(archive, at, limit);
    if (!header.ok) return header;
    const { name } = header.value.entry;
    if (climbsOut(name) || seen.has(name)) return err("bad-zip");
    seen.add(name);
    entries.push(header.value.entry);
    at = header.value.next;
  }
  return ok({ entries, start });
};

/** The next piece the stream gives, `undefined` at its end, or an error for broken data */
const nextChunk = (reader: ReadableStreamDefaultReader<Uint8Array>) =>
  reader.read().then(
    (chunk): Result<Uint8Array | undefined, "bad-zip"> => ok(chunk.value),
    () => err("bad-zip"),
  );

/** Raw deflate (APPNOTE 4.4.5, method 8), stopped as soon as it gives more than `size` bytes */
const inflate = async (packed: Uint8Array, size: number): Promise<Result<Uint8Array, ZipError>> => {
  const stream = new Blob([packed as Uint8Array<ArrayBuffer>]).stream();
  const reader = stream.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const out = new Uint8Array(size);
  let length = 0;
  for (;;) {
    const chunk = await nextChunk(reader);
    if (!chunk.ok) return chunk;
    if (chunk.value === undefined) break;
    if (length + chunk.value.length > size) {
      void reader.cancel();
      return err("bad-zip");
    }
    out.set(chunk.value, length);
    length += chunk.value.length;
  }
  return length === size ? ok(out) : err("bad-zip");
};

/** The file's bytes, from its local header (APPNOTE 4.3.7) up to the central directory */
const contents = async (
  archive: Archive,
  entry: Entry,
  directoryStart: number,
): Promise<Result<Uint8Array, ZipError>> => {
  if (entry.flags & ENCRYPTED) return err("encrypted");
  if (entry.method !== STORED && entry.method !== DEFLATED) return err("unsupported-zip");
  if (entry.size > entry.packed * archive.limits.ratio) return err("too-large");
  // Everything from the local header up to the directory; an offset past it leaves nothing
  const local = archive.bytes.subarray(entry.offset, directoryStart);
  const header = new DataView(local.buffer, local.byteOffset, local.byteLength);
  if (local.length < LOCAL_SIZE || u32(header, 0) !== LOCAL_SIGNATURE) return err("bad-zip");
  const start = LOCAL_SIZE + u16(header, 26) + u16(header, 28);
  if (start + entry.packed > local.length) return err("bad-zip");
  const packed = local.subarray(start, start + entry.packed);
  const unpacked = entry.method === STORED ? ok(packed.slice()) : await inflate(packed, entry.size);
  if (!unpacked.ok) return unpacked;
  const intact = unpacked.value.length === entry.size && crc32(unpacked.value) === entry.crc;
  return intact ? unpacked : err("bad-zip");
};

/**
 * The files of the archive `wanted` picks by name, in the order of the central directory, each a
 * copy of its own; or why the archive cannot be read.
 */
export const readZip = async (
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  limits: ZipLimits = ZIP_LIMITS,
): Promise<Result<ZipFile[], ZipError>> => {
  const archive = {
    bytes,
    data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    limits,
  };
  const end = findEnd(archive.data);
  if (end < 0) return err("bad-zip");
  const listed = directory(archive, end);
  if (!listed.ok) return listed;
  const picked = listed.value.entries.filter((entry) => wanted(entry.name));
  const total = picked.reduce((sum, entry) => sum + entry.size, 0);
  if (total > limits.bytes) return err("too-large");
  const files: ZipFile[] = [];
  for (const entry of picked) {
    const read = await contents(archive, entry, listed.value.start);
    if (!read.ok) return read;
    files.push({ name: entry.name, bytes: read.value });
  }
  return ok(files);
};

/**
 * Each file of the archive `wanted` picks, handed to `parse` and overwritten right after, since it
 * holds every secret in plain text.
 */
export const parseEachZipped = async (
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  parse: (file: Uint8Array) => ImportResult,
): Promise<Result<ImportResult[], ZipError>> => {
  const zip = await readZip(bytes, wanted);
  if (!zip.ok) return zip;
  return ok(
    zip.value.map((file) => {
      const parsed = parse(file.bytes);
      file.bytes.fill(0);
      return parsed;
    }),
  );
};

/** A parser for an export that is one file in a ZIP; an archive without it is another's */
export const parseZipped =
  (name: string, parse: (file: Uint8Array) => ImportResult) =>
  async (bytes: Uint8Array): Promise<ImportResult> => {
    const parsed = await parseEachZipped(bytes, (entry) => entry === name, parse);
    if (!parsed.ok) return parsed;
    return parsed.value[0] ?? err("wrong-format");
  };
