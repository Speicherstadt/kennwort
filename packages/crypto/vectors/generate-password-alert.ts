/**
 * Writes password-alert-v1.json (F-10), computed without the code under test: Argon2id from
 * node:crypto (`argon2Sync`, as Bun implements it) and HKDF-SHA-512 from node:crypto, with the
 * F-04 encoding written out by hand. Dev only; run with
 * `bun packages/crypto/vectors/generate-password-alert.ts`.
 */
import { argon2Sync, hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

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
  { name: "ASCII password", password: "Kupfer-Rohr-18!", host: "portal.weber-haustechnik.test" },
  // The password goes in as typed, not normalised: NFD stays NFD
  {
    name: "password in NFD, punycode host",
    password: "Bäcker-Straße-7",
    host: "xn--bcker-gra.test",
  },
  { name: "one character", password: "x", host: "localhost" },
];

writeFileSync(
  join(import.meta.dirname, "password-alert-v1.json"),
  `${JSON.stringify(
    cases.map(({ name, password, host }, index) => {
      const salt = bytes(16, 0x40 + index * 16);
      const tag = argon2Sync("argon2id", {
        message: utf8(password.normalize(index === 1 ? "NFD" : "NFC")),
        nonce: salt,
        parallelism: 1,
        tagLength: 4,
        memory: 1024,
        passes: 2,
      });
      const info = enc(utf8("kennwort/alert-host/v1"), utf8(host));
      const hostTag = new Uint8Array(hkdfSync("sha512", salt, new Uint8Array(0), info, 32)).slice(
        0,
        16,
      );
      return {
        name,
        password: password.normalize(index === 1 ? "NFD" : "NFC"),
        host,
        salt: hex(salt),
        tag: hex(tag),
        hostTag: hex(hostTag),
      };
    }),
    null,
    2,
  )}\n`,
);
