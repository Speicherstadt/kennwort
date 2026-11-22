import { describe, expect, it } from "vitest";
import { comparisonCode } from "./fingerprint.ts";
import {
  isSignedRekey,
  REKEY_PURPOSE,
  type RekeyStatement,
  rekeyMessage,
  signRekey,
} from "./rekey.ts";
import { ed25519KeyPair, sign } from "./sign.ts";

const filled = (length: number, value: number) => new Uint8Array(length).fill(value);

const statement: RekeyStatement = {
  accountId: filled(16, 1),
  accountSalt: filled(16, 2),
  loginPublicKey: filled(32, 3),
  recoveryLoginPublicKey: filled(32, 4),
  xwingPublicKey: filled(1216, 5),
  edPublicKey: filled(32, 6),
  keyBlock: filled(100, 7),
  state: filled(80, 8),
  stateCounter: 3,
  unlock: { passphrase: filled(73, 9), recovery: filled(73, 10) },
  vaultKeys: [
    { vaultId: filled(16, 11), epoch: 0, wrapped: filled(1194, 12) },
    { vaultId: filled(16, 11), epoch: 1, wrapped: filled(1194, 13) },
  ],
};

const previous = ed25519KeyPair(filled(32, 42));
const proof = signRekey(previous.secretKey, statement);

describe("the proof of new keys (F-11)", () => {
  it("is an F-03 signature for the purpose account-rekey over the statement", () => {
    expect(REKEY_PURPOSE).toBe("account-rekey");
    expect(proof).toEqual(sign(previous.secretKey, "account-rekey", rekeyMessage(statement)));
    expect(isSignedRekey(previous.publicKey, proof, statement)).toBe(true);
  });

  it("starts with its label, so it never reads as another statement", () => {
    expect(new TextDecoder().decode(rekeyMessage(statement).subarray(4, 21))).toBe(
      "kennwort/rekey/v1",
    );
  });

  it("does not hold for another key", () => {
    const other = ed25519KeyPair(filled(32, 43));
    expect(isSignedRekey(other.publicKey, proof, statement)).toBe(false);
  });

  const changes: [string, RekeyStatement][] = [
    ["account", { ...statement, accountId: filled(16, 99) }],
    ["salt", { ...statement, accountSalt: filled(16, 99) }],
    ["sign-in key", { ...statement, loginPublicKey: filled(32, 99) }],
    ["recovery sign-in key", { ...statement, recoveryLoginPublicKey: filled(32, 99) }],
    ["X-Wing key", { ...statement, xwingPublicKey: filled(1216, 99) }],
    ["Ed25519 key", { ...statement, edPublicKey: filled(32, 99) }],
    ["key block", { ...statement, keyBlock: filled(100, 99) }],
    ["state", { ...statement, state: filled(80, 99) }],
    ["counter", { ...statement, stateCounter: 4 }],
    [
      "AK under the passphrase",
      { ...statement, unlock: { ...statement.unlock, passphrase: filled(73, 99) } },
    ],
    [
      "AK under the Recovery Key",
      { ...statement, unlock: { ...statement.unlock, recovery: filled(73, 99) } },
    ],
    ["a dropped vault key", { ...statement, vaultKeys: statement.vaultKeys.slice(1) }],
    [
      "the vault keys in another order",
      { ...statement, vaultKeys: [...statement.vaultKeys].reverse() },
    ],
    [
      "another vault",
      {
        ...statement,
        vaultKeys: [
          { ...statement.vaultKeys[0], vaultId: filled(16, 99) } as never,
          statement.vaultKeys[1] as never,
        ],
      },
    ],
    [
      "another epoch",
      {
        ...statement,
        vaultKeys: [
          { ...statement.vaultKeys[0], epoch: 5 } as never,
          statement.vaultKeys[1] as never,
        ],
      },
    ],
    [
      "another wrapped key",
      {
        ...statement,
        vaultKeys: [
          { ...statement.vaultKeys[0], wrapped: filled(1194, 99) } as never,
          statement.vaultKeys[1] as never,
        ],
      },
    ],
  ];

  it.each(changes)("does not hold once the %s changes", (_, changed) => {
    expect(isSignedRekey(previous.publicKey, proof, changed)).toBe(false);
  });

  it("does not hold as a signature for another purpose", () => {
    const renewal = sign(previous.secretKey, "unlock-renewal", rekeyMessage(statement));
    expect(isSignedRekey(previous.publicKey, renewal, statement)).toBe(false);
  });
});

describe("the comparison code of a fingerprint (F-04)", () => {
  it("is 60 digits in 12 groups of 5", () => {
    expect(comparisonCode(filled(32, 7))).toMatch(/^(\d{5} ){11}\d{5}$/);
  });

  it("differs for fingerprints that differ in the last byte", () => {
    const other = filled(32, 7);
    other[31] = 8;
    expect(comparisonCode(other)).not.toBe(comparisonCode(filled(32, 7)));
  });

  it("refuses anything but a 32-byte fingerprint", () => {
    expect(() => comparisonCode(filled(31, 7))).toThrow("fingerprint must be 32 bytes");
    expect(() => comparisonCode(filled(33, 7))).toThrow(RangeError);
  });
});
