import { describe, expect, it } from "vitest";
import vectors from "../vectors/deposit-v1.json" with { type: "json" };
import { depositCommitment, depositMessage, isSignedDeposit } from "./company-recovery.ts";
import { recoveryFingerprint } from "./fingerprint.ts";
import { ed25519KeyPair, sign } from "./sign.ts";
import { fromHex, hex } from "./test-helpers.ts";
import { unwrap, wrapWithRandomness, xwingKeyPair } from "./wrap.ts";

// F-08 v1: every part of a deposit, recomputed against libsodium and node:crypto (generate-deposit.ts)
describe.each(vectors)("F-08 deposit vector: $name", (vector) => {
  const place = { companyId: fromHex(vector.companyId), accountId: fromHex(vector.accountId) };
  const accountKey = fromHex(vector.accountKey);
  const recovery = xwingKeyPair(fromHex(vector.recoverySeed));
  const fingerprint = fromHex(vector.recoveryFingerprint);
  const where = { purpose: "company", context: [place.accountId] };

  it("names the recovery key by its fingerprint (F-04)", () => {
    expect(hex(recoveryFingerprint(recovery.publicKey))).toBe(vector.recoveryFingerprint);
  });

  it("commits to AK", () => {
    expect(hex(depositCommitment(accountKey, place.accountId))).toBe(vector.commitment);
  });

  it("wraps AK to the same package, which the recovery key opens", () => {
    const pkg = wrapWithRandomness(
      { publicKey: recovery.publicKey, fingerprint },
      accountKey,
      where,
      {
        kem: fromHex(vector.kemRandomness),
        nonce: fromHex(vector.nonce),
      },
    );
    expect(hex(pkg)).toBe(vector.package);
    expect(unwrap(recovery.secretKey, fingerprint, pkg, where)).toEqual({
      ok: true,
      value: accountKey,
    });
  });

  it("signs to the same signature, which verifies as the employee's deposit", () => {
    const seed = fromHex(vector.employeeSeed);
    expect(hex(ed25519KeyPair(seed).publicKey)).toBe(vector.employeePublicKey);
    const message = depositMessage(
      place,
      fingerprint,
      fromHex(vector.commitment),
      fromHex(vector.package),
    );
    expect(hex(sign(seed, "company-deposit", message))).toBe(vector.signature);
    const deposit = {
      pkg: fromHex(vector.package),
      commitment: fromHex(vector.commitment),
      signature: fromHex(vector.signature),
    };
    expect(isSignedDeposit(fromHex(vector.employeePublicKey), deposit, place, fingerprint)).toBe(
      true,
    );
  });
});
