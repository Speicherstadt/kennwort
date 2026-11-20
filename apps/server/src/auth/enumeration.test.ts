// Regression (review of K-203): POST /auth/invitations/:id/accept tells whether an account ID exists, without any
// invitation token, before the token is checked (invitations.ts: `taken` check precedes token check)
import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { signInSetup } from "../testing/sign-in-setup.ts";

describe("account enumeration", () => {
  it("accepting a made-up invitation answers an existing and an unknown account ID alike", async () => {
    const setup = await signInSetup();
    const jonas = await setup.member("weber", "owner");
    const created = await setup.request("/api/invitations", { method: "POST", token: jonas.token });
    const invite = (await created.json()) as { id: string; token: string };
    const annaId = encodeBytes(new Uint8Array(16).fill(1));
    const enrol = {
      token: invite.token,
      accountId: annaId,
      loginPublicKey: encodeBytes(new Uint8Array(32).fill(2)),
      accountSalt: encodeBytes(new Uint8Array(16).fill(3)),
    };
    expect(
      (await setup.request(`/auth/invitations/${invite.id}/accept`, { body: enrol })).status,
    ).toBe(201);

    // An outsider with no invitation at all probes two account IDs
    const probe = async (accountId: string) =>
      (
        await setup.request("/auth/invitations/nothing/accept", {
          body: { ...enrol, token: "guess", accountId },
        })
      ).status;
    const unknown = encodeBytes(new Uint8Array(16).fill(9));
    expect(await probe(annaId)).toBe(await probe(unknown));
  });
});
