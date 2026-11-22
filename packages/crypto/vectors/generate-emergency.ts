/**
 * Writes emergency-v1.json: test vectors for emergency access (F-09, P-14), computed without the
 * code under test: X-Wing from @noble/post-quantum (checked against the draft's vectors),
 * HKDF-SHA-512 and SHA-512/256 from node:crypto, XChaCha20-Poly1305 and Ed25519 from libsodium,
 * and the encoding of F-04 written out again here rather than imported from src/. Dev only; run with `bun packages/crypto/vectors/generate-emergency.ts` after a deliberate format
 * change.
 */
import { createHash, hkdfSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import sodium from "libsodium-wrappers-sumo";

/** F-04 enc(t₁, …, tₙ), written from the spec: 4-byte big-endian length, then the part's bytes */
type Part = Uint8Array | string | number;
const partBytes = (part: Part) => {
  if (typeof part === "string") return new Uint8Array(Buffer.from(part.normalize("NFC"), "utf8"));
  if (typeof part === "number") {
    const out = Buffer.alloc(8);
    out.writeBigUInt64BE(BigInt(part));
    return new Uint8Array(out);
  }
  return part;
};
const encode = (...parts: Part[]) =>
  new Uint8Array(
    Buffer.concat(
      parts.map(partBytes).flatMap((part) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        return [length, part];
      }),
    ),
  );

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
const hkdf = (ikm: Uint8Array, ...info: Part[]) =>
  new Uint8Array(hkdfSync("sha512", ikm, new Uint8Array(), encode(...info), 32));
const sha512_256 = (data: Uint8Array) =>
  new Uint8Array(createHash("sha512-256").update(data).digest());
const signed = (seed: Uint8Array, purpose: string, message: Uint8Array) => {
  const { privateKey } = sodium.crypto_sign_seed_keypair(seed);
  const signature = sodium.crypto_sign_detached(
    encode("kennwort/sig/v1", purpose, message),
    privateKey,
  );
  return `01${hex(signature)}`;
};

/** F-02 with fixed randomness, as wrap-v1.json computes it */
const wrapped = (
  publicKey: Uint8Array,
  fingerprint: Uint8Array,
  payload: Uint8Array,
  purpose: string,
  context: Part[],
  kem: Uint8Array,
  nonce: Uint8Array,
) => {
  const { cipherText, sharedSecret } = xwing.encapsulate(publicKey, kem);
  const key = hkdf(sharedSecret, "kennwort/wrap/v1", fingerprint, purpose, ...context);
  const aad = encode("kennwort/box/v1", "wrap", fingerprint, purpose, ...context);
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(payload, aad, null, nonce, key);
  return Uint8Array.of(1, ...cipherText, 1, ...nonce, ...sealed);
};

const companyId = bytes(16, 0x57);
const grantorId = bytes(16, 0x4a);
const granteeId = bytes(16, 0x41);
const grantorSeed = bytes(32, 0x60);
const granteeXwingSeed = bytes(32, 0x70);
const granteeEdSeed = bytes(32, 0x80);
const grantee = xwing.keygen(granteeXwingSeed);
const granteeEd = sodium.crypto_sign_seed_keypair(granteeEdSeed);
const granteeFingerprint = sha512_256(
  encode("kennwort/fp/v1", grantee.publicKey, granteeEd.publicKey),
);
const waitSeconds = 7 * 86_400;
const time = 1_800_000_000;

const viewCase = () => {
  const vaultId = bytes(16, 0xb0);
  const epoch = 2;
  const vaultKey = bytes(32, 0xa0);
  const commitment = hkdf(vaultKey, "kennwort/key-commit/v1", "vault-key", vaultId, epoch);
  const context = [vaultId, epoch, grantorId, granteeId];
  const kem = bytes(64, 0x10);
  const nonce = bytes(24, 0x90);
  const pkg = wrapped(
    grantee.publicKey,
    granteeFingerprint,
    vaultKey,
    "emergency",
    context,
    kem,
    nonce,
  );
  const items = encode(encode(vaultId, epoch, commitment));
  const message = encode(
    "kennwort/emergency/v1",
    companyId,
    grantorId,
    granteeId,
    granteeFingerprint,
    "view",
    waitSeconds,
    time,
    new Uint8Array(),
    items,
  );
  return {
    name: "Jonas gives Anna view access to Büro",
    digest: hex(sha512_256(message)),
    scope: "view",
    key: hex(vaultKey),
    vaultId: hex(vaultId),
    epoch,
    kemRandomness: hex(kem),
    nonce: hex(nonce),
    commitment: hex(commitment),
    package: hex(pkg),
    message: hex(message),
    signature: signed(grantorSeed, "emergency", message),
  };
};

const fullCase = () => {
  const accountKey = bytes(32, 0xd0);
  const commitment = hkdf(accountKey, "kennwort/key-commit/v1", "emergency-account", grantorId);
  const kem = bytes(64, 0x20);
  const nonce = bytes(24, 0xa0);
  const pkg = wrapped(
    grantee.publicKey,
    granteeFingerprint,
    accountKey,
    "emergency-account",
    [grantorId, granteeId],
    kem,
    nonce,
  );
  const message = encode(
    "kennwort/emergency/v1",
    companyId,
    grantorId,
    granteeId,
    granteeFingerprint,
    "full",
    waitSeconds,
    time,
    commitment,
    encode(),
  );
  return {
    name: "Jonas gives Anna full access",
    digest: hex(sha512_256(message)),
    scope: "full",
    key: hex(accountKey),
    kemRandomness: hex(kem),
    nonce: hex(nonce),
    commitment: hex(commitment),
    package: hex(pkg),
    message: hex(message),
    signature: signed(grantorSeed, "emergency", message),
  };
};

const grants = [viewCase(), fullCase()];
// Each statement names the grant it is about by its time and digest: the view grant's here
const named = grants[0] as { digest: string };
const statements = [
  { purpose: "emergency-request", at: time + 3600, seed: granteeEdSeed },
  { purpose: "emergency-objection", at: time + 3600, seed: grantorSeed },
  { purpose: "emergency-approval", at: time + 3600, seed: grantorSeed },
  { purpose: "emergency-revocation", at: time, seed: grantorSeed },
].map(({ purpose, at, seed }) => {
  const message = encode(
    "kennwort/emergency-statement/v1",
    companyId,
    grantorId,
    granteeId,
    time,
    Buffer.from(named.digest, "hex"),
    at,
  );
  return {
    purpose,
    grantTime: time,
    grantDigest: named.digest,
    at,
    message: hex(message),
    signature: signed(seed, purpose, message),
  };
});

const vectors = {
  companyId: hex(companyId),
  grantorId: hex(grantorId),
  granteeId: hex(granteeId),
  grantorSeed: hex(grantorSeed),
  grantorPublicKey: hex(sodium.crypto_sign_seed_keypair(grantorSeed).publicKey),
  granteeXwingSeed: hex(granteeXwingSeed),
  granteeEdSeed: hex(granteeEdSeed),
  granteePublicKey: hex(granteeEd.publicKey),
  granteeFingerprint: hex(granteeFingerprint),
  waitSeconds,
  time,
  grants,
  statements,
};
writeFileSync(
  join(import.meta.dirname, "emergency-v1.json"),
  `${JSON.stringify(vectors, null, 2)}\n`,
);
