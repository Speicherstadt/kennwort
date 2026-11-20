import { createHash } from "node:crypto";
import { ed25519KeyPair, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  checkFiles,
  fromHex,
  newRelease,
  openRelease,
  parseRelease,
  RELEASE_PURPOSE,
  type Release,
  serializeRelease,
  toHex,
} from "./release.ts";

const text = (value: string) => new TextEncoder().encode(value);
const files = new Map([
  ["/index.html", text("<!doctype html>")],
  ["/assets/index-abc.js", text("console.log(1)")],
]);
const keys = ed25519KeyPair(new Uint8Array(32).fill(1));
const release = newRelease(files, 1700000000);
const manifest = serializeRelease(release);
const signed = (bytes: Uint8Array, secretKey = keys.secretKey) =>
  toHex(sign(secretKey, RELEASE_PURPOSE, bytes));
const manifestOf = (value: unknown) => text(JSON.stringify(value));

describe("newRelease", () => {
  it("lists every file with its SHA-256, as sha256sum would", () => {
    expect(release.files).toEqual({
      "/assets/index-abc.js": createHash("sha256").update("console.log(1)").digest("hex"),
      "/index.html": createHash("sha256").update("<!doctype html>").digest("hex"),
    });
    expect(release.sequence).toBe(1700000000);
  });

  it("names the version after the contents, not the order of the files", () => {
    expect(release.version).toMatch(/^[0-9a-f]{16}$/);
    expect(newRelease(new Map([...files].reverse()), 1).version).toBe(release.version);
    expect(newRelease(new Map([["/index.html", text("other")]]), 1).version).not.toBe(
      release.version,
    );
  });
});

describe("serializeRelease", () => {
  it("writes the files sorted, so a build always writes the same bytes", () => {
    const shuffled: Release = { ...release, files: { b: "2", a: "1" } };
    expect(new TextDecoder().decode(serializeRelease(shuffled))).toContain('"a": "1",\n    "b"');
  });
});

describe("openRelease", () => {
  it("opens a release signed by the release key", () => {
    expect(openRelease(keys.publicKey, manifest, signed(manifest))).toEqual({
      ok: true,
      value: release,
    });
    expect(openRelease(keys.publicKey, manifest, `${signed(manifest)}\n`).ok).toBe(true);
  });

  it("refuses a signature over other bytes", () => {
    const changed = serializeRelease({ ...release, sequence: release.sequence + 1 });
    expect(openRelease(keys.publicKey, changed, signed(manifest))).toEqual({
      ok: false,
      error: "signature",
    });
  });

  it("refuses a signature by another key", () => {
    const other = ed25519KeyPair(new Uint8Array(32).fill(2));
    expect(openRelease(keys.publicKey, manifest, signed(manifest, other.secretKey))).toEqual({
      ok: false,
      error: "signature",
    });
  });

  it("refuses a signature for another purpose, and one that is not hex", () => {
    const log = toHex(sign(keys.secretKey, "log", manifest));
    expect(openRelease(keys.publicKey, manifest, log).ok).toBe(false);
    expect(openRelease(keys.publicKey, manifest, "zz").ok).toBe(false);
    expect(openRelease(keys.publicKey, manifest, "").ok).toBe(false);
  });

  it("refuses a signed manifest that does not parse", () => {
    const broken = text("{not json");
    expect(openRelease(keys.publicKey, broken, signed(broken))).toEqual({
      ok: false,
      error: "malformed",
    });
  });
});

describe("parseRelease", () => {
  const hash = "a".repeat(64);
  const valid = { format: 1, version: "0123456789abcdef", sequence: 3, files: { "/a.js": hash } };

  it("reads a valid manifest and drops fields it does not know", () => {
    expect(parseRelease(manifestOf({ ...valid, extra: true }))).toEqual({ ok: true, value: valid });
  });

  it.each([
    ["not JSON", text("{")],
    ["not UTF-8", new Uint8Array([0x7b, 0xff, 0x7d])],
    ["an array", manifestOf([valid])],
    ["null", manifestOf(null)],
    ["another format", manifestOf({ ...valid, format: 2 })],
    ["no version", manifestOf({ ...valid, version: undefined })],
    ["a version in upper case", manifestOf({ ...valid, version: "0123456789ABCDEF" })],
    ["a short version", manifestOf({ ...valid, version: "0123" })],
    ["a negative sequence", manifestOf({ ...valid, sequence: -1 })],
    ["a fractional sequence", manifestOf({ ...valid, sequence: 1.5 })],
    ["files as an array", manifestOf({ ...valid, files: [hash] })],
    ["no files", manifestOf({ ...valid, files: null })],
    ["a relative path", manifestOf({ ...valid, files: { "a.js": hash } })],
    ["the worker as a file", manifestOf({ ...valid, files: { "/sw.js": hash } })],
    ["a short hash", manifestOf({ ...valid, files: { "/a.js": "ab" } })],
    ["a hash that is no string", manifestOf({ ...valid, files: { "/a.js": 1 } })],
  ])("refuses %s", (_name, bytes) => {
    expect(parseRelease(bytes)).toEqual({ ok: false, error: "malformed" });
  });
});

describe("checkFiles", () => {
  it("accepts exactly the listed files", () => {
    expect(checkFiles(release, files)).toEqual({ ok: true });
  });

  it("refuses a file whose hash differs", () => {
    const tampered = new Map(files).set("/assets/index-abc.js", text("steal()"));
    expect(checkFiles(release, tampered)).toEqual({
      ok: false,
      error: "hash",
      path: "/assets/index-abc.js",
    });
  });

  it("refuses a missing file", () => {
    const missing = new Map(files);
    missing.delete("/index.html");
    expect(checkFiles(release, missing)).toEqual({
      ok: false,
      error: "missing",
      path: "/index.html",
    });
  });

  it("refuses an extra file", () => {
    const extra = new Map(files).set("/assets/evil.js", text("steal()"));
    expect(checkFiles(release, extra)).toEqual({
      ok: false,
      error: "extra",
      path: "/assets/evil.js",
    });
  });
});

describe("hex", () => {
  it("goes there and back in lower case only", () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
    expect(fromHex("000fff")).toEqual(new Uint8Array([0, 15, 255]));
    expect(fromHex("")).toEqual(new Uint8Array());
    expect(fromHex("0F")).toBeNull();
    expect(fromHex("abc")).toBeNull();
  });
});
