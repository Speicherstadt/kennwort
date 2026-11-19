/**
 * Writes box-v1.json: test vectors for F-01 (docs/sicherheitsdesign.md), computed with libsodium
 * (crypto_aead_xchacha20poly1305_ietf_encrypt), not with the code under test. Dev only; run with
 * `bun packages/crypto/vectors/generate-box.ts` after a deliberate change of the format.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sodium from "libsodium-wrappers-sumo";
import { encode, type Part } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);

type Case = { name: string; plaintext: Uint8Array; purpose: string; context: Part[] };
const cases: Case[] = [
  {
    name: "empty plaintext, no context",
    plaintext: new Uint8Array(),
    purpose: "test",
    context: [],
  },
  {
    name: "entry content bound to vault, entry and version",
    plaintext: new TextEncoder().encode('{"title":"Sparkasse","password":"Weber-2026!"}'),
    purpose: "entry",
    context: [bytes(16, 0x10), bytes(16, 0x20), 7],
  },
  {
    name: "purpose and context with non-ASCII text",
    plaintext: new TextEncoder().encode("Zugänge für Baustellen-Tablets"),
    purpose: "notiz-ä",
    context: ["Büro", 0],
  },
  {
    name: "1000 bytes",
    plaintext: bytes(1000, 3),
    purpose: "vault-key",
    context: [bytes(16, 1), 2],
  },
];

const key = bytes(32, 0x80);
const nonce = bytes(24, 0x40);
const vectors = cases.map(({ name, plaintext, purpose, context }) => {
  const aad = encode("kennwort/box/v1", purpose, ...context);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null,
    nonce,
    key,
  );
  return {
    name,
    key: hex(key),
    nonce: hex(nonce),
    purpose,
    context: context.map((part) => (part instanceof Uint8Array ? { hex: hex(part) } : part)),
    plaintext: hex(plaintext),
    aad: hex(aad),
    box: `01${hex(nonce)}${hex(sealed)}`,
  };
});
writeFileSync(join(import.meta.dirname, "box-v1.json"), `${JSON.stringify(vectors, null, 2)}\n`);
