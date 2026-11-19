/**
 * Writes sign-v1.json (F-03) and passphrase-v1.json (F-05), computed without the code under test:
 * Ed25519 and Argon2id (crypto_pwhash, ALG_ARGON2ID13, parallelism 1) from libsodium, HKDF-SHA-512
 * from node:crypto. Dev only; run with `bun packages/crypto/vectors/generate-sign-passphrase.ts`.
 */
import { hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sodium from "libsodium-wrappers-sumo";
import { encode } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
const write = (name: string, data: unknown) =>
  writeFileSync(join(import.meta.dirname, name), `${JSON.stringify(data, null, 2)}\n`);

const signCases = [
  { name: "log entry", purpose: "log", fields: ["vault-1", 4, { hex: hex(bytes(32, 7)) }] },
  { name: "no fields", purpose: "release", fields: [] },
];
write(
  "sign-v1.json",
  signCases.map(({ name, purpose, fields }, index) => {
    const seed = bytes(32, 0x20 + index);
    const { publicKey } = sodium.crypto_sign_seed_keypair(seed);
    const parts = fields.map((field) =>
      typeof field === "object" ? Buffer.from(field.hex, "hex") : field,
    );
    const message = encode("kennwort/sig/v1", purpose, ...parts);
    const secretKey = sodium.crypto_sign_seed_keypair(seed).privateKey;
    const signature = sodium.crypto_sign_detached(message, secretKey);
    return {
      name,
      seed: hex(seed),
      publicKey: hex(publicKey),
      purpose,
      fields,
      signature: `01${hex(signature)}`,
    };
  }),
);

const kdf = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array) =>
  hex(new Uint8Array(hkdfSync("sha512", ikm, salt, info, 32)));
const passphraseCases = [
  { name: "ASCII passphrase", passphrase: "korrekt Pferd Batterie Heftklammer" },
  { name: "passphrase in NFD is read as NFKC", passphrase: "Bäckerei-Müller ①" },
];
write(
  "passphrase-v1.json",
  passphraseCases.map(({ name, passphrase }, index) => {
    const accountSalt = bytes(16, 0x30 + index);
    const secretKey = bytes(16, 0x60 + index);
    const accountId = bytes(16, 0x90 + index);
    const p1 = sodium.crypto_pwhash(
      32,
      new TextEncoder().encode(passphrase.normalize("NFKC")),
      accountSalt,
      3,
      64 * 1024 * 1024,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
    return {
      name,
      passphrase,
      accountSalt: hex(accountSalt),
      secretKey: hex(secretKey),
      accountId: hex(accountId),
      unlock: kdf(p1, secretKey, encode("kennwort/unlock-passphrase/v1", accountId)),
      login: kdf(p1, secretKey, encode("kennwort/login/v1", accountId)),
    };
  }),
);
