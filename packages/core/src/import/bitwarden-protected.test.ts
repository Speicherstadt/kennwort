import { describe, expect, it } from "vitest";
import { parseBitwardenJson } from "./bitwarden-json.ts";
import {
  BITWARDEN_LIMITS,
  bitwardenKdfOf,
  checkBitwardenJson,
  openBitwardenJson,
  unlockBitwardenJson,
} from "./bitwarden-protected.ts";
import {
  encString,
  exportBytes,
  protectedExport,
  TEST_ITERATIONS,
  TEST_PASSWORD,
  TEST_SALT,
  testKey,
} from "./test/bitwarden.ts";
import { compact, fixture, fixtureText } from "./test/helpers.ts";

// The fixtures: bitwarden.json protected with PBKDF2 (100 000 iterations) and Argon2id (16 MiB,
// 3 iterations, 4 threads) by test/generate-bitwarden.py; from bitwarden/clients a
// password-protected export (password unknown) and two account-restricted ones.
const PLAIN = compact(parseBitwardenJson(fixture("bitwarden.json")));
const unlock = (bytes: Uint8Array, password = TEST_PASSWORD) =>
  unlockBitwardenJson(bytes, { password });
const failure = (error: string) => ({ ok: false, error });
const plainText = fixtureText("bitwarden.json");
const withParts = (parts: Record<string, unknown>) =>
  exportBytes(protectedExport(plainText, parts));

describe("Bitwarden's password-protected JSON (K-502 Teil 4)", () => {
  it.each(["bitwarden-protected-pbkdf2.json", "bitwarden-protected-argon2id.json"])(
    "opens %s with its password, entry for entry as the plain export",
    async (name) => {
      expect(compact(await unlock(fixture(name)))).toEqual(PLAIN);
    },
  );

  it("ends with a wrong password as wrong-password, Bitwarden's own export too", async () => {
    expect(
      await unlock(fixture("bitwarden-protected-pbkdf2.json"), "weber-haustechnik-2026"),
    ).toEqual(failure("wrong-password"));
    expect(await unlock(fixture("bitwarden-protected-argon2id.json"), "")).toEqual(
      failure("wrong-password"),
    );
    expect(await unlock(fixture("bitwarden-protected-bitwarden.json"))).toEqual(
      failure("wrong-password"),
    );
  });

  it("asks for the password of a protected file without deriving anything", () => {
    for (const name of [
      "bitwarden-protected-pbkdf2.json",
      "bitwarden-protected-argon2id.json",
      "bitwarden-protected-bitwarden.json",
    ])
      expect(checkBitwardenJson(fixture(name))).toEqual(failure("encrypted"));
  });

  it("ends with a protected export whose flags were renamed as wrong-format, not as empty", async () => {
    // fast-check seeds -738442150 and 1865286675 of bitwarden-protected.property.test.ts
    const renamed = new TextDecoder()
      .decode(withParts({}))
      .replace('"encrypted"', '"encr=ypted"')
      .replace('"passwordProtected"', '"passwor+Protected"');
    const bytes = new TextEncoder().encode(renamed);
    expect(checkBitwardenJson(bytes)).toEqual(failure("wrong-format"));
    expect(await unlock(bytes)).toEqual(failure("wrong-format"));
  });

  it("reads a plain export with or without a password", async () => {
    expect(compact(checkBitwardenJson(fixture("bitwarden.json")))).toEqual(PLAIN);
    expect(compact(await unlock(fixture("bitwarden.json"), ""))).toEqual(PLAIN);
  });

  it("refuses Bitwarden's account-restricted exports, which only the account opens", async () => {
    for (const name of [
      "bitwarden-account-encrypted-v1.json",
      "bitwarden-account-encrypted-v2.json",
    ]) {
      expect(checkBitwardenJson(fixture(name))).toEqual(failure("account-encrypted"));
      expect(await unlock(fixture(name))).toEqual(failure("account-encrypted"));
    }
  });

  it("opens an export whose password is Unicode, as UTF-8", async () => {
    const password = "Größe – 👷 Weber";
    const bytes = exportBytes(protectedExport(plainText, {}, password));
    expect(compact(await unlock(bytes, password))).toEqual(PLAIN);
    expect(await unlock(bytes, password.normalize("NFD"))).toEqual(failure("wrong-password"));
  });
});

