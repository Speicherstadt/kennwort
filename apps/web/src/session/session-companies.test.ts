import type { AccountUpload } from "@kennwort/core";
import { encodeBytes } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";
import { stateServer } from "./state-server.test-kit.ts";

// K-605, P-27: Jonas of Weber Haustechnik also works for Müller Elektro, with an account of its own
// there that his home account opens for him
const INVITATION = {
  id: "BQUFBQUFBQUFBQUFBQUFBQ",
  token: "einladung",
  rootFingerprint: new Uint8Array(32).fill(7),
  secret: new Uint8Array(32).fill(8),
};

const jonasAtWeber = async (overrides: Parameters<typeof fakeApi>[0] = {}) => {
  const uploads: AccountUpload[] = [];
  const base = fakeApi();
  const api = fakeApi({
    setup: async (code, companyId, upload, root) => {
      uploads.push(upload);
      return base.setup(code, companyId, upload, root);
    },
    accept: async (id, token, upload) => {
      uploads.push(upload);
      return base.accept(id, token, upload);
    },
    ...overrides,
  });
  // The real accounts live in base's map: sign-in and keys go there
  const shared = { ...api, signIn: base.signIn, keys: base.keys };
  const session = createSession({ api: shared, storage: undefined, derive });
  await session.setUp("richtiger-code", PASSPHRASE);
  const home = uploads[0] as AccountUpload;
  const server = stateServer(home);
  return { session, server, uploads };
};

