import { createCipheriv, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bitwardenDecrypt, bitwardenExportKey, bitwardenKdf } from "./bitwarden.ts";

const encKey = new Uint8Array(32).fill(1);
const macKey = new Uint8Array(32).fill(2);
const iv = new Uint8Array(16).fill(3);

/** Bitwarden's encrypt-then-MAC with node:crypto, independent of the code under test */
const seal = (plain: Uint8Array, padded = true) => {
  const cipher = createCipheriv("aes-256-cbc", encKey, iv).setAutoPadding(padded);
  const data = new Uint8Array(Buffer.concat([cipher.update(plain), cipher.final()]));
  const mac = new Uint8Array(createHmac("sha256", macKey).update(iv).update(data).digest());
  return { iv, data, mac };
};

describe("Bitwarden's EncString of type 2", () => {
  const plain = new TextEncoder().encode("Weber Haustechnik");

  it("opens what was sealed under its keys", () => {
    expect(bitwardenDecrypt({ encKey, macKey }, seal(plain))).toEqual({ ok: true, value: plain });
  });

  it("checks the MAC over IV and ciphertext before decrypting", () => {
    const sealed = seal(plain);
    const flip = (bytes: Uint8Array, at: number) => bytes.map((b, i) => (i === at ? b ^ 1 : b));
    const broken = [
      { ...sealed, iv: flip(sealed.iv, 0) },
      { ...sealed, data: flip(sealed.data, sealed.data.length - 1) },
      { ...sealed, mac: flip(sealed.mac, 31) },
      { ...sealed, mac: sealed.mac.subarray(0, 31) },
      { ...sealed, data: sealed.data.subarray(16) },
    ];
    for (const cipher of broken)
      expect(bitwardenDecrypt({ encKey, macKey }, cipher)).toEqual({ ok: false, error: "bad-mac" });
  });

  it("refuses another MAC key, even with the right encryption key", () => {
    const other = { encKey, macKey: new Uint8Array(32).fill(9) };
    expect(bitwardenDecrypt(other, seal(plain))).toEqual({ ok: false, error: "bad-mac" });
  });

  it("calls an authentic ciphertext without valid padding bad-padding", () => {
    // 16 bytes ending in 0x00: never valid PKCS#7, yet authentic under the MAC key
    const unpadded = seal(new Uint8Array(16), false);
    expect(bitwardenDecrypt({ encKey, macKey }, unpadded)).toEqual({
      ok: false,
      error: "bad-padding",
    });
  });

  it("calls an authentic ciphertext with an IV of the wrong length bad-padding", () => {
    const sealed = seal(plain);
    const shortIv = sealed.iv.subarray(0, 8);
    const mac = createHmac("sha256", macKey).update(shortIv).update(sealed.data).digest();
    const cipher = { iv: shortIv, data: sealed.data, mac: new Uint8Array(mac) };
    expect(bitwardenDecrypt({ encKey, macKey }, cipher)).toEqual({
      ok: false,
      error: "bad-padding",
    });
  });
});

describe("Bitwarden's export key", () => {
  it("refuses parameters the KDF does not allow", async () => {
    const pbkdf2 = await bitwardenKdf("pw", "salt", { kind: "pbkdf2", iterations: 0 });
    expect(pbkdf2).toEqual({ ok: false, error: "bad-kdf" });
    const argon2 = { kind: "argon2id" as const, iterations: 1, memoryMiB: 0, parallelism: 1 };
    expect(await bitwardenKdf("pw", "salt", argon2)).toEqual({ ok: false, error: "bad-kdf" });
    expect(await bitwardenExportKey("pw", "salt", argon2)).toEqual({ ok: false, error: "bad-kdf" });
  });

  it("gives other passwords and salts other keys", async () => {
    const kdf = { kind: "pbkdf2" as const, iterations: 1 };
    const keys = await Promise.all([
      bitwardenExportKey("a", "salt", kdf),
      bitwardenExportKey("b", "salt", kdf),
      bitwardenExportKey("a", "salz", kdf),
    ]);
    const encKeys = keys.map((key) =>
      key.ok ? Buffer.from(key.value.encKey).toString("hex") : "",
    );
    expect(new Set(encKeys).size).toBe(3);
  });
});
