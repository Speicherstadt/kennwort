/**
 * Writes export-v1.json (F-13), computed without the code under test: Argon2id from node:crypto
 * (`argon2Sync`, as Bun implements it), HKDF-SHA-512 from node:crypto and XChaCha20-Poly1305 from
 * libsodium, with the F-04 encoding written out by hand. Dev only; run with
 * `bun packages/crypto/vectors/generate-export.ts`.
 */
import { argon2Sync, hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sodium from "libsodium-wrappers-sumo";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
const utf8 = (text: string) => new TextEncoder().encode(text);
/** enc(t₁, …, tₙ) of F-04: each part as a 4-byte big-endian length and its bytes */
const enc = (...parts: Uint8Array[]) =>
  Buffer.concat(
    parts.flatMap((part) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(part.length);
      return [length, Buffer.from(part)];
    }),
  );

const cases = [
  {
    name: "ASCII passphrase, an export's JSON",
    passphrase: "Pumpe Kessel Rohr Ventil Export",
    plaintext: utf8('{"version":1,"vaults":[{"name":"Büro","entries":[]}]}'),
  },
  // NFKC: the passphrase typed in NFD and with a compatibility character (ﬁ) gives the same key
  // as in NFKC; the vector stores what was typed
  {
    name: "passphrase in NFD with a ligature, normalised to NFKC",
    passphrase: "Bäcker-Straße ﬁnal".normalize("NFD"),
    plaintext: utf8("Zugänge für Baustellen-Tablets"),
  },
  { name: "empty plaintext", passphrase: "x", plaintext: new Uint8Array() },
];

writeFileSync(
  join(import.meta.dirname, "export-v1.json"),
  `${JSON.stringify(
    cases.map(({ name, passphrase, plaintext }, index) => {
      const salt = bytes(16, 0x20 + index * 16);
      const nonce = bytes(24, 0x60 + index * 24);
      const p1 = argon2Sync("argon2id", {
        message: utf8(passphrase.normalize("NFKC")),
        nonce: salt,
        parallelism: 1,
        tagLength: 32,
        memory: 64 * 1024,
        passes: 3,
      });
      const key = new Uint8Array(
        hkdfSync("sha512", p1, new Uint8Array(0), enc(utf8("kennwort/export/v1")), 32),
      );
      const aad = enc(utf8("kennwort/box/v1"), utf8("export"), salt);
      const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        aad,
        null,
        nonce,
        key,
      );
      const file = Buffer.concat([Buffer.of(0x01), salt, Buffer.of(0x01), nonce, sealed]);
      return {
        name,
        passphrase,
        salt: hex(salt),
        nonce: hex(nonce),
        plaintext: hex(plaintext),
        key: hex(key),
        file: hex(file),
      };
    }),
    null,
    2,
  )}\n`,
);
