import { describe, expect, it } from "vitest";
import { newAccountKey, newKeyBlock, sealKeyBlock } from "./account.ts";
import {
  type Deposit,
  depositAccountKey,
  type RecoverInput,
  recoverAccountKey,
} from "./company-recovery.ts";
import { recoveryFingerprint } from "./fingerprint.ts";
import { sign } from "./sign.ts";
import { wrap, xwingKeyPair } from "./wrap.ts";

const root = new Uint8Array(32).fill(0x70);
const company = xwingKeyPair(new Uint8Array(32).fill(0x40));
const companyFp = recoveryFingerprint(company.publicKey);
const max = new Uint8Array(16).fill(0x4d);
const accountKey = newAccountKey();
const block = newKeyBlock(root);
const certified = { xwingPublicKey: block.xwing.publicKey, edPublicKey: block.ed.publicKey };
const deposit = depositAccountKey(
  { publicKey: company.publicKey, fingerprint: companyFp },
  accountKey,
  max,
  block.ed.secretKey,
);

const input = (changes: Partial<RecoverInput> = {}): RecoverInput => ({
  companyRecovery: { secretKey: company.secretKey, fingerprint: companyFp },
  deposit,
  accountId: max,
  certified,
  sealedKeyBlock: sealKeyBlock(accountKey, max, block),
  rootFingerprint: root,
  ...changes,
});

describe("company recovery (P-13)", () => {
  it("gives the owner the employee's AK when every check passes", () => {
    expect(recoverAccountKey(input())).toEqual({ ok: true, value: accountKey });
  });

  it("refuses a deposit without the employee's signature", () => {
    const stranger = newKeyBlock(root);
    const unsigned: Deposit = {
      ...deposit,
      signature: sign(stranger.ed.secretKey, "company-recovery", max, deposit.commitment),
    };
    expect(recoverAccountKey(input({ deposit: unsigned }))).toEqual({
      ok: false,
      error: "not-signed",
    });
  });

  it("refuses an AK the server wrapped itself under the employee's commitment", () => {
    const forged = {
      ...deposit,
      pkg: wrap({ publicKey: company.publicKey, fingerprint: companyFp }, newAccountKey(), {
        purpose: "company",
        context: [max],
      }),
    };
    expect(recoverAccountKey(input({ deposit: forged }))).toEqual({
      ok: false,
      error: "not-committed",
    });
  });

  it("refuses a package that the company key cannot open", () => {
    const other = xwingKeyPair(new Uint8Array(32).fill(0x41));
    const elsewhere = {
      ...deposit,
      pkg: wrap({ publicKey: other.publicKey, fingerprint: companyFp }, accountKey, {
        purpose: "company",
        context: [max],
      }),
    };
    expect(recoverAccountKey(input({ deposit: elsewhere }))).toEqual({
      ok: false,
      error: "not-authentic",
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
  it("refuses a recovery key that does not match the policy's fingerprint (the server's own key)", () => {
    const server = xwingKeyPair(new Uint8Array(32).fill(0x66));
    expect(() =>
      depositAccountKey(
        { publicKey: server.publicKey, fingerprint: companyFp },
        accountKey,
        max,
        block.ed.secretKey,
      ),
    ).toThrow("recovery key does not match the policy's fingerprint");
  });

  it("refuses an Account Key that is not 32 bytes", () => {
    expect(() =>
      depositAccountKey(
        { publicKey: company.publicKey, fingerprint: companyFp },
        new Uint8Array(16),
        max,
        block.ed.secretKey,
      ),
    ).toThrow("account key must be 32 bytes");
  });
});
