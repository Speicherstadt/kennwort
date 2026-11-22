/**
 * Building ZIP archives for the reader's tests, with node:zlib for deflate and CRC-32 so the
 * reader is checked against another implementation. Layout after PKWARE's APPNOTE.TXT: local
 * headers with their data, the central directory, the end record. The offsets come back so a
 * test can break a header on purpose.
 */
import { crc32, deflateRawSync } from "node:zlib";

export type ZipSpec = {
  name: string;
  data: string | Uint8Array;
  /** Stored (0) or deflated (8); deflated by default */
  method?: "stored" | "deflate";
  flags?: number;
  /** Extra field in both headers, and a comment in the central one (APPNOTE 4.3.7, 4.3.12) */
  extra?: Uint8Array;
  comment?: string;
};

export type BuiltZip = {
  bytes: Uint8Array;
  /** Where each local header starts */
  local: number[];
  /** Where each central directory header starts */
  central: number[];
  /** Where the end record starts */
  end: number;
};

const encoder = new TextEncoder();
const asBytes = (data: string | Uint8Array) =>
  typeof data === "string" ? encoder.encode(data) : data;

const header = (size: number, fill: (view: DataView) => void, tail: Uint8Array[]) => {
  const fixed = new Uint8Array(size);
  fill(new DataView(fixed.buffer));
  return [fixed, ...tail];
};

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export const buildZip = (files: ZipSpec[], comment = ""): BuiltZip => {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[][] = [];
  const local: number[] = [];
  let offset = 0;
  for (const file of files) {
    const data = asBytes(file.data);
    const stored = file.method === "stored";
    const packed = stored ? data : new Uint8Array(deflateRawSync(data));
    const name = encoder.encode(file.name);
    const extra = file.extra ?? new Uint8Array();
    const comment = encoder.encode(file.comment ?? "");
    const crc = crc32(data);
    const common = (view: DataView, at: number) => {
      view.setUint16(at, 20, true);
      view.setUint16(at + 2, (file.flags ?? 0) | 0x0800, true);
      view.setUint16(at + 4, stored ? 0 : 8, true);
      view.setUint32(at + 10, crc, true);
      view.setUint32(at + 14, packed.length, true);
      view.setUint32(at + 18, data.length, true);
      view.setUint16(at + 22, name.length, true);
      view.setUint16(at + 24, extra.length, true);
    };
    const localParts = header(
      30,
      (view) => {
        view.setUint32(0, 0x04034b50, true);
        common(view, 4);
      },
      [name, extra, packed],
    );
    centrals.push(
      header(
        46,
        (view) => {
          view.setUint32(0, 0x02014b50, true);
          view.setUint16(4, 20, true);
          common(view, 6);
          view.setUint16(32, comment.length, true);
          view.setUint32(42, offset, true);
        },
        [name, extra, comment],
      ),
    );
    local.push(offset);
    parts.push(...localParts);
    offset += localParts.reduce((n, p) => n + p.length, 0);
  }
  const directoryStart = offset;
  const central: number[] = [];
  for (const entry of centrals) {
    central.push(offset);
    parts.push(...entry);
    offset += entry.reduce((n, p) => n + p.length, 0);
  }
  const note = encoder.encode(comment);
  parts.push(
    ...header(
      22,
      (view) => {
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(8, files.length, true);
        view.setUint16(10, files.length, true);
        view.setUint32(12, offset - directoryStart, true);
        view.setUint32(16, directoryStart, true);
        view.setUint16(20, note.length, true);
      },
      [note],
    ),
  );
  return { bytes: concat(parts), local, central, end: offset };
};

/** The archive with a little-endian number written over it */
export const patched = (bytes: Uint8Array, at: number, value: number, size: 2 | 4) => {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  if (size === 2) view.setUint16(at, value, true);
  else view.setUint32(at, value, true);
  return copy;
};
