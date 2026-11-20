/**
 * The member list as a client sees it (K-304, P-07): the server says who is in the company, the
 * client decides whom to trust. A certificate counts only under the root key whose fingerprint the
 * account pinned, for exactly the account, keys and role listed; the server's word alone shows as
 * "not confirmed", never as checked (DESIGN.md: show trust, don't claim it).
 */
import { constantTimeEqual, rootFingerprint } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { CertificateWire } from "../sync/wire.ts";
import { type Certificate, type CompanyRole, isCertified } from "./certificate.ts";
import type { PendingMember } from "./invitation.ts";
import { PolicyWire } from "./policy.ts";

const Role = z.enum(["owner", "admin", "member"]);

export const CompanyWire = z.object({
  id: z.string().min(1),
  rootPublicKey: bytes(32).nullable(),
  /** The signed policy, none until an owner has saved one (K-304, F-07) */
  policy: PolicyWire.nullable().default(null),
});

export const MembersWire = z.object({
  members: z.array(
    z.object({
      id: bytes(16),
      role: Role,
      name: z.string().nullable(),
      xwingPublicKey: bytes(1216).nullable(),
      edPublicKey: bytes(32).nullable(),
      certificate: CertificateWire.nullable(),
      invitation: z.object({ id: bytes(16), sealedSecret: bytes(), mac: bytes(64) }).nullable(),
      /** When the account left the company (K-307), ms; its vaults owe a removal and a rotation */
      leftAt: z.number().int().nonnegative().nullable().optional(),
    }),
  ),
});
type MemberWire = z.infer<typeof MembersWire>["members"][number];

/**
 * - certified: a certificate by the pinned root for this account, its keys and its role
 * - pending: no certificate yet, and this client made the invitation, so it can confirm it
 * - waiting: no certificate yet, another admin has to confirm (or the keys are not there yet)
 * - invalid: a certificate that does not check out, or an invitation shown for two accounts
 */
export type MemberStatus = "certified" | "pending" | "waiting" | "invalid";

export type MemberView = {
  accountId: Uint8Array;
  name: string | null;
  role: CompanyRole;
  status: MemberStatus;
  certificate?: Certificate;
  pending?: PendingMember;
  /**
   * When the account left the company (ms), by the server's word only: a manager's client then
   * removes it from its vaults and rotates their keys (K-307, P-11); null while it is in
   */
  leftAt?: number | null;
};

/**
 * The root key the server serves, if it is the one this account pinned; otherwise none, and the
 * client trusts no certificate at all (P-07)
 */
export const trustedRoot = (pinned: Uint8Array, served: Uint8Array | null) =>
  served && constantTimeEqual(rootFingerprint(served), pinned) ? served : undefined;

const same = (a: Uint8Array, b: Uint8Array | null) => b !== null && constantTimeEqual(a, b);

const certifiedFor = (root: Uint8Array, c: Certificate, member: MemberWire, seen: number) =>
  c.issuedAt >= seen &&
  isCertified(root, c) &&
  constantTimeEqual(c.accountId, member.id) &&
  same(c.xwingPublicKey, member.xwingPublicKey) &&
  same(c.edPublicKey, member.edPublicKey) &&
  c.role === member.role;

const pendingOf = (member: MemberWire): PendingMember | undefined =>
  member.invitation && member.xwingPublicKey && member.edPublicKey
    ? {
        accountId: member.id,
        xwingPublicKey: member.xwingPublicKey,
        edPublicKey: member.edPublicKey,
        invitation: member.invitation,
      }
    : undefined;

const statusOf = (
  root: Uint8Array,
  member: MemberWire,
  shared: boolean,
  seen: number,
): Pick<MemberView, "status" | "certificate" | "pending"> => {
  if (member.certificate)
    return certifiedFor(root, member.certificate, member, seen)
      ? { status: "certified", certificate: member.certificate }
      : { status: "invalid" };
  if (shared) return { status: "invalid" };
  const pending = pendingOf(member);
  return pending ? { status: "pending", pending } : { status: "waiting" };
};

/**
 * Every member with what this client can say about it, under the root from trustedRoot; `seen`
 * holds the newest certificate per account this account has seen, so an older one does not count
 */
export const checkMembers = (
  root: Uint8Array,
  members: MemberWire[],
  seen: Readonly<Record<string, number>> = {},
): MemberView[] => {
  const counts = new Map<string, number>();
  for (const m of members)
    if (m.invitation) {
      const id = encodeBytes(m.invitation.id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  const shared = (m: MemberWire) =>
    m.invitation !== null && counts.get(encodeBytes(m.invitation.id)) !== 1;
  return members.map((member) => ({
    accountId: member.id,
    name: member.name,
    role: member.role,
    leftAt: member.leftAt ?? null,
    ...statusOf(root, member, shared(member), seen[encodeBytes(member.id)] ?? 0),
  }));
};

/** The issue times to remember after a check, or undefined when nothing is newer than known */
export const newerCertificates = (
  views: MemberView[],
  seen: Readonly<Record<string, number>>,
): Record<string, number> | undefined => {
  const newer = views.flatMap((v) => {
    const id = encodeBytes(v.accountId);
    return v.certificate && v.certificate.issuedAt > (seen[id] ?? 0)
      ? [[id, v.certificate.issuedAt] as const]
      : [];
  });
  return newer.length > 0 ? { ...seen, ...Object.fromEntries(newer) } : undefined;
};
