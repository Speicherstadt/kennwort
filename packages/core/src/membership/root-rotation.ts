/**
 * A new company root key, made by an owner's client after an owner or admin left or lost the role
 * (K-307 part f, P-07): whoever goes keeps a copy of the root and could certify bundles with a
 * server. The client makes a new root and, in one upload,
 *
 * - signs the change with the old and the new root (F-14),
 * - certifies every member the old root confirmed and who is still in, with the same bundle and
 *   role, later than every certificate it has seen for the account,
 * - wraps the new root to every owner and admin still in, itself included, so a lost write of the
 *   own account state does not lose the root (root-grant.ts),
 * - signs the next policy under the new root with the same lock time and recovery key (F-07).
 *
 * The departed keep only the old root's certificates, which count for what was signed before the
 * change (verify-log.ts).
 */
import { ed25519KeyPair, type RootChange, signRootChange } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { CertificateWire, toWire } from "../sync/wire.ts";
import { type Certificate, certify } from "./certificate.ts";
import type { MemberView } from "./members.ts";
import {
  type Policy,
  PolicyWire,
  policyToWire,
  signPolicy,
  type UnsignedPolicy,
} from "./policy.ts";
import { RootChangeWire } from "./root-change.ts";
import { grantRoot, ROOT_GRANT_LENGTH } from "./root-grant.ts";

export type RootGrantFor = { accountId: Uint8Array; grant: Uint8Array };

export type RootRotation = {
  change: RootChange;
  /** The new root's private key, for the rotating owner's account state */
  rootSecretKey: Uint8Array;
  certificates: Certificate[];
  grants: RootGrantFor[];
  policy: Policy;
};

export type RotationInput = {
  /** The root in force, from the owner's account state */
  rootSecretKey: Uint8Array;
  companyId: Uint8Array;
  /** The members as the owner's client checked them under the root in force */
  views: readonly MemberView[];
  /** The policy in force, checked; the standard one while the company has signed none */
  policy: UnsignedPolicy;
  /** Unix seconds */
  now: number;
  /** The newest certificate seen per account, as in the account state */
  seen: Readonly<Record<string, number>>;
  /** The new root's private key; a random one unless a test passes it */
  newRootSecretKey?: Uint8Array;
};

/** Members the root in force confirms and who are still in: each gets a certificate anew */
const staying = (views: readonly MemberView[]) =>
  views.filter(
    (v): v is MemberView & { certificate: Certificate } =>
      v.status === "certified" && v.certificate !== undefined && v.leftAt == null,
  );

const recertify = (
  rootSecretKey: Uint8Array,
  current: Certificate,
  now: number,
  seen: Readonly<Record<string, number>>,
) => {
  const { signature: _, ...unsigned } = current;
  const known = seen[encodeBytes(current.accountId)] ?? 0;
  return certify(rootSecretKey, {
    ...unsigned,
    issuedAt: Math.max(now, known + 1, current.issuedAt + 1),
  });
};

export const rotateRoot = (input: RotationInput): RootRotation => {
  const rootSecretKey = input.newRootSecretKey ?? ed25519KeyPair().secretKey;
  const certificates = staying(input.views).map((v) =>
    recertify(rootSecretKey, v.certificate, input.now, input.seen),
  );
  return {
    change: signRootChange(input.rootSecretKey, rootSecretKey, input.companyId, input.now),
    rootSecretKey,
    certificates,
    grants: certificates
      .filter((c) => c.role !== "member")
      .map((c) => ({ accountId: c.accountId, grant: grantRoot(rootSecretKey, c) })),
    policy: signPolicy(rootSecretKey, { ...input.policy, version: input.policy.version + 1 }),
  };
};

/** PUT /api/company/root: what the server checks and keeps in one transaction */
export const RootRotationWire = z.object({
  change: RootChangeWire,
  certificates: z.array(CertificateWire),
  grants: z.array(z.object({ accountId: bytes(16), grant: bytes(ROOT_GRANT_LENGTH) })),
  policy: PolicyWire,
});

export const rootRotationToWire = (rotation: Omit<RootRotation, "rootSecretKey">) => ({
  change: toWire(rotation.change),
  certificates: rotation.certificates.map(toWire),
  grants: rotation.grants.map((g) => ({
    accountId: encodeBytes(g.accountId),
    grant: encodeBytes(g.grant),
  })),
  policy: policyToWire(rotation.policy),
});
