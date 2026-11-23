import { rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createSession } from "./session.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";

// K-604: someone the identity provider signed in makes an account like an invitee, under the root
// the ticket named, uploads no certificate and no MAC, and waits for an owner's or admin's check
const root = new Uint8Array(32).fill(9);

describe("enrolling through the identity provider", () => {
  it("makes the account here, pins the ticket's root and opens it", async () => {
    const uploads: unknown[][] = [];
    const storage = memory();
    const session = createSession({
      api: fakeApi({ uploadKeys: async (...args) => uploads.push(args) > 0 }),
      storage,
      derive,
    });
    const made = await session.enrolOidc("ticket", root, PASSPHRASE);
    expect(made.ok).toBe(true);
    const opened = session.opened();
    expect(opened?.token).toBe("token-3");
    expect(opened?.state.rootFingerprint).toEqual(rootFingerprint(root));
    expect(opened?.keyBlock.rootFingerprint).toEqual(rootFingerprint(root));
    // The keys alone: no certificate, no invitation MAC
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.slice(2)).toEqual([]);
    expect(session.device()?.accountId).toBeTruthy();
  });

  it("says the ticket is spent and opens nothing", async () => {
    const session = createSession({ api: fakeApi(), storage: memory(), derive });
    expect(await session.enrolOidc("old", root, PASSPHRASE)).toEqual({
      ok: false,
      error: "invalid-invitation",
    });
    expect(session.opened()).toBeUndefined();
    const busy = createSession({
      api: fakeApi({ enrolOidc: async () => ({ ok: false, error: "too-many-requests" }) }),
      storage: memory(),
      derive,
    });
    expect(await busy.enrolOidc("ticket", root, PASSPHRASE)).toEqual({
      ok: false,
      error: "too-many-requests",
    });
  });
});
