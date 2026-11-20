import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { toHex } from "../src/sw/release.ts";
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
  it("takes SOURCE_DATE_EPOCH, else the build's time in seconds", () => {
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "1700000000" }, 5_000)).toBe(1700000000);
    expect(sequenceOf({}, 1_700_000_000_999)).toBe(1700000000);
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "" }, 5_000)).toBe(5);
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "-1" }, 5_000)).toBe(5);
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "1.5" }, 5_000)).toBe(5);
    expect(sequenceOf({ SOURCE_DATE_EPOCH: "0" }, 5_000)).toBe(0);
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
