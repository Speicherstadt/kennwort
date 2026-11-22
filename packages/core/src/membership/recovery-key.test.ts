import {
  bundleFingerprint,
  ed25519KeyPair,
  newKeyBlock,
  recoveryFingerprint,
  rootFingerprint,
  wrap,
  xwingKeyPair,
} from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { certify } from "./certificate.ts";
import { isSignedPolicy, standardPolicy } from "./policy.ts";
import {
  grantRecoveryKey,
  newCompanyRecoveryKey,
  openRecoveryGrant,
  RECOVERY_GRANT_LENGTH,
  recoveryPolicy,
} from "./recovery-key.ts";

// K-307 part c: Jonas makes the company recovery key; Sandra, also an owner, gets it wrapped
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const weber = new Uint8Array(16).fill(0xc0);
const sandraId = new Uint8Array(16).fill(0x40);
const sandraBlock = newKeyBlock(rootFingerprint(root.publicKey));
const sandra = certify(root.secretKey, {
  accountId: sandraId,
  xwingPublicKey: sandraBlock.xwing.publicKey,
  edPublicKey: sandraBlock.ed.publicKey,
  companyId: weber,
  role: "owner",
  issuedAt: 1,
});
const key = newCompanyRecoveryKey(new Uint8Array(32).fill(7));

describe("the company recovery key", () => {
  it("is an X-Wing pair named by its recovery fingerprint", () => {
    const pair = xwingKeyPair(new Uint8Array(32).fill(7));
    expect(key).toEqual({
      secretKey: pair.secretKey,
      publicKey: pair.publicKey,
      fingerprint: recoveryFingerprint(pair.publicKey),
    });
    expect(newCompanyRecoveryKey().fingerprint).not.toEqual(newCompanyRecoveryKey().fingerprint);
  });

  it("goes to an owner's certified bundle and opens as the key the policy names", () => {
    const grant = grantRecoveryKey(key.secretKey, sandra);
    expect(grant).toHaveLength(RECOVERY_GRANT_LENGTH);
    expect(openRecoveryGrant(sandraBlock, sandraId, weber, grant, key.fingerprint)).toEqual({
      ok: true,
      value: key,
    });
  });

  it("refuses a key the server wrapped itself: it is not the one the policy names", () => {
    const own = newCompanyRecoveryKey();
    const grant = grantRecoveryKey(own.secretKey, sandra);
    expect(openRecoveryGrant(sandraBlock, sandraId, weber, grant, key.fingerprint)).toEqual({
      ok: false,
      error: "other-key",
    });
  });

  it("refuses a grant for another company, account or purpose, or of another length", () => {
    const grant = grantRecoveryKey(key.secretKey, sandra);
    const fp = key.fingerprint;
    const other = new Uint8Array(16).fill(1);
    expect(openRecoveryGrant(sandraBlock, sandraId, other, grant, fp).ok).toBe(false);
    expect(openRecoveryGrant(sandraBlock, other, weber, grant, fp).ok).toBe(false);
    const to = {
      publicKey: sandra.xwingPublicKey,
      fingerprint: bundleFingerprint(sandra.xwingPublicKey, sandra.edPublicKey),
    };
    const asRoot = wrap(to, key.secretKey, { purpose: "root-key", context: [weber, sandraId] });
    expect(openRecoveryGrant(sandraBlock, sandraId, weber, asRoot, fp)).toEqual({
      ok: false,
      error: "not-authentic",
    });
    const short = wrap(to, new Uint8Array(31), {
      purpose: "company-recovery-key",
      context: [weber, sandraId],
    });
    expect(openRecoveryGrant(sandraBlock, sandraId, weber, short, fp)).toEqual({
      ok: false,
      error: "not-authentic",
    });
  });
});

describe("recoveryPolicy", () => {
  const current = { ...standardPolicy(weber), version: 3, lockAfterMinutes: 5 };

  it("signs the next version with company recovery on for the key", () => {
    const policy = recoveryPolicy(root.secretKey, current, key.fingerprint);
    expect(policy).toMatchObject({
      companyId: weber,
      version: 4,
      lockAfterMinutes: 5,
      companyRecovery: { enabled: true, fingerprint: key.fingerprint },
    });
    expect(isSignedPolicy(root.publicKey, policy)).toBe(true);
  });

  it("signs the next version with company recovery off", () => {
    const on = { ...current, companyRecovery: { enabled: true as const, fingerprint: key.fingerprint } };
    const policy = recoveryPolicy(root.secretKey, on, undefined);
    expect(policy).toMatchObject({ version: 4, companyRecovery: { enabled: false } });
    expect(isSignedPolicy(root.publicKey, policy)).toBe(true);
  });
});
