import {
  depositAccountKey,
  ed25519KeyPair,
  passphraseKeysWith,
  rootFingerprint,
  xwingKeyPair,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createAccount } from "../account/create.ts";
import { openRecoveryPackage, stateHash } from "../account/pairing.ts";
import { emptyState, sealState } from "../account/state.ts";
import { certify } from "./certificate.ts";
import { standardPolicy, type UnsignedPolicy } from "./policy.ts";
import {
  type ApproveInput,
  approveRecovery,
  checkRecovered,
  depositFor,
} from "./recovery-deposit.ts";
import { newCompanyRecoveryKey } from "./recovery-key.ts";

// K-307 part c: Max deposits his AK; when he lost everything, Jonas recovers it for his new device
const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const pinned = rootFingerprint(root.publicKey);
const weber = new Uint8Array(16).fill(0xc0);
const max = createAccount("Max Rohr Zange", emptyState(pinned), { derive: quick });
const maxCert = certify(root.secretKey, {
  accountId: max.accountId,
  xwingPublicKey: max.keyBlock.xwing.publicKey,
  edPublicKey: max.keyBlock.ed.publicKey,
  companyId: weber,
  role: "member",
  issuedAt: 1,
});
const key = newCompanyRecoveryKey(new Uint8Array(32).fill(7));
const on: UnsignedPolicy = {
  ...standardPolicy(weber),
  version: 2,
  companyRecovery: { enabled: true, fingerprint: key.fingerprint },
};
const depositor = { accountKey: max.accountKey, accountId: max.accountId, keyBlock: max.keyBlock };
const place = { companyId: weber, accountId: max.accountId };
const made = () => {
  const decided = depositFor(on, key.publicKey, undefined, depositor);
  if (decided.kind !== "deposit") throw new Error("expected a deposit");
  return decided.deposit;
};

describe("depositFor", () => {
  it("deposits to the key the policy names, signed by the account", () => {
    const deposit = made();
    expect(deposit.pkg).toHaveLength(1194);
    const back = approveRecovery(input({ bundle: { ...bundle, deposit } }));
    expect(back.ok).toBe(true);
  });

  it("deposits nothing while the policy has company recovery off", () => {
    expect(depositFor(standardPolicy(weber), key.publicKey, undefined, depositor)).toEqual({
      kind: "off",
    });
  });

  it("never deposits to a key the policy does not name, nor without a key", () => {
    const servers = newCompanyRecoveryKey();
    expect(depositFor(on, servers.publicKey, undefined, depositor)).toEqual({ kind: "other-key" });
    expect(depositFor(on, null, undefined, depositor)).toEqual({ kind: "other-key" });
  });

  it("keeps its own deposit for the key in force", () => {
    expect(depositFor(on, key.publicKey, made(), depositor)).toEqual({ kind: "kept" });
  });

  it("deposits anew when the held deposit is for an earlier key, another AK or made up", () => {
    const earlier = newCompanyRecoveryKey();
    const old = depositAccountKey(earlier, max.accountKey, place, max.keyBlock.ed.secretKey);
    const otherAk = depositAccountKey(key, new Uint8Array(32), place, max.keyBlock.ed.secretKey);
    const servers = depositAccountKey(key, max.accountKey, place, ed25519KeyPair().secretKey);
    for (const held of [old, otherAk, servers])
      expect(depositFor(on, key.publicKey, held, depositor).kind).toBe("deposit");
  });
});

const device = xwingKeyPair();
const pairingSecret = new Uint8Array(32).fill(0x72);
const bundle = {
  deposit: made(),
  keyBlock: max.upload.keyBlock,
  state: max.upload.state,
  stateCounter: 0,
};
const input = (changes: Partial<ApproveInput> = {}): ApproveInput => ({
  recoveryKey: key,
  bundle,
  certificate: maxCert,
  rootFingerprint: pinned,
  device: { publicKey: device.publicKey, pairingSecret },
  ...changes,
});

describe("approveRecovery", () => {
  it("wraps Max's AK and the hash of his sealed state to his new device", () => {
    const approved = approveRecovery(input());
    if (!approved.ok) throw new Error(approved.error);
    expect(openRecoveryPackage(device, pairingSecret, approved.value)).toEqual({
      ok: true,
      value: {
        accountKey: max.accountKey,
        accountId: max.accountId,
        stateHash: stateHash(max.upload.state),
      },
    });
  });

  it("refuses a deposit the server wrapped itself or signed by someone else", () => {
    const servers = depositAccountKey(
      key,
      new Uint8Array(32).fill(9),
      place,
      ed25519KeyPair().secretKey,
    );
    expect(approveRecovery(input({ bundle: { ...bundle, deposit: servers } }))).toEqual({
      ok: false,
      error: "not-signed",
    });
  });

  it("refuses a deposit for an earlier recovery key, replayed after the key changed", () => {
    const earlier = newCompanyRecoveryKey();
    const old = depositAccountKey(earlier, max.accountKey, place, max.keyBlock.ed.secretKey);
    expect(approveRecovery(input({ bundle: { ...bundle, deposit: old } }))).toEqual({
      ok: false,
      error: "not-signed",
    });
  });

  it("refuses a state its AK does not open under the counter served", () => {
    expect(approveRecovery(input({ bundle: { ...bundle, stateCounter: 1 } }))).toEqual({
      ok: false,
      error: "damaged-state",
    });
    const foreign = sealState(new Uint8Array(32), max.accountId, 0, emptyState(pinned));
    expect(approveRecovery(input({ bundle: { ...bundle, state: foreign } }))).toEqual({
      ok: false,
      error: "damaged-state",
    });
  });
});

describe("checkRecovered", () => {
  it("takes the account when the company root certified exactly its keys", () => {
    expect(checkRecovered(max.keyBlock, max.accountId, root.publicKey, maxCert)).toEqual({
      ok: true,
      value: true,
    });
  });

  it("refuses a root other than the one the key block pins, or none", () => {
    const other = ed25519KeyPair().publicKey;
    for (const served of [other, null])
      expect(checkRecovered(max.keyBlock, max.accountId, served, maxCert)).toEqual({
        ok: false,
        error: "root-mismatch",
      });
  });

  it("refuses no certificate, a forged one, or one for another account or other keys", () => {
    const evil = ed25519KeyPair();
    const other = xwingKeyPair().publicKey;
    const cases = [
      null,
      certify(evil.secretKey, maxCert),
      certify(root.secretKey, { ...maxCert, accountId: new Uint8Array(16) }),
      certify(root.secretKey, { ...maxCert, xwingPublicKey: other }),
      certify(root.secretKey, { ...maxCert, edPublicKey: evil.publicKey }),
    ];
    for (const certificate of cases)
      expect(checkRecovered(max.keyBlock, max.accountId, root.publicKey, certificate)).toEqual({
        ok: false,
        error: "uncertified",
      });
  });
});
