import { describe, expect, it } from "vitest";
import vectors from "../vectors/rekey-v1.json" with { type: "json" };
import { comparisonCode } from "./fingerprint.ts";
import { isSignedRekey, type RekeyStatement, rekeyMessage, signRekey } from "./rekey.ts";
import { ed25519KeyPair } from "./sign.ts";
import { fromHex, hex } from "./test-helpers.ts";

type Hexed = (typeof vectors.proofs)[number]["statement"];

const statementOf = (s: Hexed): RekeyStatement => ({
  accountId: fromHex(s.accountId),
  accountSalt: fromHex(s.accountSalt),
  loginPublicKey: fromHex(s.loginPublicKey),
  recoveryLoginPublicKey: fromHex(s.recoveryLoginPublicKey),
  xwingPublicKey: fromHex(s.xwingPublicKey),
  edPublicKey: fromHex(s.edPublicKey),
  keyBlock: fromHex(s.keyBlock),
  state: fromHex(s.state),
  stateCounter: s.stateCounter,
  unlock: { passphrase: fromHex(s.unlock.passphrase), recovery: fromHex(s.unlock.recovery) },
  vaultKeys: s.vaultKeys.map((k) => ({
    vaultId: fromHex(k.vaultId),
    epoch: k.epoch,
    wrapped: fromHex(k.wrapped),
  })),
});

// F-11 v1, recomputed against libsodium (generate-rekey.ts)
describe.each(vectors.proofs)("F-11 rekey vector: $name", (vector) => {
  const statement = statementOf(vector.statement);
  const previous = ed25519KeyPair(fromHex(vector.previousSeed));

  it("encodes the statement to the same bytes", () => {
    expect(hex(rekeyMessage(statement))).toBe(vector.message);
  });

  it("signs to the same proof, which verifies under the previous key", () => {
    expect(hex(previous.publicKey)).toBe(vector.previousPublicKey);
    expect(hex(signRekey(previous.secretKey, statement))).toBe(vector.proof);
    expect(isSignedRekey(previous.publicKey, fromHex(vector.proof), statement)).toBe(true);
  });
});

describe.each(vectors.codes)("F-04 comparison code of $fingerprint", (vector) => {
  it("is the same 12 groups of 5 digits", () => {
    expect(comparisonCode(fromHex(vector.fingerprint))).toBe(vector.code);
  });
});
