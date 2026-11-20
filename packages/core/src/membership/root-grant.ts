/**
 * The company root key for every admin (K-304, P-07): an owner's client wraps the root's private
 * half to the certified bundle of whoever becomes owner or admin (F-02, purpose root-key, context
 * company and account). F-02 does not say who wrapped, so the receiving client takes the key only
 * if it is the root it pinned: a key the server made up has another fingerprint.
 */
import {
  bundleFingerprint,
  constantTimeEqual,
  ed25519KeyPair,
  type KeyBlock,
  keyBlockFingerprint,
  rootFingerprint,
  unwrap,
  wrap,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, type CompanyRole, certify } from "./certificate.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte key (F-02) */
export const ROOT_GRANT_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

const place = (companyId: Uint8Array, accountId: Uint8Array) => ({
  purpose: "root-key",
  context: [companyId, accountId],
});

export const grantRoot = (rootSecretKey: Uint8Array, to: Certificate) =>
  wrap(
    {
      publicKey: to.xwingPublicKey,
      fingerprint: bundleFingerprint(to.xwingPublicKey, to.edPublicKey),
    },
    rootSecretKey,
    place(to.companyId, to.accountId),
  );

export type RootGrantError = "not-authentic" | "other-root";

export const openRootGrant = (
  keyBlock: KeyBlock,
  accountId: Uint8Array,
  companyId: Uint8Array,
  grant: Uint8Array,
): Result<Uint8Array, RootGrantError> => {
  const opened = unwrap(
    keyBlock.xwing.secretKey,
    keyBlockFingerprint(keyBlock),
    grant,
    place(companyId, accountId),
  );
  if (!opened.ok || opened.value.length !== 32) return err("not-authentic");
  const publicKey = ed25519KeyPair(opened.value).publicKey;
  return constantTimeEqual(rootFingerprint(publicKey), keyBlock.rootFingerprint)
    ? ok(opened.value)
    : err("other-root");
};

/** A new role: a new certificate by the root, and for owners and admins the root key wrapped */
export const changeRole = (
  rootSecretKey: Uint8Array,
  current: Certificate,
  role: CompanyRole,
  now: () => number = Date.now,
) => {
  const { signature: _, ...unsigned } = current;
  const certificate = certify(rootSecretKey, {
    ...unsigned,
    role,
    issuedAt: Math.floor(now() / 1000),
  });
  return {
    certificate,
    rootGrant: role === "member" ? undefined : grantRoot(rootSecretKey, certificate),
  };
};
