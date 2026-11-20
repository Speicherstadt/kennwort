// Review of K-304 part 1: an invitee must not be able to put a certificate on itself past P-08
import { describe, expect, it } from "bun:test";
import {
  certify,
  createAccount,
  emptyState,
  encodeBytes,
  invitationMac,
  newInvitation,
  toWire,
} from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";

describe("members (review of K-304 part 1)", () => {
  it("does not let an invited member upload a self-made owner certificate with its keys", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const invitation = newInvitation(o.owner.accountKey, o.owner.accountId);
    const made = await o.setup.request("/api/invitations", {
      token: o.token,
      body: { id: encodeBytes(invitation.id), sealedSecret: encodeBytes(invitation.sealedSecret) },
    });
    const { token } = (await made.json()) as { token: string };
    const anna = createAccount("Anna Heizung Bad Fliese", emptyState(new Uint8Array(32)), {
      derive: quick,
    });
    const accepted = await o.setup.request(
      `/auth/invitations/${encodeBytes(invitation.id)}/accept`,
      {
        body: {
          token,
          accountId: encodeBytes(anna.accountId),
          loginPublicKey: encodeBytes(anna.upload.loginPublicKey),
          accountSalt: encodeBytes(anna.upload.accountSalt),
        },
      },
    );
    const session = (await accepted.json()) as { token: string };
    const u = anna.upload;
    const bundle = {
      accountId: anna.accountId,
      xwingPublicKey: u.xwingPublicKey,
      edPublicKey: u.edPublicKey,
    };
    // Anna signs an "owner" certificate for herself with a key of her own, not the root key
    const fake = certify(ed25519KeyPair(new Uint8Array(32).fill(9)).secretKey, {
      ...bundle,
      companyId: o.company.companyId,
      role: "owner",
      issuedAt: 1,
    });
    const uploaded = await o.setup.request("/api/account/keys", {
      method: "PUT",
      token: session.token,
      body: {
        xwingPublicKey: encodeBytes(u.xwingPublicKey),
        edPublicKey: encodeBytes(u.edPublicKey),
        keyBlock: encodeBytes(u.keyBlock),
        unlock: {
          passphrase: encodeBytes(u.unlock.passphrase),
          recovery: encodeBytes(u.unlock.recovery),
        },
        recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
        state: encodeBytes(u.state),
        stateCounter: 0,
        certificate: toWire(fake),
        inviteMac: encodeBytes(invitationMac(invitation.secret, invitation.id, bundle)),
      },
    });
    expect([201, 400]).toContain(uploaded.status);
    // Only owners and admins certify, only with the account's role, through the members route
    // (docs/sicherheitsdesign.md, P-08); otherwise Anna shows up certified as owner and Jonas's
    // real certificate is refused with 409 "certified"
    const listed = (await (await o.setup.request("/api/members", { token: o.token })).json()) as {
      members: { id: string; certificate: unknown }[];
    };
    const row = listed.members.find((m) => m.id === encodeBytes(anna.accountId));
    expect(row?.certificate ?? null).toBeNull();
  });
});
