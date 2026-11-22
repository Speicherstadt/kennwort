/**
 * Writes root-change-v1.json: test vectors for a new company root key (F-14, P-07), computed
 * without the code under test: Ed25519 from libsodium, SHA-512/256 from node:crypto; only the
 * encoding of F-04 (encode) is shared, and box-v1.json pins it against libsodium already.
 * Dev only; run with `bun packages/crypto/vectors/generate-root-change.ts` after a deliberate format
 * change.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sodium from "libsodium-wrappers-sumo";
import { encode } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
const sha512_256 = (data: Uint8Array) =>
  new Uint8Array(createHash("sha512-256").update(data).digest());

const cases = [
  {
    name: "Jonas replaces the root after Sandra left Weber Haustechnik",
    start: 0x20,
    time: 1795e6,
  },
  { name: "another company, another time", start: 0x70, time: 1796e6 },
];

const vectors = cases.map(({ name, start, time }) => {
  const oldSeed = bytes(32, start);
  const newSeed = bytes(32, start + 0x40);
  const companyId = bytes(16, start + 1);
  const oldRoot = sodium.crypto_sign_seed_keypair(oldSeed);
  const newRoot = sodium.crypto_sign_seed_keypair(newSeed);
  const oldFingerprint = sha512_256(encode("kennwort/fp-root/v1", oldRoot.publicKey));
  const message = encode(
    "kennwort/root-change/v1",
    companyId,
    oldFingerprint,
    newRoot.publicKey,
    time,
  );
  const signed = (purpose: string, key: Uint8Array) =>
    `01${hex(sodium.crypto_sign_detached(encode("kennwort/sig/v1", purpose, message), key))}`;
  return {
    name,
    oldSeed: hex(oldSeed),
    newSeed: hex(newSeed),
    companyId: hex(companyId),
    time,
    oldRootPublicKey: hex(oldRoot.publicKey),
    newRootPublicKey: hex(newRoot.publicKey),
    oldFingerprint: hex(oldFingerprint),
    message: hex(message),
    oldSignature: signed("root-change", oldRoot.privateKey),
    newSignature: signed("root-change-accept", newRoot.privateKey),
  };
});

writeFileSync(
  join(import.meta.dirname, "root-change-v1.json"),
  `${JSON.stringify({ changes: vectors }, null, 2)}\n`,
);
