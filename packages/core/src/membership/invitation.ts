/**
 * Invitations of docs/sicherheitsdesign.md (P-08), both ends. The inviting admin's client makes the
 * invitation secret `s`, seals it under its own AK for later (the server keeps it but cannot open
 * it) and puts it in the link's fragment. The invitee's client binds its bundle to `s` with a MAC.
 * Back on the admin's client, the bundle is certified only when that MAC checks out, so a bundle
 * the server slipped in or swapped for the invitee's is never certified (E-01, E-05, E-10).
 */
import {
  INVITE_SECRET_LENGTH,
  type InvitedBundle,
  inviteMac,
  open,
  randomBytes,
  seal,
  verifyInviteMac,
} from "@kennwort/crypto";
import { err, ok, type Result } from "../result.ts";
import { type Certificate, type CompanyRole, certify } from "./certificate.ts";

const place = (creatorId: Uint8Array, invitationId: Uint8Array) => ({
  purpose: "invite-secret",
  context: [creatorId, invitationId],
});

export type NewInvitation = { id: Uint8Array; secret: Uint8Array; sealedSecret: Uint8Array };

/** The creating client picks the invitation's ID, so the sealed secret is bound to it */
export const newInvitation = (
  accountKey: Uint8Array,
  creatorId: Uint8Array,
  random: (length: number) => Uint8Array = randomBytes,
): NewInvitation => {
  const id = random(16);
  const secret = random(INVITE_SECRET_LENGTH);
  return { id, secret, sealedSecret: seal(accountKey, secret, place(creatorId, id)) };
};

/** The invitee's MAC over its bundle (P-08 step 3) */
export const invitationMac = (
  secret: Uint8Array,
  invitationId: Uint8Array,
  bundle: InvitedBundle,
) => inviteMac(secret, invitationId, bundle);

/** An invitee whose keys came back with a MAC; the role is not the server's to say (see below) */
export type PendingMember = InvitedBundle & {
  invitation: { id: Uint8Array; sealedSecret: Uint8Array; mac: Uint8Array };
};

export type Certifier = {
  accountKey: Uint8Array;
  accountId: Uint8Array;
  companyId: Uint8Array;
  /** Only who holds the root key certifies (P-07) */
  rootSecretKey: Uint8Array | undefined;
};

export type CertifyError = "no-root" | "not-mine" | "mac-mismatch";

/**
 * The admin's side (P-08 step 4): the secret opens only under this admin's AK for this invitation,
 * and the member's bundle must carry the MAC made with it; only then the root key certifies it
 */
export const certifyInvited = (
  me: Certifier,
  member: PendingMember,
  now: () => number = Date.now,
): Result<Certificate, CertifyError> => {
  if (!me.rootSecretKey) return err("no-root");
  const { invitation, ...bundle } = member;
  const secret = open(me.accountKey, invitation.sealedSecret, place(me.accountId, invitation.id));
  if (!secret.ok) return err("not-mine");
  if (!verifyInviteMac(secret.value, invitation.id, bundle, invitation.mac))
    return err("mac-mismatch");
  return ok(
    certify(me.rootSecretKey, {
      ...bundle,
      companyId: me.companyId,
      // An invitation makes a member; whatever role the server claims, a higher one needs an
      // owner's own step (K-304 part 3), so a server cannot have an invitee certified as owner
      role: "member" satisfies CompanyRole,
      issuedAt: Math.floor(now() / 1000),
    }),
  );
};
