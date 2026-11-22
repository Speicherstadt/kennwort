/**
 * Writes deposit-v1.json: test vectors for the company recovery deposit (F-08, P-13), computed
 * without the code under test: X-Wing from @noble/post-quantum (checked against the draft's vectors),
 * HKDF-SHA-512 from node:crypto, XChaCha20-Poly1305 and Ed25519 from libsodium.
 * Dev only; run with `bun packages/crypto/vectors/generate-deposit.ts` after a deliberate format change.
 */
import { createHash, hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import sodium from "libsodium-wrappers-sumo";
import { encode, type Part } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
const hkdf = (ikm: Uint8Array, ...info: Part[]) =>
  new Uint8Array(hkdfSync("sha512", ikm, new Uint8Array(), encode(...(info as [Part])), 32));
// SHA-512/256 (FIPS 180-4) from node:crypto, for the recovery key's fingerprint (F-04)
const sha512_256 = (data: Uint8Array) =>
  new Uint8Array(createHash("sha512-256").update(data).digest());

const cases = [
  { name: "Max's deposit at Weber Haustechnik", company: 0x57, account: 0x4d, start: 0x10 },
  { name: "Anna's deposit", company: 0x57, account: 0x41, start: 0x20 },
];

const vectors = cases.map(({ name, company, account, start }) => {
  const companyId = bytes(16, company);
  const accountId = bytes(16, account);
  const accountKey = bytes(32, start);
  const recoverySeed = bytes(32, start + 0x40);
  const kem = bytes(64, start + 0x80);
  const nonce = bytes(24, start + 0xc0);
  const employeeSeed = bytes(32, start + 0x30);
  const { publicKey } = xwing.keygen(recoverySeed);
  const fingerprint = sha512_256(encode("kennwort/fp-recovery/v1", publicKey));
  const commitment = hkdf(accountKey, "kennwort/key-commit/v1", "company", accountId);
  const { cipherText, sharedSecret } = xwing.encapsulate(publicKey, kem);
  const key = hkdf(sharedSecret, "kennwort/wrap/v1", fingerprint, "company", accountId);
  const aad = encode("kennwort/box/v1", "wrap", fingerprint, "company", accountId);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    accountKey,
    aad,
    null,
    nonce,
    key,
  );
  const pkg = Uint8Array.of(1, ...cipherText, 1, ...nonce, ...sealed);
  const signed = encode(
    "kennwort/sig/v1",
    "company-deposit",
    encode("kennwort/deposit/v1", companyId, accountId, fingerprint, commitment, pkg),
  );
  const employee = sodium.crypto_sign_seed_keypair(employeeSeed);
  const signature = sodium.crypto_sign_detached(signed, employee.privateKey);
  return {
    name,
    companyId: hex(companyId),
    accountId: hex(accountId),
    accountKey: hex(accountKey),
    recoverySeed: hex(recoverySeed),
    recoveryFingerprint: hex(fingerprint),
    kemRandomness: hex(kem),
    nonce: hex(nonce),
    employeeSeed: hex(employeeSeed),
    employeePublicKey: hex(employee.publicKey),
    commitment: hex(commitment),
    package: hex(pkg),
    signature: `01${hex(signature)}`,
  };
});
writeFileSync(join(import.meta.dirname, "deposit-v1.json"), `${JSON.stringify(vectors, null, 2)}\n`);
