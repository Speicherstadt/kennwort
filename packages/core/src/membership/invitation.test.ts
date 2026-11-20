import { ed25519KeyPair, open, xwingKeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { isCertified } from "./certificate.ts";
import {
  type Certifier,
  certifyInvited,
  invitationMac,
  newInvitation,
  type PendingMember,
} from "./invitation.ts";

// P-08 end to end, and what a server that lies can and cannot achieve with it
const root = ed25519KeyPair(new Uint8Array(32).fill(1));
const jonas: Certifier = {
  accountKey: new Uint8Array(32).fill(0x11),
  accountId: new Uint8Array(16).fill(0xa1),
  companyId: new Uint8Array(16).fill(0xc0),
  rootSecretKey: root.secretKey,
  certified: {},
};
const bundleOf = (seed: number) => ({
  accountId: new Uint8Array(16).fill(seed),
  xwingPublicKey: xwingKeyPair(new Uint8Array(32).fill(seed)).publicKey,
  edPublicKey: ed25519KeyPair(new Uint8Array(32).fill(seed)).publicKey,
});
const anna = bundleOf(0xb2);
const counter = () => {
  let n = 0;
  return (length: number) => new Uint8Array(length).fill(++n);
};

/** Jonas invites, Anna answers with her bundle and the MAC from the link's secret */
const invitedAnna = () => {
  const invitation = newInvitation(jonas.accountKey, jonas.accountId, counter());
  const pending: PendingMember = {
    ...anna,
    invitation: {
      id: invitation.id,
      sealedSecret: invitation.sealedSecret,
      mac: invitationMac(invitation.secret, invitation.id, anna),
    },
  };
  return { invitation, pending };
};

describe("newInvitation", () => {
  it("picks ID and secret and seals the secret to Jonas and this invitation", () => {
    const { id, secret, sealedSecret } = newInvitation(
      jonas.accountKey,
      jonas.accountId,
      counter(),
    );
    expect(id).toEqual(new Uint8Array(16).fill(1));
    expect(secret).toEqual(new Uint8Array(32).fill(2));
    const opened = open(jonas.accountKey, sealedSecret, {
      purpose: "invite-secret",
      context: [jonas.accountId, id],
    });
    expect(opened.ok && opened.value).toEqual(secret);
  });

  it("makes a new ID and secret every time by default", () => {
    const a = newInvitation(jonas.accountKey, jonas.accountId);
    const b = newInvitation(jonas.accountKey, jonas.accountId);
    expect(a.id).toHaveLength(16);
    expect(a.secret).toHaveLength(32);
    expect(a.id).not.toEqual(b.id);
    expect(a.secret).not.toEqual(b.secret);
  });
});

describe("certifyInvited", () => {
  it("certifies Anna's bundle as a member once the MAC checks out", () => {
    const { pending } = invitedAnna();
    const result = certifyInvited(jonas, pending, () => 1_800_000_000_999);
    if (!result.ok) throw new Error(result.error);
    expect(isCertified(root.publicKey, result.value)).toBe(true);
    expect(result.value).toMatchObject({
      ...anna,
      companyId: jonas.companyId,
      role: "member",
      issuedAt: 1_800_000_000,
    });
  });

  it("uses the current time when none is passed", () => {
    const result = certifyInvited(jonas, invitedAnna().pending);
    const now = Math.floor(Date.now() / 1000);
    expect(result.ok && Math.abs(result.value.issuedAt - now)).toBeLessThanOrEqual(2);
  });

  it("refuses without the root key", () => {
    const result = certifyInvited({ ...jonas, rootSecretKey: undefined }, invitedAnna().pending);
    expect(result).toEqual({ ok: false, error: "no-root" });
  });

  it("refuses a bundle the server swapped in, even with Anna's MAC", () => {
    const { pending } = invitedAnna();
    const mallory = bundleOf(0xee);
    for (const swapped of [
      { ...pending, ...mallory },
      { ...pending, xwingPublicKey: mallory.xwingPublicKey },
      { ...pending, edPublicKey: mallory.edPublicKey },
      { ...pending, accountId: mallory.accountId },
    ])
      expect(certifyInvited(jonas, swapped)).toEqual({ ok: false, error: "mac-mismatch" });
  });

  it("refuses a bundle with a MAC made without the link's secret", () => {
    const { pending } = invitedAnna();
    const guessed = invitationMac(new Uint8Array(32), pending.invitation.id, anna);
    const forged = { ...pending, invitation: { ...pending.invitation, mac: guessed } };
    expect(certifyInvited(jonas, forged)).toEqual({ ok: false, error: "mac-mismatch" });
  });

  it("refuses a secret sealed by someone else or moved to another invitation", () => {
    const { pending } = invitedAnna();
    const other = newInvitation(new Uint8Array(32).fill(0x99), jonas.accountId);
    const theirs = {
      ...pending,
      invitation: { ...pending.invitation, sealedSecret: other.sealedSecret },
    };
    expect(certifyInvited(jonas, theirs)).toEqual({ ok: false, error: "not-mine" });
    const moved = { ...pending, invitation: { ...pending.invitation, id: new Uint8Array(16) } };
    expect(certifyInvited(jonas, moved)).toEqual({ ok: false, error: "not-mine" });
    const admin = { ...jonas, accountId: new Uint8Array(16).fill(0xa2) };
    expect(certifyInvited(admin, pending)).toEqual({ ok: false, error: "not-mine" });
  });

  it("certifies one account per invitation; the same one again, another never", () => {
    const { pending } = invitedAnna();
    const id = encodeBytes(pending.invitation.id);
    const before = { ...jonas, certified: { [id]: encodeBytes(anna.accountId) } };
    expect(certifyInvited(before, pending).ok).toBe(true);
    const other = { ...jonas, certified: { [id]: encodeBytes(new Uint8Array(16).fill(0xee)) } };
    expect(certifyInvited(other, pending)).toEqual({ ok: false, error: "used" });
    const unrelated = { ...jonas, certified: { [encodeBytes(new Uint8Array(16))]: "max" } };
    expect(certifyInvited(unrelated, pending).ok).toBe(true);
  });

  it("certifies a member whatever role the server claims for the invitee", () => {
    const { pending } = invitedAnna();
    const claimed = { ...pending, role: "owner" } as PendingMember;
    const result = certifyInvited(jonas, claimed);
    expect(result.ok && result.value.role).toBe("member");
  });
});