describe("Bitwarden's password-protected JSON, changed or broken", () => {
  const key = testKey(TEST_PASSWORD, TEST_SALT, TEST_ITERATIONS);
  const valid = protectedExport(plainText);
  /** The EncString with one character of its part changed */
  const changed = (text: string, part: 0 | 1 | 2) => {
    const parts = text.slice(2).split("|");
    const value = parts[part] ?? "";
    parts[part] = value.slice(0, 5) + (value[5] === "A" ? "B" : "A") + value.slice(6);
    return `2.${parts.join("|")}`;
  };

  it("ends with changed content or MAC as damaged, once the password matched", async () => {
    for (const part of [0, 1, 2] as const)
      expect(await unlock(withParts({ data: changed(valid.data, part) }))).toEqual(
        failure("damaged"),
      );
  });

  it("ends with a changed key check as wrong-password: it cannot tell the two apart", async () => {
    const check = valid.encKeyValidation_DO_NOT_EDIT;
    expect(await unlock(withParts({ encKeyValidation_DO_NOT_EDIT: changed(check, 1) }))).toEqual(
      failure("wrong-password"),
    );
  });

  it("refuses content of the right key that is no plain Bitwarden export", async () => {
    const cases = [
      encString(key, "not json"),
      encString(key, JSON.stringify(valid)),
      encString(key, '{"encrypted":true,"items":[]}'),
      valid.encKeyValidation_DO_NOT_EDIT,
    ];
    for (const data of cases)
      expect(await unlock(withParts({ data }))).toEqual(failure("wrong-format"));
  });

  it("refuses authentic content whose padding is broken as damaged", async () => {
    // A MAC over a ciphertext that does not end in PKCS#7: only a broken writer makes that
    const iv = Buffer.alloc(16, 7);
    const data = Buffer.alloc(16);
    const { createHmac } = await import("node:crypto");
    const mac = createHmac("sha256", key.macKey).update(iv).update(data).digest();
    const text = `2.${iv.toString("base64")}|${data.toString("base64")}|${mac.toString("base64")}`;
    expect(await unlock(withParts({ data: text }))).toEqual(failure("damaged"));
  });

  it("refuses EncStrings of another type, such as type 0 without a MAC, as unsupported", () => {
    for (const field of ["data", "encKeyValidation_DO_NOT_EDIT"])
      for (const text of [`0.${valid.data.slice(2)}`, `7.${valid.data.slice(2)}`, "", "2"])
        expect(checkBitwardenJson(withParts({ [field]: text }))).toEqual(failure("unsupported"));
  });

  it("refuses EncStrings of type 2 that are broken as damaged", () => {
    const [iv = "", ct = "", mac = ""] = valid.data.slice(2).split("|");
    const broken = [
      `2.${iv}|${ct}`,
      `2.${iv}|${ct}|${mac}|${mac}`,
      `2.${iv}|${ct}|${mac.slice(0, -2)}`,
      `2.${iv.slice(0, -4)}|${ct}|${mac}`,
      `2.${iv}|${ct}|AAAA${mac.slice(4)}A=`,
      `2.${iv}|${ct.slice(1)}|${mac}`,
      `2.|${ct}|${mac}`,
      `2.${iv}||${mac}`,
      `2.${iv}|${ct}|`,
      `2.${iv}|*${ct.slice(1)}|${mac}`,
      `2.*${iv.slice(1)}|${ct}|${mac}`,
      `2.${iv}|${ct}|*${mac.slice(1)}`,
    ];
    for (const field of ["data", "encKeyValidation_DO_NOT_EDIT"])
      for (const text of broken)
        expect([text, checkBitwardenJson(withParts({ [field]: text }))]).toEqual([
          text,
          failure("damaged"),
        ]);
  });

  it("refuses a protected file that misses a part as damaged", () => {
    for (const part of ["salt", "data", "encKeyValidation_DO_NOT_EDIT", "kdfType", "encrypted"])
      expect(checkBitwardenJson(withParts({ [part]: undefined }))).toEqual(failure("damaged"));
    expect(checkBitwardenJson(withParts({ salt: "" }))).toEqual(failure("damaged"));
    expect(checkBitwardenJson(withParts({ kdfIterations: "5000" }))).toEqual(failure("damaged"));
  });

  it("checks the KDF's limits before any key is derived", async () => {
    const costly = withParts({ kdfIterations: 2_000_001 });
    expect(checkBitwardenJson(costly)).toEqual(failure("too-costly"));
    expect(await unlock(costly)).toEqual(failure("too-costly"));
    const unknown = withParts({ kdfType: 2 });
    expect(checkBitwardenJson(unknown)).toEqual(failure("unsupported"));
    expect(await unlock(unknown)).toEqual(failure("unsupported"));
  });

  it("calls a KDF that noble refuses within looser limits unsupported", async () => {
    const pbkdf2Iterations = { min: 0, max: 10 };
    const limits = { ...BITWARDEN_LIMITS, pbkdf2Iterations };
    const bytes = withParts({ kdfIterations: 0 });
    expect(await openBitwardenJson(bytes, TEST_PASSWORD, limits)).toEqual(failure("unsupported"));
  });
});