describe("several companies in one account", () => {
  it("joins another company with an invitation: linked first, its own account made after", async () => {
    const { session, server, uploads } = await jonasAtWeber();
    const joined = await session.companies.join(server.deps, "Müller Elektro", INVITATION);
    expect(joined.ok).toBe(true);
    const mueller = uploads[1] as AccountUpload;
    expect(joined).toEqual({ ok: true, value: encodeBytes(mueller.accountId) });
    // The state was written before the account existed: one write, the link in it
    expect(server.writes).toEqual([1]);
    flush();
    const companies = session.companies.companies();
    expect(companies.map((c) => [c.name, c.home])).toEqual([
      [undefined, true],
      ["Müller Elektro", false],
    ]);
    const link = session.opened()?.state.linked[encodeBytes(mueller.accountId)];
    expect(link?.credentials?.passphrase).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("switches to the other company and back; the home stays open, the other is wiped", async () => {
    const { session, server, uploads } = await jonasAtWeber();
    await session.companies.join(server.deps, "Müller Elektro", INVITATION);
    flush();
    const weber = session.opened();
    const homeId = encodeBytes(weber?.accountId ?? new Uint8Array());
    const muellerId = encodeBytes((uploads[1] as AccountUpload).accountId);
    expect(await session.companies.switchTo(muellerId)).toEqual({ ok: true, value: true });
    flush();
    const mueller = session.opened();
    expect(session.companies.activeId()).toBe(muellerId);
    expect(session.companies.atHome()).toBe(false);
    expect(session.accountIdText()).toBe(muellerId);
    // Linking needs the home on screen
    expect(await session.companies.join(server.deps, "Meier", INVITATION)).toEqual({
      ok: false,
      error: "not-home",
    });
    expect(await session.companies.setUp(server.deps, "Meier", "richtiger-code")).toEqual({
      ok: false,
      error: "not-home",
    });
    expect(await session.companies.unlink(server.deps, muellerId)).toBe(false);
    expect(weber?.accountKey.some((byte) => byte !== 0)).toBe(true);
    expect(await session.companies.switchTo(homeId)).toEqual({ ok: true, value: true });
    flush();
    expect(session.companies.atHome()).toBe(true);
    expect(mueller?.accountKey.every((byte) => byte === 0)).toBe(true);
    expect(weber?.accountKey.some((byte) => byte !== 0)).toBe(true);
  });

  it("wipes both accounts on the lock and drops a vault on its way", async () => {
    const { session, server, uploads } = await jonasAtWeber();
    await session.companies.join(server.deps, "Müller Elektro", INVITATION);
    flush();
    const weber = session.opened();
    await session.companies.switchTo(encodeBytes((uploads[1] as AccountUpload).accountId));
    flush();
    const mueller = session.opened();
    session.companies.startHandover({ target: "x", vaultName: "Heizung", writes: [] });
    flush();
    expect(session.companies.handover()?.vaultName).toBe("Heizung");
    session.lock();
    flush();
    expect(weber?.accountKey.every((byte) => byte === 0)).toBe(true);
    expect(mueller?.accountKey.every((byte) => byte === 0)).toBe(true);
    expect(session.companies.handover()).toBeUndefined();
    expect(session.companies.companies()).toEqual([]);
    expect(await session.companies.switchTo("anything")).toEqual({
      ok: false,
      error: "unexpected",
    });
  });

  it("removes the link again when the server refuses the invitation", async () => {
    const { session, server } = await jonasAtWeber();
    const refused = await session.companies.join(server.deps, "Müller Elektro", {
      ...INVITATION,
      token: "falsch",
    });
    expect(refused).toEqual({ ok: false, error: "invalid-invitation" });
    flush();
    expect(session.companies.companies()).toHaveLength(1);
    // Linked, then the tombstone
    expect(server.writes).toEqual([1, 2]);
    expect(
      await session.companies.join(server.deps, "Müller", { ...INVITATION, id: "kurz" }),
    ).toEqual({ ok: false, error: "invalid-invitation" });
  });

  it("refuses a company without a name, and keys the server did not take", async () => {
    let uploaded = 0;
    // The home's keys go up; every later upload fails
    const { session, server } = await jonasAtWeber({ uploadKeys: async () => uploaded++ === 0 });
    expect(await session.companies.join(server.deps, "  ", INVITATION)).toEqual({
      ok: false,
      error: "name",
    });
    expect(await session.companies.join(server.deps, "Müller", INVITATION)).toEqual({
      ok: false,
      error: "unexpected",
    });
    expect(await session.companies.setUp(server.deps, "Meier", "richtiger-code")).toEqual({
      ok: false,
      error: "unexpected",
    });
  });

  it("sets up a further company with the setup code, and removes one", async () => {
    const { session, server, uploads } = await jonasAtWeber();
    expect(await session.companies.setUp(server.deps, "Meier Bau", "falscher-code")).toEqual({
      ok: false,
      error: "wrong-code",
    });
    const made = await session.companies.setUp(server.deps, "Meier Bau", "richtiger-code");
    const meierId = encodeBytes((uploads.at(-1) as AccountUpload).accountId);
    expect(made).toEqual({ ok: true, value: meierId });
    flush();
    expect(session.companies.companies().map((c) => c.name)).toEqual([undefined, "Meier Bau"]);
    expect(await session.companies.switchTo(meierId)).toEqual({ ok: true, value: true });
    flush();
    // The further company's owner holds its own root, not the home's
    expect(session.opened()?.state.rootSecretKey).toBeDefined();
    await session.companies.switchTo(session.companies.companies()[0]?.accountId ?? "");
    flush();
    expect(await session.companies.unlink(server.deps, meierId)).toBe(true);
    flush();
    expect(session.companies.companies()).toHaveLength(1);
    expect(await session.companies.unlink(server.deps, meierId)).toBe(false);
    expect(await session.companies.switchTo(meierId)).toEqual({ ok: false, error: "unexpected" });
  });

  it("wipes an account whose sign-in ends after the lock", async () => {
    const { session, server, uploads } = await jonasAtWeber();
    await session.companies.join(server.deps, "Müller Elektro", INVITATION);
    flush();
    const switching = session.companies.switchTo(
      encodeBytes((uploads[1] as AccountUpload).accountId),
    );
    // The lock comes while the sign-in runs
    session.lock();
    expect(await switching).toEqual({ ok: false, error: "unexpected" });
    flush();
    expect(session.opened()).toBeUndefined();
  });
});
