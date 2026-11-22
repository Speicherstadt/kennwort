import { describe, expect, it } from "vitest";
import { newAccountKey, newKeyBlock, sealKeyBlock } from "./account.ts";
import { keyCommitment } from "./commitment.ts";
import {
  type Deposit,
  depositAccountKey,
  depositCommitment,
  depositMessage,
  holdsAccountKey,
  isSignedDeposit,
  type RecoverInput,
  recoverAccountKey,
} from "./company-recovery.ts";
import { recoveryFingerprint } from "./fingerprint.ts";
import { sign } from "./sign.ts";
import { wrap, xwingKeyPair } from "./wrap.ts";

const root = new Uint8Array(32).fill(0x70);
const company = xwingKeyPair(new Uint8Array(32).fill(0x40));
const companyFp = recoveryFingerprint(company.publicKey);
const recipient = { publicKey: company.publicKey, fingerprint: companyFp };
const max = new Uint8Array(16).fill(0x4d);
const weber = new Uint8Array(16).fill(0x57);
const place = { companyId: weber, accountId: max };
const wrapPlace = { purpose: "company", context: [max] };
const accountKey = newAccountKey();
const block = newKeyBlock(root);
const certified = { xwingPublicKey: block.xwing.publicKey, edPublicKey: block.ed.publicKey };
const deposit = depositAccountKey(recipient, accountKey, place, block.ed.secretKey);

const input = (changes: Partial<RecoverInput> = {}): RecoverInput => ({
  companyRecovery: { secretKey: company.secretKey, fingerprint: companyFp },
  deposit,
  place,
  certified,
  sealedKeyBlock: sealKeyBlock(accountKey, max, block),
  rootFingerprint: root,
  ...changes,
});

/** A deposit the employee really signed, around whatever package and commitment are given */
const signedBy = (pkg: Uint8Array, commitment: Uint8Array): Deposit => ({
  pkg,
  commitment,
  signature: sign(
    block.ed.secretKey,
    "company-deposit",
    depositMessage(place, companyFp, commitment, pkg),
  ),
});

describe("company recovery (P-13)", () => {
  it("gives the owner the employee's AK when every check passes", () => {
    expect(recoverAccountKey(input())).toEqual({ ok: true, value: accountKey });
  });

  it("refuses a deposit without the employee's signature", () => {
    const stranger = newKeyBlock(root);
    const unsigned: Deposit = {
      ...deposit,
      signature: sign(
        stranger.ed.secretKey,
        "company-deposit",
        depositMessage(place, companyFp, deposit.commitment, deposit.pkg),
      ),
    };
    expect(recoverAccountKey(input({ deposit: unsigned }))).toEqual({
      ok: false,
      error: "not-signed",
    });
  });

  it("refuses an AK the server wrapped itself under the employee's signature", () => {
    const forged = { ...deposit, pkg: wrap(recipient, newAccountKey(), wrapPlace) };
    expect(recoverAccountKey(input({ deposit: forged }))).toEqual({
      ok: false,
      error: "not-signed",
    });
  });

  it("refuses a deposit the employee signed for another company or account", () => {
    expect(
      recoverAccountKey(input({ place: { ...place, companyId: new Uint8Array(16) } })),
    ).toEqual({ ok: false, error: "not-signed" });
    expect(
      recoverAccountKey(input({ place: { ...place, accountId: new Uint8Array(16).fill(1) } })),
    ).toEqual({ ok: false, error: "not-signed" });
  });

  it("refuses a deposit made for an earlier recovery key, even if the new key could open it", () => {
    const earlier = xwingKeyPair(new Uint8Array(32).fill(0x41));
    const old = depositAccountKey(
      { publicKey: earlier.publicKey, fingerprint: recoveryFingerprint(earlier.publicKey) },
      accountKey,
      place,
      block.ed.secretKey,
    );
    expect(recoverAccountKey(input({ deposit: old }))).toEqual({ ok: false, error: "not-signed" });
  });

  it("refuses a signed package that the company key cannot open", () => {
    const other = xwingKeyPair(new Uint8Array(32).fill(0x41));
    const elsewhere = signedBy(
      wrap({ publicKey: other.publicKey, fingerprint: companyFp }, accountKey, wrapPlace),
      deposit.commitment,
    );
    expect(recoverAccountKey(input({ deposit: elsewhere }))).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });

  it("refuses a signed AK that does not match the signed commitment", () => {
    const mismatched = signedBy(wrap(recipient, newAccountKey(), wrapPlace), deposit.commitment);
    expect(recoverAccountKey(input({ deposit: mismatched }))).toEqual({
      ok: false,
      error: "not-committed",
    });
  });

  it("refuses when the key block is not the employee's certified one", () => {
    const fake = sealKeyBlock(accountKey, max, newKeyBlock(root));
    expect(recoverAccountKey(input({ sealedKeyBlock: fake }))).toEqual({
      ok: false,
      error: "wrong-key-block",
    });
    expect(
      recoverAccountKey(input({ sealedKeyBlock: sealKeyBlock(newAccountKey(), max, block) })),
    ).toEqual({
      ok: false,
      error: "wrong-key-block",
    });
  });

  it("refuses a key block that pins another root than the owner's", () => {
    const pinsOther = sealKeyBlock(accountKey, max, {
      ...block,
      rootFingerprint: new Uint8Array(32).fill(1),
    });
    expect(recoverAccountKey(input({ sealedKeyBlock: pinsOther }))).toEqual({
      ok: false,
      error: "wrong-root",
    });
  });

  it("checks the certified bundle in both halves", () => {
    const otherBlock = newKeyBlock(root);
    expect(
      recoverAccountKey(
        input({ certified: { ...certified, xwingPublicKey: otherBlock.xwing.publicKey } }),
      ),
    ).toEqual({ ok: false, error: "wrong-key-block" });
  });
});

