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
import { type Certificate, type CompanyRole, certify, isCertified } from "./certificate.ts";
import type { PendingMember } from "./invitation.ts";
import { PolicyWire } from "./policy.ts";
import { RootChangeWire } from "./root-change.ts";
import { CLOCK_SKEW_SECONDS } from "./verify-log.ts";

const Role = z.enum(["owner", "admin", "member"]);

export const CompanyWire = z.object({
  id: z.string().min(1),
  rootPublicKey: bytes(32).nullable(),
  /** The signed policy, none until an owner has saved one (K-304, F-07) */
  policy: PolicyWire.nullable().default(null),
  /** The company recovery key's public half (K-307 part c); clients take it only by the policy */
  recoveryPublicKey: bytes(1216).nullable().default(null),
  /** The changes of the root key, oldest first (K-307 part f, F-14); clients take them only confirmed */
  rootChanges: z.array(RootChangeWire).optional(),
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
      /**
       * Certificates of bundles the account has replaced (K-307 part e, P-12): the logs and records
       * its old keys signed must still verify
       */
      previous: z.array(CertificateWire).optional(),
      /**
       * The account enrolled through the identity provider (K-604, P-25): no invitation, so an owner
       * or admin compares the code of its keys with the person; the mark only picks that check
       */
      oidc: z.boolean().optional(),
    }),
  ),
});
type MemberWire = z.infer<typeof MembersWire>["members"][number];

/**
 * - certified: a certificate by the pinned root for this account, its keys and its role
 * - pending: no certificate yet, and this client made the invitation, so it can confirm it
 * - waiting: no certificate yet, another admin has to confirm (or the keys are not there yet)
 * - renewed: the account renewed its keys after its recovery kit got into other hands (P-12); an
 *   owner or admin compares the new bundle's code with the person and certifies it
 * - former: a certificate by a root the company replaced (K-307 part f, P-07): the account left
 *   before the change, so nobody certified it anew; it counts only for what was signed before
 * - enrolled: the account came through the identity provider (K-604) and has no certificate yet; an
 *   owner or admin compares its code with the person and certifies it as a member
 * - invalid: a certificate that does not check out, or an invitation shown for two accounts
 */
export type MemberStatus =
  | "certified"
  | "pending"
  | "waiting"
  | "renewed"
  | "enrolled"
  | "former"
  | "invalid";

/** A root the account replaced, with the time of its change (P-07) */
type Retired = { publicKey: Uint8Array; until: number };

/**
 * A certificate of a replaced root counts only if issued before the change: whoever left kept the
 * old root and could certify anything afterwards
 */
const issuedBefore = (root: Retired, certificate: Certificate) =>
  certificate.issuedAt < root.until + CLOCK_SKEW_SECONDS;

/** A bundle an account made to replace its certified one (P-12), waiting for its certificate */
export type RenewedBundle = {
  accountId: Uint8Array;
  xwingPublicKey: Uint8Array;
  edPublicKey: Uint8Array;
};

