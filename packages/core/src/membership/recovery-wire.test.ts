import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { CompanyWire } from "./members.ts";
import { signPolicy, standardPolicy } from "./policy.ts";
import {
  DEPOSIT_PACKAGE_LENGTH,
  DepositWire,
  depositToWire,
  HeldDepositWire,
  RecoveryBundleWire,
  RecoveryGrantWire,
  RecoveryKeyUpload,
  recoveryKeyToWire,
} from "./recovery-wire.ts";

const k = (n: number, fill = 0) => new Uint8Array(n).fill(fill);
const deposit = { pkg: k(DEPOSIT_PACKAGE_LENGTH, 1), commitment: k(32, 2), signature: k(65, 3) };

describe("the deposit on the wire", () => {
  it("reads back what was written, at the exact lengths of F-08", () => {
    expect(DEPOSIT_PACKAGE_LENGTH).toBe(1194);
    expect(DepositWire.parse(depositToWire(deposit))).toEqual(deposit);
    expect(HeldDepositWire.parse({ deposit: depositToWire(deposit) })).toEqual({ deposit });
    for (const wrong of [
      { ...deposit, pkg: k(1193) },
      { ...deposit, commitment: k(31) },
      { ...deposit, signature: k(64) },
    ])
      expect(DepositWire.safeParse(depositToWire(wrong)).success).toBe(false);
  });

  it("carries an employee's sealed key block and state for the owner", () => {
    const wire = { deposit: depositToWire(deposit), keyBlock: "AQ", state: "Ag", stateCounter: 3 };
    expect(RecoveryBundleWire.parse(wire)).toEqual({
      deposit,
      keyBlock: Uint8Array.of(1),
      state: Uint8Array.of(2),
      stateCounter: 3,
    });
    expect(RecoveryBundleWire.safeParse({ ...wire, stateCounter: -1 }).success).toBe(false);
    expect(RecoveryBundleWire.safeParse({ ...wire, stateCounter: 1.5 }).success).toBe(false);
  });

  it("takes only a grant of the length of a wrapped key", () => {
    expect(RecoveryGrantWire.parse({ recoveryGrant: encodeBytes(k(1194)) }).recoveryGrant).toEqual(
      k(1194),
    );
    expect(RecoveryGrantWire.safeParse({ recoveryGrant: encodeBytes(k(1195)) }).success).toBe(
      false,
    );
  });
});

describe("a new recovery key on the wire", () => {
  const root = ed25519KeyPair(k(32, 1));
  const policy = signPolicy(root.secretKey, { ...standardPolicy(k(16, 4)), version: 1 });
  const grants = [{ accountId: k(16, 5), grant: k(1194, 6) }];

  it("reads back policy, public key and grants", () => {
    expect(RecoveryKeyUpload.parse(recoveryKeyToWire(policy, k(1216, 7), grants))).toEqual({
      policy,
      publicKey: k(1216, 7),
      grants,
    });
  });

  it("needs at least one grant, each for an account, and an X-Wing public key", () => {
    expect(RecoveryKeyUpload.safeParse(recoveryKeyToWire(policy, k(1216), [])).success).toBe(false);
    expect(RecoveryKeyUpload.safeParse(recoveryKeyToWire(policy, k(1215), grants)).success).toBe(
      false,
    );
    const shortId = [{ accountId: k(15), grant: k(1194) }];
    expect(RecoveryKeyUpload.safeParse(recoveryKeyToWire(policy, k(1216), shortId)).success).toBe(
      false,
    );
  });
});

describe("CompanyWire", () => {
  it("carries the recovery key's public half, none by default", () => {
    const base = { id: "weber", rootPublicKey: null };
    expect(CompanyWire.parse(base).recoveryPublicKey).toBeNull();
    expect(
      CompanyWire.parse({ ...base, recoveryPublicKey: encodeBytes(k(1216, 1)) }).recoveryPublicKey,
    ).toEqual(k(1216, 1));
    expect(CompanyWire.safeParse({ ...base, recoveryPublicKey: encodeBytes(k(32)) }).success).toBe(
      false,
    );
  });
});
