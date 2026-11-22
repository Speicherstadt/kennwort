import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readHmacBlocks, readInnerHeader } from "./kdbx-payload.ts";
import { concat, field, u32, u64 } from "./test/kdbx.ts";

const KEY = new Uint8Array(64).fill(3);
const blockKey = (index: bigint) =>
  createHash("sha512")
    .update(concat(u64(index), KEY))
    .digest();
/** A block as HmacBlockStream writes it: HMAC, size, data */
const block = (index: bigint, data: Uint8Array, size = data.length) => {
  const head = new Uint8Array(4);
  new DataView(head.buffer).setInt32(0, size, true);
  const mac = createHmac("sha256", blockKey(index))
    .update(concat(u64(index), head, data))
    .digest();
  return concat(new Uint8Array(mac), head, data);
};
const text = (value: string) => new TextEncoder().encode(value);
const blocks = (...data: string[]) =>
  concat(...[...data, ""].map((d, i) => block(BigInt(i), text(d))));

describe("HMAC blocks", () => {
  it("joins the blocks up to the empty one, after any start", () => {
    const file = concat(text("header"), blocks("Weber ", "Haus", "technik"), text("rest"));
    const result = readHmacBlocks(file, 6, KEY);
    expect(result.ok && new TextDecoder().decode(result.value)).toBe("Weber Haustechnik");
    expect(readHmacBlocks(blocks(), 0, KEY)).toEqual({ ok: true, value: new Uint8Array() });
  });

  it("refuses a changed byte, a block out of order and a missing end", () => {
    const file = blocks("Weber", "Haustechnik");
    for (const at of [0, 31, 32, 36, 40, file.length - 36, file.length - 1]) {
      const changed = file.slice();
      changed[at] = (changed[at] as number) ^ 0x80;
      expect([at, readHmacBlocks(changed, 0, KEY)]).toEqual([at, { ok: false, error: "bad-kdbx" }]);
    }
    const swapped = concat(block(1n, text("a")), block(0n, text("b")), block(2n, text("")));
    expect(readHmacBlocks(swapped, 0, KEY)).toEqual({ ok: false, error: "bad-kdbx" });
    expect(readHmacBlocks(file.subarray(0, -36), 0, KEY)).toEqual({ ok: false, error: "bad-kdbx" });
  });

  it("refuses sizes that are negative or run past the file", () => {
    for (const size of [-1, 2 ** 31 - 1, 6]) {
      const lying = concat(block(0n, text("Weber"), size), block(1n, text("")));
      const exact = size === 6 ? lying.subarray(0, 36 + 5) : lying;
      expect(readHmacBlocks(exact, 0, KEY)).toEqual({ ok: false, error: "bad-kdbx" });
    }
    expect(readHmacBlocks(blocks(), 1, KEY)).toEqual({ ok: false, error: "bad-kdbx" });
    // A size that fits exactly is read
    const fits = concat(block(0n, text("ab")), block(1n, text("")));
    expect(readHmacBlocks(fits, 0, KEY).ok).toBe(true);
  });
});

const KEY_FIELD = field(2, new Uint8Array(32).fill(7));
const END = field(0, new Uint8Array());

describe("inner header", () => {
  it("reads the stream, its key and the XML after it", () => {
    for (const [id, stream] of [
      [2, "salsa20"],
      [3, "chacha20"],
    ] as const) {
      const payload = concat(
        field(1, u32(id)),
        KEY_FIELD,
        field(3, Uint8Array.of(1, 9)),
        END,
        text("<x/>"),
      );
      expect(readInnerHeader(payload)).toEqual({
        ok: true,
        value: { stream, key: new Uint8Array(32).fill(7), xml: text("<x/>") },
      });
    }
  });

  it("skips unknown fields and takes the last of a repeated one", () => {
    const payload = concat(field(9, text("?")), field(1, u32(2)), field(1, u32(3)), KEY_FIELD, END);
    expect(readInnerHeader(payload)).toMatchObject({ ok: true, value: { stream: "chacha20" } });
  });

  it("takes empty unknown fields and an attachment of only its flag byte", () => {
    const payload = concat(
      field(9, new Uint8Array()),
      field(3, Uint8Array.of(1)),
      field(1, u32(3)),
      KEY_FIELD,
      END,
    );
    expect(readInnerHeader(payload)).toMatchObject({ ok: true, value: { stream: "chacha20" } });
  });

  it("refuses an end field that claims more bytes than follow", () => {
    const lying = concat(field(1, u32(3)), KEY_FIELD, Uint8Array.of(0, 10, 0, 0, 0));
    expect(readInnerHeader(lying)).toEqual({ ok: false, error: "bad-kdbx" });
  });

  it("refuses a missing stream or key, a cut field, an empty attachment", () => {
    const bad = { ok: false, error: "bad-kdbx" };
    const full = concat(field(1, u32(3)), KEY_FIELD, END);
    expect(readInnerHeader(concat(KEY_FIELD, END))).toEqual(bad);
    expect(readInnerHeader(concat(field(1, u32(3)), END))).toEqual(bad);
    expect(readInnerHeader(concat(field(1, u32(3).subarray(1)), KEY_FIELD, END))).toEqual(bad);
    expect(
      readInnerHeader(concat(field(1, u32(3)), KEY_FIELD, field(3, new Uint8Array()), END)),
    ).toEqual(bad);
    for (const length of [0, 4, 5, 8, full.length - 1]) {
      expect(readInnerHeader(full.subarray(0, length))).toEqual(bad);
    }
    const lying = full.slice();
    lying[1] = 5;
    expect(readInnerHeader(lying.subarray(0, 9))).toEqual(bad);
  });

  it("calls ArcFour and unknown streams unsupported", () => {
    for (const id of [0, 1, 4]) {
      expect(readInnerHeader(concat(field(1, u32(id)), KEY_FIELD, END))).toEqual({
        ok: false,
        error: "unsupported",
      });
    }
  });
});