export type MemberView = {
  accountId: Uint8Array;
  name: string | null;
  role: CompanyRole;
  status: MemberStatus;
  certificate?: Certificate;
  pending?: PendingMember;
  /** The new bundle, while the status is renewed */
  renewed?: RenewedBundle;
  /** The bundle of an account that enrolled through the identity provider, while it waits */
  enrolled?: RenewedBundle;
  /** Earlier certificates the pinned root signed for this account, older than the current one */
  previous?: Certificate[];
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

/** The keys of an account that enrolled through the identity provider (K-604) */
const enrolledOf = (member: MemberWire): RenewedBundle | undefined =>
  member.oidc && member.xwingPublicKey && member.edPublicKey
    ? {
        accountId: member.id,
        xwingPublicKey: member.xwingPublicKey,
        edPublicKey: member.edPublicKey,
      }
    : undefined;

/** The new keys of an account that has an earlier certificate but no current one (P-12) */
const renewedOf = (member: MemberWire, previous: Certificate[]): RenewedBundle | undefined =>
  previous.length > 0 && member.xwingPublicKey && member.edPublicKey
    ? {
        accountId: member.id,
        xwingPublicKey: member.xwingPublicKey,
        edPublicKey: member.edPublicKey,
      }
    : undefined;

const statusOf = (
  root: Uint8Array,
  retired: readonly Retired[] | undefined,
  member: MemberWire,
  shared: boolean,
  seen: number,
  previous: Certificate[],
): Pick<MemberView, "status" | "certificate" | "pending" | "renewed" | "enrolled"> => {
  const certificate = member.certificate;
  if (certificate) {
    if (certifiedFor(root, certificate, member, seen)) return { status: "certified", certificate };
    return retired?.some(
      (r) => issuedBefore(r, certificate) && certifiedFor(r.publicKey, certificate, member, seen),
    )
      ? { status: "former", certificate }
      : { status: "invalid" };
  }
  if (shared) return { status: "invalid" };
  const pending = pendingOf(member);
  if (pending) return { status: "pending", pending };
  const renewed = renewedOf(member, previous);
  if (renewed) return { status: "renewed", renewed };
  const enrolled = enrolledOf(member);
  return enrolled ? { status: "enrolled", enrolled } : { status: "waiting" };
};

/**
 * The account's earlier certificates the pinned root, or one the account replaced, signed for
 * exactly this account, each older than the current one: the server may list them, but cannot make
 * one up
 */
const previousOf = (
  root: Uint8Array,
  retired: readonly Retired[] | undefined,
  member: MemberWire,
) =>
  (member.previous ?? []).filter(
    (c) =>
      constantTimeEqual(c.accountId, member.id) &&
      (isCertified(root, c) ||
        retired?.some((r) => issuedBefore(r, c) && isCertified(r.publicKey, c))) &&
      (member.certificate === null || c.issuedAt < member.certificate.issuedAt),
  );

/**
 * Every member with what this client can say about it, under the root from trustedRoot and the
 * roots the account replaced (K-307 part f); `seen` holds the newest certificate per account this
 * account has seen, so an older one does not count
 */
export const checkMembers = (
  root: Uint8Array,
  members: MemberWire[],
  seen: Readonly<Record<string, number>> = {},
  retired?: readonly Retired[],
): MemberView[] => {
  const counts = new Map<string, number>();
  for (const m of members)
    if (m.invitation) {
      const id = encodeBytes(m.invitation.id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  const shared = (m: MemberWire) =>
    m.invitation !== null && counts.get(encodeBytes(m.invitation.id)) !== 1;
  return members.map((member) => {
    const known = seen[encodeBytes(member.id)] ?? 0;
    const previous = previousOf(root, retired, member);
    const status = statusOf(root, retired, member, shared(member), known, previous);
    const trusted = trustedHistory(status, previous, known);
    return {
      accountId: member.id,
      name: member.name,
      role: member.role,
      leftAt: member.leftAt ?? null,
      ...(trusted ? { previous, ...status } : { previous: [], status: "invalid" as const }),
    };
  });
};

/**
 * Earlier certificates count only beside a current one that checks out, or, while the renewed
 * bundle waits for its certificate, when none of them is older than the newest this client has
 * seen: otherwise the server hid or spoilt the certificate that retires them, and the old keys,
 * which whoever has the kit holds, would sign without a time limit again (P-12, found in review)
 */
const trustedHistory = (
  status: Pick<MemberView, "status">,
  previous: readonly Certificate[],
  known: number,
) =>
  status.status === "certified" ||
  previous.length === 0 ||
  (status.status !== "invalid" && Math.max(...previous.map((c) => c.issuedAt)) >= known);

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

/**
 * The certificate for a renewed bundle (P-12), once an owner or admin compared its code with the
 * person: the account's role as the server lists it, issued later than every certificate this
 * client has seen for the account, so clients take it over the earlier one (P-07)
 */
export const certifyRenewed = (
  rootSecretKey: Uint8Array,
  view: MemberView,
  companyId: Uint8Array,
  now: number,
  seen: number,
): Certificate | undefined => {
  if (view.status !== "renewed" || !view.renewed) return undefined;
  const latest = Math.max(seen, ...(view.previous ?? []).map((c) => c.issuedAt));
  return certify(rootSecretKey, {
    ...view.renewed,
    companyId,
    role: view.role,
    issuedAt: Math.max(now, latest + 1),
  });
};

/**
 * The certificate for an account that enrolled through the identity provider (K-604, P-25), once an
 * owner or admin compared its code with the person: always as a member, whatever role the server
 * lists, as an invitation makes one (P-08); a higher role is an owner's own step
 */
export const certifyEnrolled = (
  rootSecretKey: Uint8Array,
  view: MemberView,
  companyId: Uint8Array,
  now: number,
): Certificate | undefined =>
  view.status === "enrolled" && view.enrolled
    ? certify(rootSecretKey, { ...view.enrolled, companyId, role: "member", issuedAt: now })
    : undefined;
