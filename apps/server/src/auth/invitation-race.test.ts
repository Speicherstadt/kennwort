// Regression (review of K-203): two concurrent acceptances with the same account ID: the loser gets a 500 and its
// invitation is burned (invitations.ts: invitation claimed before createUser, outside a transaction)
import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { signInSetup } from "../testing/sign-in-setup.ts";

describe("invitation race", () => {
  it("a lost race on the account ID leaves the second invitation usable", async () => {
    const setup = await signInSetup();
    const jonas = await setup.member("weber", "owner");
    const mk = async () =>
      (await (
        await setup.request("/api/invitations", { method: "POST", token: jonas.token })
      ).json()) as { id: string; token: string };
    const a = await mk();
    const b = await mk();
    const base = {
      accountId: encodeBytes(new Uint8Array(16).fill(1)),
      loginPublicKey: encodeBytes(new Uint8Array(32).fill(2)),
      accountSalt: encodeBytes(new Uint8Array(16).fill(3)),
    };
    const [ra, rb] = await Promise.all([
      setup.request(`/auth/invitations/${a.id}/accept`, { body: { ...base, token: a.token } }),
      setup.request(`/auth/invitations/${b.id}/accept`, { body: { ...base, token: b.token } }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const again = await setup.request(
      `/auth/invitations/${(ra.status === 201 ? b : a).id}/accept`,
      {
        body: {
          ...base,
          accountId: encodeBytes(new Uint8Array(16).fill(5)),
          token: (ra.status === 201 ? b : a).token,
        },
      },
    );
    expect(again.status).toBe(201);
  });
});
