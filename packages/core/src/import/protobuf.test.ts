import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readMessage, readVarint } from "./protobuf.ts";
import { message, varintBytes } from "./test/protobuf.ts";

const bytes = (...values: number[]) => new Uint8Array(values);
const bad = { ok: false, error: "bad-proto" };

describe("Protocol Buffers reader (K-503)", () => {
  it("reads varints as the encoding guide shows them", () => {
    expect(readVarint(bytes(0x01), 0)).toEqual({ ok: true, value: { value: 1, next: 1 } });
    // 150 is 0x96 0x01 (encoding guide, "Base 128 Varints")
    expect(readVarint(bytes(0xff, 0x96, 0x01), 1)).toEqual({
      ok: true,
      value: { value: 150, next: 3 },
    });
    expect(readVarint(bytes(0x80, 0x80, 0x80, 0x80, 0x10), 0)).toEqual({
      ok: true,
      value: { value: 2 ** 32, next: 5 },
    });
    // Ten bytes is the longest a varint gets (64 bits)
    const ten = bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01);
    expect(readVarint(ten, 0)).toMatchObject({ ok: true, value: { next: 10 } });
    expect(readVarint(bytes(...ten.slice(0, 9), 0x81, 0x01), 0)).toEqual(bad);
    expect(readVarint(bytes(0x80), 0)).toEqual(bad);
    expect(readVarint(bytes(), 0)).toEqual(bad);
  });

  it("reads a message's varint and length-delimited fields and steps over fixed-width ones", () => {
    // Field 1 = 150, field 2 = "testing" (encoding guide), then a fixed64 and a fixed32
    const fixed64 = [0x19, 1, 2, 3, 4, 5, 6, 7, 8];
    const fixed32 = [0x25, 1, 2, 3, 4];
    const data = bytes(
      0x08,
      0x96,
      0x01,
      ...fixed64,
      0x12,
      0x07,
      ...new TextEncoder().encode("testing"),
      ...fixed32,
      0x18,
      0x00,
    );
    expect(readMessage(data)).toEqual({
      ok: true,
      value: [
        { field: 1, wire: "varint", value: 150 },
        { field: 2, wire: "bytes", value: new TextEncoder().encode("testing") },
        { field: 3, wire: "varint", value: 0 },
      ],
    });
    expect(readMessage(bytes())).toEqual({ ok: true, value: [] });
    expect(readMessage(bytes(0x0a, 0x00))).toEqual({
      ok: true,
      value: [{ field: 1, wire: "bytes", value: bytes() }],
    });
  });

  it("refuses what is cut short, field number 0, groups and wire types that do not exist", () => {
    const refused = [
      [0x08],
      [0x08, 0x80],
      [0x80],
      [0x12, 0x05, 1, 2, 3, 4],
      [0x12, 0x80],
      [0x12, 0xff, 0xff, 0xff, 0xff, 0x0f],
      [0x19, 1, 2, 3, 4, 5, 6, 7],
      [0x1d, 1, 2, 3],
      [0x00, 0x01],
      [0x02, 0x00],
      [0x0b, 0, 0, 0, 0],
      [0x0c, 0, 0, 0, 0],
      [0x0e, 0, 0, 0, 0, 0, 0, 0, 0],
      [0x0f, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    for (const data of refused) expect([data, readMessage(bytes(...data))]).toEqual([data, bad]);
  });

  it("reads back what a writer wrote, whatever the fields", () => {
    const field = fc.tuple(
      fc.integer({ min: 1, max: 2 ** 29 - 1 }),
      fc.oneof(fc.nat(), fc.uint8Array({ maxLength: 300 })),
    );
    fc.assert(
      fc.property(fc.array(field, { maxLength: 12 }), (fields) => {
        const read = readMessage(message(fields));
        expect(read).toEqual({
          ok: true,
          value: fields.map(([n, v]) =>
            typeof v === "number"
              ? { field: n, wire: "varint", value: v }
              : { field: n, wire: "bytes", value: v },
          ),
        });
      }),
    );
  });

  it("reads varints up to 2^53 exactly", () => {
    fc.assert(
      fc.property(fc.maxSafeNat(), (n) => {
        expect(readVarint(new Uint8Array(varintBytes(n)), 0)).toMatchObject({
          value: { value: n },
        });
      }),
    );
  });

  it("answers any bytes without throwing, and in one pass", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (data) => {
        const read = readMessage(data);
        expect(read.ok ? Array.isArray(read.value) : read.error).toBeTruthy();
      }),
      { numRuns: 500 },
    );
    // A million varint fields read quickly
    const many = new Uint8Array(2_000_000).map((_, i) => (i % 2 === 0 ? 0x08 : 0x01));
    expect(readMessage(many)).toMatchObject({ ok: true });
  });
});
