/**
 * Writes rekey-v1.json: test vectors for the account's new keys (F-11, P-12) and for the comparison
 * code of a fingerprint (F-04), computed without the code under test: Ed25519 from libsodium, the
 * code from the fingerprint's hex text as one big number.
 * Dev only; run with `bun packages/crypto/vectors/generate-rekey.ts` after a deliberate format change.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sodium from "libsodium-wrappers-sumo";
import { encode } from "../src/encoding.ts";

await sodium.ready;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (length: number, start: number) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);

const cases = [
  { name: "Anna renews her keys at Weber Haustechnik", start: 0x10, vaults: 2, counter: 7 },
  { name: "Max without a vault yet", start: 0x60, vaults: 0, counter: 1 },
];

const vectors = cases.map(({ name, start, vaults, counter }) => {
  const previousSeed = bytes(32, start);
  const statement = {
    accountId: bytes(16, start + 1),
    accountSalt: bytes(16, start + 2),
    loginPublicKey: bytes(32, start + 3),
    recoveryLoginPublicKey: bytes(32, start + 4),
    xwingPublicKey: bytes(1216, start + 5),
    edPublicKey: bytes(32, start + 6),
    keyBlock: bytes(150, start + 7),
    state: bytes(90, start + 8),
    stateCounter: counter,
    unlock: { passphrase: bytes(73, start + 9), recovery: bytes(73, start + 10) },
    vaultKeys: Array.from({ length: vaults }, (_, i) => ({
      vaultId: bytes(16, start + 0x20 + i),
      epoch: i,
      wrapped: bytes(1194, start + 0x30 + i),
    })),
  };
  const message = encode(
    "kennwort/rekey/v1",
    statement.accountId,
    statement.accountSalt,
    statement.loginPublicKey,
    statement.recoveryLoginPublicKey,
    statement.xwingPublicKey,
    statement.edPublicKey,
    statement.keyBlock,
    statement.state,
    statement.stateCounter,
    statement.unlock.passphrase,
    statement.unlock.recovery,
    encode(...statement.vaultKeys.map((k) => encode(k.vaultId, k.epoch, k.wrapped))),
  );
  const signed = encode("kennwort/sig/v1", "account-rekey", message);
  const previous = sodium.crypto_sign_seed_keypair(previousSeed);
  const proof = sodium.crypto_sign_detached(signed, previous.privateKey);
  return {
    name,
    previousSeed: hex(previousSeed),
    previousPublicKey: hex(previous.publicKey),
    statement: {
      ...statement,
      accountId: hex(statement.accountId),
      accountSalt: hex(statement.accountSalt),
      loginPublicKey: hex(statement.loginPublicKey),
      recoveryLoginPublicKey: hex(statement.recoveryLoginPublicKey),
      xwingPublicKey: hex(statement.xwingPublicKey),
      edPublicKey: hex(statement.edPublicKey),
      keyBlock: hex(statement.keyBlock),
      state: hex(statement.state),
      unlock: {
        passphrase: hex(statement.unlock.passphrase),
        recovery: hex(statement.unlock.recovery),
      },
      vaultKeys: statement.vaultKeys.map((k) => ({
        vaultId: hex(k.vaultId),
        epoch: k.epoch,
        wrapped: hex(k.wrapped),
      })),
    },
    message: hex(message),
    proof: `01${hex(proof)}`,
  };
});

// The comparison code: the fingerprint's hex text read as one number, the last 60 decimal digits
const codes = [
  bytes(32, 0),
  bytes(32, 0xe0),
  new Uint8Array(32).fill(0xff),
  new Uint8Array(32),
].map((fingerprint) => {
  const digits = (BigInt(`0x${hex(fingerprint)}`) % 10n ** 60n).toString().padStart(60, "0");
  return { fingerprint: hex(fingerprint), code: digits.match(/.{5}/g)?.join(" ") };
});

writeFileSync(
  join(import.meta.dirname, "rekey-v1.json"),
  `${JSON.stringify({ proofs: vectors, codes }, null, 2)}\n`,
);