describe("Bitwarden's KDF limits", () => {
  const pbkdf2 = (kdfIterations: unknown) => bitwardenKdfOf({ kdfType: 0, kdfIterations });
  const argon2 = (kdfIterations: unknown, kdfMemory: unknown, kdfParallelism: unknown) =>
    bitwardenKdfOf({ kdfType: 1, kdfIterations, kdfMemory, kdfParallelism });

  it("takes PBKDF2 from 5 000 to 2 000 000 iterations", () => {
    expect(pbkdf2(5000)).toEqual({ ok: true, value: { kind: "pbkdf2", iterations: 5000 } });
    expect(pbkdf2(2_000_000)).toEqual({
      ok: true,
      value: { kind: "pbkdf2", iterations: 2_000_000 },
    });
    expect(pbkdf2(4999)).toEqual(failure("unsupported"));
    expect(pbkdf2(5000.5)).toEqual(failure("unsupported"));
    expect(pbkdf2(2_000_001)).toEqual(failure("too-costly"));
    expect(pbkdf2(undefined)).toEqual(failure("unsupported"));
  });

  it("takes Argon2id with 2 to 10 iterations, 16 to 1024 MiB and 1 to 16 threads", () => {
    const argon = (iterations: number, memoryMiB: number, parallelism: number) => ({
      ok: true,
      value: { kind: "argon2id", iterations, memoryMiB, parallelism },
    });
    expect(argon2(2, 16, 1)).toEqual(argon(2, 16, 1));
    expect(argon2(10, 1024, 16)).toEqual(argon(10, 1024, 16));
    expect(argon2(1, 16, 1)).toEqual(failure("unsupported"));
    expect(argon2(2, 15, 1)).toEqual(failure("unsupported"));
    expect(argon2(2, 16, 0)).toEqual(failure("unsupported"));
    expect(argon2(11, 16, 1)).toEqual(failure("too-costly"));
    expect(argon2(2, 1025, 1)).toEqual(failure("too-costly"));
    expect(argon2(2, 16, 17)).toEqual(failure("too-costly"));
    expect(argon2(2, undefined, 1)).toEqual(failure("unsupported"));
    expect(argon2(2, 16, null)).toEqual(failure("unsupported"));
    expect(argon2(2, 16.5, 1)).toEqual(failure("unsupported"));
  });

  it("calls a value that is both too low and too costly unsupported", () => {
    expect(argon2(1, 2048, 1)).toEqual(failure("unsupported"));
    expect(argon2(20, 8, 1)).toEqual(failure("unsupported"));
  });

  it("knows only kdfType 0 and 1", () => {
    for (const kdfType of [-1, 2, 0.5, undefined])
      expect(bitwardenKdfOf({ kdfType, kdfIterations: 5000 })).toEqual(failure("unsupported"));
    // Not even with parameters that would suit Argon2id
    const argon2 = { kdfIterations: 3, kdfMemory: 16, kdfParallelism: 1 };
    expect(bitwardenKdfOf({ kdfType: 2, ...argon2 })).toEqual(failure("unsupported"));
  });

  it("are Bitwarden's own ranges", () => {
    expect(BITWARDEN_LIMITS).toEqual({
      pbkdf2Iterations: { min: 5000, max: 2_000_000 },
      argon2Iterations: { min: 2, max: 10 },
      argon2MemoryMiB: { min: 16, max: 1024 },
      argon2Parallelism: { min: 1, max: 16 },
    });
  });
});
