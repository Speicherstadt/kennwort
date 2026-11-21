import { type Certificate, emptyState, encodeBytes, isCertified, openState } from "@kennwort/core";
import { ed25519KeyPair, rootFingerprint } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { readInvitation } from "../account/invite-page.tsx";
import { annaRow, jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import {
  confirm,
  invitationLink,
  invite,
  loadMembers,
  mayConfirm,
  mayInvite,
  mayRemove,
} from "./members.ts";

// K-304 part 2: Jonas sets up Weber Haustechnik, invites Anna and confirms her
describe("loadMembers", () => {
  it("checks the list under the pinned root and finds this account in it", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c);
    const loaded = await loadMembers(server(c, [ownerRow(c), row]).api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.views.map((v) => v.status)).toEqual(["certified", "pending"]);
    expect(loaded.value.me?.role).toBe("owner");
    expect(mayInvite(loaded.value.me)).toBe(true);
    expect(mayConfirm(c.opened, loaded.value.me)).toBe(true);
  });

  it("shows nothing under a root key that is not the pinned one", async () => {
    const c = await jonasCompany();
    const { api } = server(c, [ownerRow(c)]);
    const lying = {
      ...api,
      company: async () => ({
        id: "weber",
        rootPublicKey: ed25519KeyPair().publicKey,
        policy: null,
      }),
    };
    expect(await loadMembers(lying, c.opened)).toEqual({ ok: false, error: "root-mismatch" });
  });

  it("says when the server does not answer", async () => {
    const c = await jonasCompany();
    const { api } = server(c, []);
    expect(await loadMembers({ ...api, members: async () => undefined }, c.opened)).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await loadMembers({ ...api, company: async () => undefined }, c.opened)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});

describe("who may invite and confirm", () => {
  it("lets certified owners and admins invite, and holders of the root key confirm", async () => {
    const c = await jonasCompany();
    const view = { accountId: c.opened.accountId, name: null, status: "certified" as const };
    expect(mayInvite({ ...view, role: "owner" })).toBe(true);
    expect(mayInvite({ ...view, role: "admin" })).toBe(true);
    expect(mayInvite({ ...view, role: "member" })).toBe(false);
    expect(mayInvite({ ...view, role: "owner", status: "waiting" })).toBe(false);
    expect(mayInvite(undefined)).toBe(false);
    expect(mayConfirm(c.opened, { ...view, role: "owner" })).toBe(true);
    expect(mayConfirm(c.opened, { ...view, role: "owner", status: "invalid" })).toBe(false);
    expect(mayConfirm(c.opened, undefined)).toBe(false);
    const noRoot = { ...c.opened, state: emptyState(c.opened.state.rootFingerprint) };
    expect(mayConfirm(noRoot, { ...view, role: "admin" })).toBe(false);
  });
});

describe("who may remove whom from the company (K-307)", () => {
  it("lets owners remove anyone else, admins only members, nobody themselves or twice", () => {
    const id = (byte: number) => new Uint8Array(16).fill(byte);
    const view = (
      byte: number,
      role: "owner" | "admin" | "member",
      leftAt: number | null = null,
    ) => ({ accountId: id(byte), name: null, status: "certified" as const, role, leftAt });
    const owner = view(1, "owner");
    const admin = view(2, "admin");
    expect(mayRemove(owner, view(3, "owner"))).toBe(true);
    expect(mayRemove(owner, admin)).toBe(true);
    expect(mayRemove(owner, view(3, "member"))).toBe(true);
    expect(mayRemove(owner, owner)).toBe(false);
    expect(mayRemove(owner, view(3, "member", 1))).toBe(false);
    expect(mayRemove(admin, view(3, "member"))).toBe(true);
    expect(mayRemove(admin, view(3, "admin"))).toBe(false);
    expect(mayRemove(admin, owner)).toBe(false);
    expect(mayRemove(view(4, "member"), view(3, "member"))).toBe(false);
    expect(mayRemove({ ...owner, status: "waiting" }, view(3, "member"))).toBe(false);
    expect(mayRemove(undefined, view(3, "member"))).toBe(false);
  });
});

describe("invite", () => {
  it("makes a link whose fragment carries token, secret and the pinned root", async () => {
    const c = await jonasCompany();
    const sent: { label: string; id: Uint8Array }[] = [];
    const { api } = server(c, []);
    const link = await invite(
      {
        ...api,
        invite: async (_t, invitation, label) => {
          sent.push({ label, id: invitation.id });
          return { token: "ein mal", expiresAt: 1 };
        },
      },
      c.opened,
      "Anna",
      "https://kennwort.weber-haustechnik.test",
    );
    expect(sent.map((s) => s.label)).toEqual(["Anna"]);
    const url = new URL(link ?? "");
    expect(url.origin).toBe("https://kennwort.weber-haustechnik.test");
    expect(url.pathname).toBe(`/invite/${encodeBytes(sent[0]?.id ?? new Uint8Array())}`);
    const read = readInvitation(url.hash);
    expect(read?.token).toBe("ein mal");
    expect(read?.secret).toHaveLength(32);
    expect(read?.rootFingerprint).toEqual(rootFingerprint(c.rootPublicKey));
    expect(
      await invite({ ...api, invite: async () => undefined }, c.opened, "Anna", "x"),
    ).toBeUndefined();
  });

  it("writes the link in the documented form", () => {
    expect(
      invitationLink(
        "https://k.test",
        new Uint8Array(16).fill(1),
        "t&k",
        new Uint8Array(32).fill(2),
        new Uint8Array(32).fill(3),
      ),
    ).toBe(
      "https://k.test/invite/AQEBAQEBAQEBAQEBAQEBAQ#token=t%26k&s=AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI&root=AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM",
    );
  });
});

describe("confirm", () => {
  it("remembers the invitation in the account state first, then uploads the certificate", async () => {
    const c = await jonasCompany();
    const { row, invitation } = annaRow(c);
    const s = server(c, [ownerRow(c), row]);
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const anna = loaded.value.views[1];
    if (!anna) throw new Error("no anna");
    expect(await confirm(s.api, c.session, anna, loaded.value.me)).toEqual({ ok: true });
    expect(s.calls).toEqual(["state", "certify"]);
    expect(isCertified(c.rootPublicKey, s.certified[0] as Certificate)).toBe(true);
    expect(s.certified[0]?.role).toBe("member");
    const stored = s.state.current();
    const state = openState(
      c.opened.accountKey,
      c.opened.accountId,
      stored.stateCounter,
      stored.state,
    );
    expect(state.ok && state.value.invitations).toEqual({
      [encodeBytes(invitation.id)]: encodeBytes(row.id),
    });
    expect(state.ok && Object.keys(state.value.bundles)).toEqual([encodeBytes(row.id)]);
    expect(c.session.opened()?.state.invitations).toEqual({
      [encodeBytes(invitation.id)]: encodeBytes(row.id),
    });
  });

  it("confirms nothing for an account whose keys the merged state knows otherwise", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c);
    const s = server(c, [ownerRow(c), row]);
    s.state.otherDeviceWrites(c.opened.accountKey, {
      ...c.opened.state,
      bundles: { [encodeBytes(row.id)]: new Uint8Array(32).fill(9) },
    });
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const anna = loaded.value.views[1];
    if (!anna) throw new Error("no anna");
    expect(await confirm(s.api, c.session, anna, loaded.value.me)).toEqual({
      ok: false,
      error: "other-keys",
    });
    expect(s.calls).toEqual([]);
  });

  it("confirms nothing for keys without the right MAC, and writes nothing", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c, new Uint8Array(32));
    const s = server(c, [ownerRow(c), row]);
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const anna = loaded.value.views[1];
    if (!anna) throw new Error("no anna");
    expect(await confirm(s.api, c.session, anna, loaded.value.me)).toEqual({
      ok: false,
      error: "mac-mismatch",
    });
    expect(s.calls).toEqual([]);
  });

  it("does not upload when the state could not be written, and says when the upload fails", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c);
    const s = server(c, [ownerRow(c), row]);
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const anna = loaded.value.views[1];
    if (!anna) throw new Error("no anna");
    const noState = { ...s.api, writeState: async () => ({ ok: false as const, stale: false }) };
    expect(await confirm(noState, c.session, anna, loaded.value.me)).toEqual({
      ok: false,
      error: "failed",
    });
    expect(s.certified).toEqual([]);
    const noUpload = { ...s.api, certify: async () => false };
    expect(await confirm(noUpload, c.session, anna, loaded.value.me)).toEqual({
      ok: false,
      error: "failed",
    });
  });

  it("needs a pending member and a certificate of one's own", async () => {
    const c = await jonasCompany();
    const s = server(c, [ownerRow(c)]);
    const loaded = await loadMembers(s.api, c.opened);
    if (!loaded.ok) throw new Error(loaded.error);
    const me = loaded.value.me;
    if (!me) throw new Error("no me");
    expect(await confirm(s.api, c.session, me, me)).toEqual({ ok: false, error: "failed" });
    const other = await loadMembers(server(c, [ownerRow(c), annaRow(c).row]).api, c.opened);
    const pending = other.ok ? other.value.views[1] : undefined;
    if (!pending) throw new Error("no pending member");
    expect(await confirm(s.api, c.session, pending, undefined)).toEqual({
      ok: false,
      error: "failed",
    });
    c.session.lock();
    flush();
    expect(await confirm(s.api, c.session, pending, me)).toEqual({ ok: false, error: "failed" });
  });
});
