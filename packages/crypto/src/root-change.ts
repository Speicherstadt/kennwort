/**
 * F-14 of docs/sicherheitsdesign.md: a new company root key after an owner or admin left (P-07,
 * K-307 part f). The old root signs exactly one change to a new root; the new root signs the same
 * statement back, so nobody names a key as the successor whose private half they do not hold.
 *
 *   statement = enc("kennwort/root-change/v1", company, fp(old root), new root edPk, time)
 *   old       = F-03(old root, "root-change", statement)
 *   new       = F-03(new root, "root-change-accept", statement)
 *
 * The company and the old root's fingerprint bind the change to its place: it counts for no other
 * company and as a step from no other root. Whoever left kept the old root too and can sign a change
 * of their own, so a client takes a change only once a person compared the new root's code with an
 * owner, and never a second one from the same old root (packages/core, root-change.ts).
 */
import { encode } from "./encoding.ts";
import { rootFingerprint } from "./fingerprint.ts";
import { ed25519KeyPair, sign, verify } from "./sign.ts";

export const ROOT_CHANGE_PURPOSE = "root-change";
export const ROOT_CHANGE_ACCEPT_PURPOSE = "root-change-accept";

export type RootChangeStatement = {
  companyId: Uint8Array;
  oldRootPublicKey: Uint8Array;
  newRootPublicKey: Uint8Array;
  /** Unix seconds; certificates of the old root count for what was signed before it (P-07) */
  time: number;
};

export type RootChange = RootChangeStatement & {
  oldSignature: Uint8Array;
  newSignature: Uint8Array;
};

/** The statement's bytes: the old root by its fingerprint (F-04), the new one by its public key */
export const rootChangeMessage = (s: RootChangeStatement) =>
  encode(
    "kennwort/root-change/v1",
    s.companyId,
    rootFingerprint(s.oldRootPublicKey),
    s.newRootPublicKey,
    s.time,
  );

/** The change from the old root to the new one, signed by both */
export const signRootChange = (
  oldRootSecretKey: Uint8Array,
  newRootSecretKey: Uint8Array,
  companyId: Uint8Array,
  time: number,
): RootChange => {
  const statement = {
    companyId,
    oldRootPublicKey: ed25519KeyPair(oldRootSecretKey).publicKey,
    newRootPublicKey: ed25519KeyPair(newRootSecretKey).publicKey,
    time,
  };
  const message = rootChangeMessage(statement);
  return {
    ...statement,
    oldSignature: sign(oldRootSecretKey, ROOT_CHANGE_PURPOSE, message),
    newSignature: sign(newRootSecretKey, ROOT_CHANGE_ACCEPT_PURPOSE, message),
  };
};

/** True only if the old root and the new root both signed exactly this statement */
export const isSignedRootChange = (change: RootChange) => {
  const message = rootChangeMessage(change);
  return (
    verify(change.oldRootPublicKey, change.oldSignature, ROOT_CHANGE_PURPOSE, message) &&
    verify(change.newRootPublicKey, change.newSignature, ROOT_CHANGE_ACCEPT_PURPOSE, message)
  );
};