describe("depositing for company recovery", () => {
  it("wraps AK to the recovery key under purpose company and the account", () => {
    const opened = recoverAccountKey(input());
    expect(opened.ok).toBe(true);
    expect(deposit.commitment).toEqual(keyCommitment(accountKey, "company", max));
    expect(depositCommitment(accountKey, max)).toEqual(deposit.commitment);
  });

  it("signs company, account, recovery fingerprint, commitment and package", () => {
    expect(isSignedDeposit(block.ed.publicKey, deposit, place, companyFp)).toBe(true);
    expect(isSignedDeposit(block.ed.publicKey, deposit, place, new Uint8Array(32))).toBe(false);
    const swapped = { ...deposit, pkg: deposit.pkg.with(-1, (deposit.pkg.at(-1) ?? 0) ^ 1) };
    expect(isSignedDeposit(block.ed.publicKey, swapped, place, companyFp)).toBe(false);
    const recommitted = { ...deposit, commitment: new Uint8Array(32) };
    expect(isSignedDeposit(block.ed.publicKey, recommitted, place, companyFp)).toBe(false);
  });

  it("lets the employee check that the server holds its own deposit for the key in force", () => {
    const pk = block.ed.publicKey;
    expect(holdsAccountKey(deposit, accountKey, pk, place, companyFp)).toBe(true);
    expect(holdsAccountKey(deposit, newAccountKey(), pk, place, companyFp)).toBe(false);
    expect(holdsAccountKey(deposit, accountKey, pk, place, new Uint8Array(32))).toBe(false);
  });

  it("refuses a recovery key that does not match the policy's fingerprint (the server's own key)", () => {
    const server = xwingKeyPair(new Uint8Array(32).fill(0x66));
    expect(() =>
      depositAccountKey(
        { publicKey: server.publicKey, fingerprint: companyFp },
        accountKey,
        place,
        block.ed.secretKey,
      ),
    ).toThrow("recovery key does not match the policy's fingerprint");
  });

  it("refuses an Account Key that is not 32 bytes", () => {
    expect(() =>
      depositAccountKey(recipient, new Uint8Array(16), place, block.ed.secretKey),
    ).toThrow("account key must be 32 bytes");
  });
});
