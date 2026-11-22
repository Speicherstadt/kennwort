import { ed25519KeyPair, sign } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { newRelease, RELEASE_PURPOSE, serializeRelease, toHex } from "../src/sw/release.ts";
import {
  browserPath,
  listedPaths,
  sequenceOf,
  signingKeys,
  TEST_RELEASE_SEED,
  trustedKey,
} from "./release-build.ts";

const seed = "11".repeat(32);
const publicOf = (hex: string) =>
  ed25519KeyPair(Uint8Array.from(Buffer.from(hex, "hex"))).publicKey;

describe("signingKeys", () => {
  it("signs with the loop's test key when no key is given, and says so", () => {
    const keys = signingKeys({});
    expect(keys).toMatchObject({ ok: true, value: { isTestKey: true } });
    expect(keys.ok && keys.value.publicKey).toEqual(publicOf(TEST_RELEASE_SEED));
  });

  it("signs with KENNWORT_RELEASE_KEY when given", () => {
    const keys = signingKeys({ KENNWORT_RELEASE_KEY: ` ${seed.toUpperCase()}\n` });
    expect(keys).toMatchObject({ ok: true, value: { isTestKey: false } });
    expect(keys.ok && keys.value.publicKey).toEqual(publicOf(seed));
  });

  it.each(["", "11", "zz".repeat(32), "11".repeat(33)])("refuses the key %j", (key) => {
    expect(signingKeys({ KENNWORT_RELEASE_KEY: key })).toEqual({
      ok: false,
      error: "KENNWORT_RELEASE_KEY must be 32 bytes as hex",
    });
  });
});

describe("trustedKey", () => {
  it("trusts the public half of the signing key unless a public key is given", () => {
    expect(trustedKey({})).toEqual({ ok: true, value: publicOf(TEST_RELEASE_SEED) });
    expect(trustedKey({ KENNWORT_RELEASE_KEY: seed })).toEqual({ ok: true, value: publicOf(seed) });
    const given = toHex(publicOf(seed));
    expect(trustedKey({ KENNWORT_RELEASE_PUBLIC_KEY: given })).toEqual({
      ok: true,
      value: publicOf(seed),
    });
  });

  it("refuses a malformed key", () => {
    expect(trustedKey({ KENNWORT_RELEASE_PUBLIC_KEY: "abc" }).ok).toBe(false);
    expect(trustedKey({ KENNWORT_RELEASE_KEY: "abc" }).ok).toBe(false);
  });
});

describe("sequenceOf", () => {
  const at = (commit: string | undefined, nowMs = 5_000) => ({ commit, nowMs });

  it("takes SOURCE_DATE_EPOCH first", () => {
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "1700000000" }, at("1800000000\n"))).toEqual({
      sequence: 1700000000,
      source: "SOURCE_DATE_EPOCH",
    });
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "0" }, at(undefined)).sequence).toBe(0);
  });

  // K-408: two builds of the same commit sign the same release.json, whenever they run
  it("else the time of the last commit, so a rebuild of the same commit gets the same number", () => {
    expect(sequenceOf({}, at("1763800000\n", 1_900_000_000_000))).toEqual({
      sequence: 1763800000,
      source: "commit",
    });
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "" }, at("1763800000")).sequence).toBe(1763800000);
  });

  it("else the build's own time in seconds, outside a git checkout", () => {
    expect(sequenceOf({}, at(undefined, 1_700_000_000_999))).toEqual({
      sequence: 1700000000,
      source: "clock",
    });
    for (const commit of ["", "not a time", "-1", "1.5", "17e8"])
      expect(sequenceOf({}, at(commit)).sequence).toBe(5);
    for (const given of ["-1", "1.5", "x"])
      expect(sequenceOf({ SOURCE_DATE_EPOCH: given }, at(undefined)).sequence).toBe(5);
  });
});

describe("a signed release (K-408)", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("is the same, byte for byte, whatever order the build read its files in", () => {
    const files: [string, Uint8Array][] = [
      ["/index.html", bytes("<!doctype html>")],
      ["/assets/index-abc.js", bytes("console.log(1)")],
      ["/icon.svg", bytes("<svg/>")],
    ];
    const one = serializeRelease(newRelease(new Map(files), 1763800000));
    const other = serializeRelease(newRelease(new Map([...files].reverse()), 1763800000));
    expect(toHex(other)).toBe(toHex(one));
  });

  it("carries the same signature twice: Ed25519 has no randomness (RFC 8032)", () => {
    const keys = signingKeys({});
    if (!keys.ok) throw new Error(keys.error);
    const manifest = serializeRelease(newRelease(new Map([["/a", bytes("a")]]), 1));
    const signature = () => toHex(sign(keys.value.secretKey, RELEASE_PURPOSE, manifest));
    expect(signature()).toBe(signature());
  });
});

describe("listedPaths", () => {
  it("lists every file as the browser asks for it, but the manifest, its signature and the worker", () => {
    expect(browserPath("assets\\index.js")).toBe("/assets/index.js");
    expect(
      listedPaths(["index.html", "assets/index.js", "release.json", "release.sig", "sw.js"]),
    ).toEqual(["/index.html", "/assets/index.js"]);
  });
});
