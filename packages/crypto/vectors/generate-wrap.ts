/**
 * Writes wrap-v1.json: test vectors for F-02 (docs/sicherheitsdesign.md), computed without the code
 * under test: X-Wing from @noble/post-quantum (checked against the draft's vectors in
 * wrap.vectors.test.ts), HKDF-SHA-512 from node:crypto and XChaCha20-Poly1305 from libsodium.
 * Dev only; run with `bun packages/crypto/vectors/generate-wrap.ts` after a deliberate format change.
 */
import { hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import sodium from "libsodium-wrappers-sumo";
import { encode, type Part } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);

type Case = { name: string; payload: Uint8Array; purpose: string; context: Part[] };
const cases: Case[] = [
  {
    name: "vault key to a member",
    payload: bytes(32, 0xa0),
    purpose: "vault-key",
    context: [bytes(16, 0x10), 3, bytes(16, 0x30)],
  },
  { name: "empty payload, no context", payload: new Uint8Array(), purpose: "test", context: [] },
  {
    name: "entry key shared with a recipient",
    payload: bytes(32, 0xc0),
    purpose: "share",
    context: [bytes(16, 0x10), bytes(16, 0x20), bytes(16, 0x40)],
  },
  // K-307 part c (P-13): the three wraps of company recovery
  {
    name: "Account Key deposited to the company recovery key",
    payload: bytes(32, 0xd0),
    purpose: "company",
    context: [bytes(16, 0x4d)],
  },
  {
    name: "company recovery key to an owner",
    payload: bytes(32, 0xe0),
    purpose: "company-recovery-key",
    context: [bytes(16, 0x57), bytes(16, 0x4a)],
  },
  {
    name: "recovered Account Key to the employee's new device",
    payload: bytes(92, 0x00),
    purpose: "recovery-device",
    context: [bytes(32, 0x72)],
  },
];

const vectors = cases.map(({ name, payload, purpose, context }, index) => {
  const seed = bytes(32, 0x01 + index);
  const kem = bytes(64, 0x50 + index);
  const nonce = bytes(24, 0x40);
  const fingerprint = bytes(32, 0xf0);
  const { publicKey, secretKey } = xwing.keygen(seed);
  const { cipherText, sharedSecret } = xwing.encapsulate(publicKey, kem);
  const info = encode("kennwort/wrap/v1", fingerprint, purpose, ...context);
  const key = new Uint8Array(hkdfSync("sha512", sharedSecret, new Uint8Array(), info, 32));
  const aad = encode("kennwort/box/v1", "wrap", fingerprint, purpose, ...context);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(payload, aad, null, nonce, key);
  return {
    name,
    seed: hex(seed),
    secretKey: hex(secretKey),
    kemRandomness: hex(kem),
    nonce: hex(nonce),
    fingerprint: hex(fingerprint),
    purpose,
    context: context.map((part) => (part instanceof Uint8Array ? { hex: hex(part) } : part)),
    payload: hex(payload),
    package: `01${hex(cipherText)}01${hex(nonce)}${hex(sealed)}`,
  };
});
writeFileSync(join(import.meta.dirname, "wrap-v1.json"), `${JSON.stringify(vectors, null, 2)}\n`);
