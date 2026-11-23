/**
 * Confirming someone who enrolled through the identity provider (K-604, P-25). The provider only
 * says who signed in; it cannot vouch for keys, and the server could have made the bundle itself.
 * So the owner or admin compares the bundle's code with the person, who in turn compares the
 * company's code (the root this device pinned) with the one the admin reads out (P-07). Only then
 * the root certifies the bundle, always as a member; it is remembered before it is uploaded.
 */
import {
  type AccountState,
  type Certificate,
  certifyEnrolled,
  encodeBytes,
  type MemberView,
} from "@kennwort/core";
import { bundleFingerprint, comparisonCode, constantTimeEqual } from "@kennwort/crypto";
import type { Session } from "../session/session.ts";
import type { MembersDeps } from "./members.ts";

/** The code of the enrolled bundle, read out to the person */
export const enrolledCode = (view: MemberView) =>
  view.enrolled
    ? comparisonCode(bundleFingerprint(view.enrolled.xwingPublicKey, view.enrolled.edPublicKey))
    : undefined;

/** The code of the root this device pinned: the person checks it against the admin's */
export const companyCode = (session: Session) => {
  const opened = session.opened();
  return opened ? comparisonCode(opened.state.rootFingerprint) : undefined;
};

/** The person's own codes on their device: their bundle's and the company's */
export const ownCodes = (session: Session) => {
  const opened = session.opened();
  if (!opened) return undefined;
  const { xwing, ed } = opened.keyBlock;
  return {
    own: comparisonCode(bundleFingerprint(xwing.publicKey, ed.publicKey)),
    company: comparisonCode(opened.state.rootFingerprint),
  };
};

const seconds = () => Math.floor(Date.now() / 1000);

/**
 * The certificate remembered with its bundle in the merged account state; undefined when another
 * device of this account already knows other keys for the person (as with an invitation, P-08)
 */
const remembering = (state: AccountState, view: MemberView, certificate: Certificate) => {
  const id = encodeBytes(view.accountId);
  const fingerprint = bundleFingerprint(certificate.xwingPublicKey, certificate.edPublicKey);
  const known = state.bundles[id];
  if (known && !constantTimeEqual(known, fingerprint)) return undefined;
  return {
    ...state,
    certificates: { ...state.certificates, [id]: certificate.issuedAt },
    bundles: { ...state.bundles, [id]: fingerprint },
  };
};

export const confirmEnrolled = async (
  api: MembersDeps,
  session: Session,
  view: MemberView,
  company: Uint8Array | undefined,
) => {
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !root || !company) return false;
  const certificate = certifyEnrolled(root, view, company, seconds());
  if (!certificate) return false;
  let refused = false;
  const remembered = await session.updateState(api, (state) => {
    const next = remembering(state, view, certificate);
    refused = next === undefined;
    return next;
  });
  return !refused && remembered.ok && (await api.certify(opened.token, certificate));
};
