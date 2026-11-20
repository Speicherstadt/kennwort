/**
 * The company policy (K-304, P-07, F-07): what the company decides for all its members, signed by
 * the root key so the server cannot change it. Every client checks the signature under the pinned
 * root and takes no policy older than the newest it has seen (the version is in the account state).
 *
 *   policy    = companyId, version, lockAfterMinutes, recovery (0 or 1), recovery fingerprint or empty
 *   signature = F-03(root, "policy", enc("kennwort/policy/v1", policy…))
 */
import { constantTimeEqual, encode, sign, verify } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";

export const LOCK_MINUTES = { min: 1, max: 60, standard: 10 } as const;

const Recovery = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), fingerprint: bytes(32) }),
]);

export const PolicyWire = z.object({
  companyId: bytes(16),
  version: z.number().int().positive(),
  lockAfterMinutes: z.number().int().min(LOCK_MINUTES.min).max(LOCK_MINUTES.max),
  companyRecovery: Recovery,
  signature: bytes(65),
});
export type Policy = z.infer<typeof PolicyWire>;
export type UnsignedPolicy = Omit<Policy, "signature">;

/** The policy as JSON for the wire; PolicyWire reads it back */
export const policyToWire = (p: Policy) => ({
  companyId: encodeBytes(p.companyId),
  version: p.version,
  lockAfterMinutes: p.lockAfterMinutes,
  companyRecovery: p.companyRecovery.enabled
    ? { enabled: true, fingerprint: encodeBytes(p.companyRecovery.fingerprint) }
    : { enabled: false },
  signature: encodeBytes(p.signature),
});

const fields = (p: UnsignedPolicy) =>
  [
    encode(
      "kennwort/policy/v1",
      p.companyId,
      p.version,
      p.lockAfterMinutes,
      p.companyRecovery.enabled ? 1 : 0,
      p.companyRecovery.enabled ? p.companyRecovery.fingerprint : new Uint8Array(),
    ),
  ] as const;

export const signPolicy = (rootSecretKey: Uint8Array, policy: UnsignedPolicy): Policy => ({
  ...policy,
  signature: sign(rootSecretKey, "policy", ...fields(policy)),
});

export const isSignedPolicy = (rootPublicKey: Uint8Array, policy: Policy) =>
  verify(rootPublicKey, policy.signature, "policy", ...fields(policy));

/** What holds while the company has signed none: lock after ten minutes, no company recovery */
export const standardPolicy = (companyId: Uint8Array): UnsignedPolicy => ({
  companyId,
  version: 0,
  lockAfterMinutes: LOCK_MINUTES.standard,
  companyRecovery: { enabled: false },
});

export type PolicyError = "not-signed" | "other-company" | "older";

/**
 * The policy a client goes by: signed by the pinned root for this company, and not older than the
 * newest version this account has seen; no policy at all means the standard one
 */
export const checkPolicy = (
  root: Uint8Array,
  companyId: Uint8Array,
  seen: number,
  served: Policy | null,
): { ok: true; value: UnsignedPolicy } | { ok: false; error: PolicyError } => {
  if (!served)
    return seen > 0
      ? { ok: false, error: "older" }
      : { ok: true, value: standardPolicy(companyId) };
  if (!isSignedPolicy(root, served)) return { ok: false, error: "not-signed" };
  if (!constantTimeEqual(served.companyId, companyId)) return { ok: false, error: "other-company" };
  if (served.version < seen) return { ok: false, error: "older" };
  const { signature: _, ...policy } = served;
  return { ok: true, value: policy };
};
