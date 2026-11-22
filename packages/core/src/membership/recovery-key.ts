/**
 * The company recovery key (K-307 part c, P-13): an X-Wing key pair an owner's client makes. Its
 * private half goes to every owner, wrapped to the owner's certified bundle (F-02, purpose
 * company-recovery-key, context company and account), its fingerprint into the policy the root
 * signs (F-07). F-02 does not say who wrapped, so an owner takes the key only if its public half has
 * the fingerprint of the policy in force: a key the server made up has another one.
 */
import {
  bundleFingerprint,
  constantTimeEqual,
  type KeyBlock,
  keyBlockFingerprint,
  recoveryFingerprint,
  unwrap,
  wrap,
  xwingKeyPair,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import type { Certificate } from "./certificate.ts";
import { signPolicy, type UnsignedPolicy } from "./policy.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte key seed (F-02) */
export const RECOVERY_GRANT_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

export type CompanyRecoveryKey = {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  fingerprint: Uint8Array;
};

/** A new recovery key; the 32-byte secret key is the seed both halves come from */
export const newCompanyRecoveryKey = (seed?: Uint8Array): CompanyRecoveryKey => {
  const { secretKey, publicKey } = xwingKeyPair(seed);
  return { secretKey, publicKey, fingerprint: recoveryFingerprint(publicKey) };
};

const place = (companyId: Uint8Array, accountId: Uint8Array) => ({
  purpose: "company-recovery-key",
  context: [companyId, accountId],
});

/** The private half wrapped to an owner, from the owner's certificate, never raw from the server */
export const grantRecoveryKey = (secretKey: Uint8Array, to: Certificate) =>
  wrap(
    {
      publicKey: to.xwingPublicKey,
      fingerprint: bundleFingerprint(to.xwingPublicKey, to.edPublicKey),
    },
    secretKey,
    place(to.companyId, to.accountId),
  );

export type RecoveryGrantError = "not-authentic" | "other-key";

/** Opens this owner's grant; the key counts only with the fingerprint the valid policy names */
export const openRecoveryGrant = (
  keyBlock: KeyBlock,
  accountId: Uint8Array,
  companyId: Uint8Array,
  grant: Uint8Array,
  fingerprint: Uint8Array,
): Result<CompanyRecoveryKey, RecoveryGrantError> => {
  const opened = unwrap(
    keyBlock.xwing.secretKey,
    keyBlockFingerprint(keyBlock),
    grant,
    place(companyId, accountId),
  );
  if (!opened.ok || opened.value.length !== 32) return err("not-authentic");
  const key = newCompanyRecoveryKey(opened.value);
  return constantTimeEqual(key.fingerprint, fingerprint) ? ok(key) : err("other-key");
};

/**
 * The next policy with company recovery on for this key, or off: the root signs it, so the server
 * can neither name another key nor switch recovery back on (F-07)
 */
export const recoveryPolicy = (
  rootSecretKey: Uint8Array,
  current: UnsignedPolicy,
  fingerprint: Uint8Array | undefined,
) =>
  signPolicy(rootSecretKey, {
    ...current,
    version: current.version + 1,
    companyRecovery: fingerprint ? { enabled: true, fingerprint } : { enabled: false },
  });
