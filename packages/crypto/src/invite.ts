/**
 * The invitation MAC (P-08): the invitee binds its key bundle to the invitation secret `s` from the
 * link, which the server never sees; the inviting admin's client checks it before it certifies the
 * bundle, so a bundle the server slipped in or swapped is never certified (E-01, E-05).
 *
 *   mac = HMAC-SHA-512(kdf(s, empty, "kennwort/invite/v1", invitationId), bundle)
 *   bundle = enc("kennwort/bundle/v1", accountId, xwingPk, edPk)   (F-06)
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { constantTimeEqual } from "./commitment.ts";
import { kdf } from "./derive.ts";
import { encode } from "./encoding.ts";

export const INVITE_SECRET_LENGTH = 32;
export const INVITE_MAC_LENGTH = 64;

export type InvitedBundle = {
  accountId: Uint8Array;
  xwingPublicKey: Uint8Array;
  edPublicKey: Uint8Array;
};

const bundle = (b: InvitedBundle) =>
  encode("kennwort/bundle/v1", b.accountId, b.xwingPublicKey, b.edPublicKey);

export const inviteMac = (secret: Uint8Array, invitationId: Uint8Array, invited: InvitedBundle) =>
  hmac(sha512, kdf(secret, new Uint8Array(), "kennwort/invite/v1", invitationId), bundle(invited));

export const verifyInviteMac = (
  secret: Uint8Array,
  invitationId: Uint8Array,
  invited: InvitedBundle,
  mac: Uint8Array,
  // constantTimeEqual refuses a MAC of another length as well
) => constantTimeEqual(inviteMac(secret, invitationId, invited), mac);
