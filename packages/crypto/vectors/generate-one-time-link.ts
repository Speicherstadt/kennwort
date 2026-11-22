/**
 * Writes one-time-link-v1.json (F-15), computed without the code under test: Argon2id from
 * node:crypto (`argon2Sync`, as Bun implements it), HKDF-SHA-512 from node:crypto and
 * XChaCha20-Poly1305 from libsodium, with the F-04 encoding written out by hand. Dev only; run
 * with `bun packages/crypto/vectors/generate-one-time-link.ts`.
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

type Case = { name: string; plaintext: Uint8Array; passphrase?: string };
const cases: Case[] = [
  {
    name: "without passphrase, the content of a login",
    plaintext: utf8(
      '{"version":1,"title":"WLAN Baustelle","fields":[{"label":"Passwort","value":"Rohr-Ventil-2026!","secret":true}]}',
    ),
  },
  { name: "without passphrase, empty plaintext", plaintext: new Uint8Array() },
  // NFKC: the passphrase typed in NFD and with a compatibility character (ﬁ) gives the same key
  // as in NFKC; the vector stores what was typed
  {
    name: "with a passphrase in NFD with a ligature, normalised to NFKC",
    passphrase: "Bäcker-Straße ﬁnal".normalize("NFD"),
    plaintext: utf8("Tür-Code Lager: 4711"),
  },
];

/** p₁ of F-15: Argon2id with the v1 parameters, the HKDF salt of a link with a passphrase */
const stretch = (passphrase: string, salt: Uint8Array) =>
  argon2Sync("argon2id", {
    message: utf8(passphrase.normalize("NFKC")),
    nonce: salt,
    parallelism: 1,
    tagLength: 32,
    memory: 64 * 1024,
    passes: 3,
  });

const vector = ({ name, plaintext, passphrase }: Case, index: number) => {
  const secret = bytes(32, 0x10 + index * 32);
  const nonce = bytes(24, 0x80 + index * 24);
  const salt = passphrase === undefined ? undefined : bytes(16, 0x40 + index * 16);
  const kind = Uint8Array.of(salt ? 1 : 0);
  const hkdfSalt = salt && passphrase !== undefined ? stretch(passphrase, salt) : new Uint8Array(0);
  const context = salt ? [kind, salt] : [kind];
  const key = new Uint8Array(
    hkdfSync("sha512", secret, hkdfSalt, enc(utf8("kennwort/link/v1"), ...context), 32),
  );
  const aad = enc(utf8("kennwort/box/v1"), utf8("link"), ...context);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null,
    nonce,
    key,
  );
  const link = Buffer.concat([
    Buffer.of(0x01),
    kind,
    salt ?? new Uint8Array(0),
    Buffer.of(0x01),
    nonce,
    sealed,
  ]);
  return {
    name,
    secret: hex(secret),
    nonce: hex(nonce),
    ...(salt ? { salt: hex(salt), passphrase } : {}),
    plaintext: hex(plaintext),
    key: hex(key),
    link: hex(link),
  };
};

writeFileSync(
  join(import.meta.dirname, "one-time-link-v1.json"),
  `${JSON.stringify(cases.map(vector), null, 2)}\n`,
);
