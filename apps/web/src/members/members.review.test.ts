import {
  createAccount,
  emptyState,
  encodeBytes,
  invitationMac,
  newInvitation,
} from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { derive } from "../session/session.test-kit.ts";
import { jonasCompany, ownerRow, type Row, server } from "./members.test-kit.ts";
import { confirm, loadMembers } from "./members.ts";

// Review of K-304: one invitation, one member, also across the devices of one admin
describe("confirm across devices", () => {
  it("refuses a second account for an invitation another device of the admin already certified", async () => {
    const c = await jonasCompany();
    const invitation = newInvitation(c.opened.accountKey, c.opened.accountId);
    const rowFor = (passphrase: string): Row => {
      const account = createAccount(passphrase, emptyState(c.opened.state.rootFingerprint), {
        derive,
      });
      const bundle = {
        accountId: account.accountId,
        xwingPublicKey: account.upload.xwingPublicKey,
        edPublicKey: account.upload.edPublicKey,
      };
      return {
        id: account.accountId,
        role: "member",
        name: "Anna",
        ...bundle,
        certificate: null,
        invitation: {
          id: invitation.id,
          sealedSecret: invitation.sealedSecret,
          // Whoever saw the link knows the secret and can make this MAC
          mac: invitationMac(invitation.secret, invitation.id, bundle),
        },
      };
    };
    const anna = rowFor("Anna Heizung Bad Fliese");
    const intruder = rowFor("Fremder Link Mitleser");
    // Jonas's phone confirmed Anna for this invitation and wrote the account state
    const s = server(c, [ownerRow(c), intruder]);
    s.state.otherDeviceWrites(c.opened.accountKey, {
      ...c.opened.state,
      invitations: { [encodeBytes(invitation.id)]: encodeBytes(anna.id) },
    });
    // The laptop, unlocked before, is shown the intruder under the same invitation
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const shown = loaded.value.views[1];
    if (!shown) throw new Error("no member");
    const result = await confirm(s.api, c.session, shown, loaded.value.me);
    expect(result).toEqual({ ok: false, error: "used" });
    expect(s.certified).toEqual([]);
  });
});
