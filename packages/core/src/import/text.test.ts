import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeText, jsonCell, readJson } from "./text.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("export files as text (K-502)", () => {
  it("drops a BOM from text and from bytes", () => {
    expect(decodeText("﻿a﻿")).toEqual({ ok: true, value: "a﻿" });
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ ok: true, value: "a" });
    expect(decodeText("ab")).toEqual({ ok: true, value: "ab" });
    expect(decodeText("a\uFEFF")).toEqual({ ok: true, value: "a\uFEFF" });
  });

  it("decodes UTF-8 and refuses bytes that are not", () => {
    expect(decodeText(bytes(0xc3, 0xa4))).toEqual({ ok: true, value: "ä" });
    expect(decodeText(bytes(0xc3))).toEqual({ ok: false, error: "not-text" });
  });

  it("reads JSON against a schema", () => {
    const schema = z.object({ a: z.number() });
    expect(readJson('{"a":1}', schema)).toEqual({ ok: true, value: { a: 1 } });
    expect(readJson('{"a":"1"}', schema)).toEqual({ ok: false, error: "wrong-format" });
    expect(readJson("{", schema)).toEqual({ ok: false, error: "bad-json" });
    expect(readJson(bytes(0xff), schema)).toEqual({ ok: false, error: "not-text" });
  });

  it("reads JSON in a cell, anything else as the fallback", () => {
    const schema = z.array(z.string());
    expect(jsonCell('["a"]', schema, [])).toEqual(["a"]);
    expect(jsonCell("[1]", schema, ["f"])).toEqual(["f"]);
    expect(jsonCell("", schema, ["f"])).toEqual(["f"]);
  });
});
