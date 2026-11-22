import { describe, expect, it } from "vitest";
import vectors from "../vectors/bitwarden-export.json" with { type: "json" };
import {
  type BitwardenKdf,
  bitwardenDecrypt,
  bitwardenExportKey,
  bitwardenKdf,
  bitwardenStretch,
} from "./bitwarden.ts";
import { fromHex, hex } from "./test-helpers.ts";

// Bitwarden's own vectors (bitwarden/sdk-internal, kdf.rs and utils.rs) and vectors computed with
// hashlib, cryptography and argon2-cffi (vectors/generate-bitwarden.py)

/** The parts of an EncString of type 2, "2.iv|ct|mac", as the test reads them */
const partsOf = (encString: string) => {
  const [iv = "", data = "", mac = ""] = encString.slice(2).split("|");
  const bytes = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));
  return { iv: bytes(iv), data: bytes(data), mac: bytes(mac) };
};

describe("Bitwarden's export key, Bitwarden's own vectors", () => {
  it.each(vectors.bitwarden.kdf)("$kdf.kind", async ({ password, salt, kdf, material }) => {
    const result = await bitwardenKdf(password, salt, kdf as BitwardenKdf);
    expect(result.ok && hex(result.value)).toBe(material);
  });

  it("stretches the KDF's output with HKDF-Expand into enc and mac keys", () => {
    const { material, encKey, macKey } = vectors.bitwarden.stretch;
    const key = bitwardenStretch(fromHex(material));
    expect([hex(key.encKey), hex(key.macKey)]).toEqual([encKey, macKey]);
  });
});

describe("Bitwarden's export key, from the export's salt", () => {
  it.each(vectors.derive)(
    "$kdf.kind",
    async ({ password, salt, kdf, material, encKey, macKey }) => {
      const derived = await bitwardenKdf(password, salt, kdf as BitwardenKdf);
      expect(derived.ok && hex(derived.value)).toBe(material);
      const key = await bitwardenExportKey(password, salt, kdf as BitwardenKdf);
      expect(key.ok && [hex(key.value.encKey), hex(key.value.macKey)]).toEqual([encKey, macKey]);
    },
  );
});

describe("Bitwarden's EncString of type 2", () => {
  const key = {
    encKey: fromHex(vectors.encString.encKey),
    macKey: fromHex(vectors.encString.macKey),
  };

  it.each(vectors.encString.cases)("decrypts $plain", ({ plain, encString }) => {
    const opened = bitwardenDecrypt(key, partsOf(encString));
    expect(opened.ok && hex(opened.value)).toBe(plain);
  });

  it("refuses every case under the keys swapped", () => {
    const swapped = { encKey: key.macKey, macKey: key.encKey };
    for (const { encString } of vectors.encString.cases)
      expect(bitwardenDecrypt(swapped, partsOf(encString))).toEqual({
        ok: false,
        error: "bad-mac",
      });
  });
});
