import { describe, expect, it, vi } from "vitest";
import {
  browserSessionArea,
  createSessionKeys,
  restrictToTrustedContexts,
  type SessionArea,
} from "./session-keys.ts";

/** A storage area like Chrome's: values pass through JSON, as chrome.storage serializes them */
const fakeArea = () => {
  const items = new Map<string, string>();
  return {
    items,
    get: vi.fn(async (key: string) => {
      const value = items.get(key);
      return value === undefined ? {} : { [key]: JSON.parse(value) };
    }),
    set: vi.fn(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) items.set(key, JSON.stringify(value));
    }),
    remove: vi.fn(async (key: string) => void items.delete(key)),
    setAccessLevel: vi.fn(async (_options: { accessLevel: "TRUSTED_CONTEXTS" }) => {}),
  };
};

const failing: SessionArea = {
  get: async () => {
    throw new Error("quota");
  },
  set: async () => {
    throw new Error("quota");
  },
  remove: async () => {
    throw new Error("quota");
  },
};

const accountKey = Uint8Array.from({ length: 32 }, (_, i) => i);
const signingKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);

describe("session keys", () => {
  it("reads back exactly the keys it stored", async () => {
    const keys = createSessionKeys(fakeArea());
    expect(await keys.store({ account: accountKey, signing: signingKey })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await keys.read()).toEqual({
      ok: true,
      value: { account: accountKey, signing: signingKey },
    });
  });

  it("is locked before anything is stored and after clearing", async () => {
    const area = fakeArea();
    const keys = createSessionKeys(area);
    expect(await keys.read()).toEqual({ ok: true, value: undefined });
    await keys.store({ account: accountKey });
    expect(await keys.clear()).toEqual({ ok: true, value: undefined });
    expect(await keys.read()).toEqual({ ok: true, value: undefined });
    expect(area.items.size).toBe(0);
  });

  it("replaces the keys of an earlier unlock instead of merging them", async () => {
    const keys = createSessionKeys(fakeArea());
    await keys.store({ account: accountKey, signing: signingKey });
    await keys.store({ account: signingKey });
    expect(await keys.read()).toEqual({ ok: true, value: { account: signingKey } });
  });

  it("keeps the bytes through JSON, where a Uint8Array would become an empty object", async () => {
    const area = fakeArea();
    await createSessionKeys(area).store({ account: accountKey });
    expect(JSON.parse(area.items.get("kennwort-keys") ?? "null")).toEqual({
      account: Array.from(accountKey),
    });
  });

  it("answers malformed for anything but byte arrays in the area", async () => {
    for (const stored of [{ account: { 0: 1 } }, { account: [256] }, { account: [1.5] }, [1], 7]) {
      const area = fakeArea();
      area.items.set("kennwort-keys", JSON.stringify(stored));
      expect(await createSessionKeys(area).read()).toEqual({ ok: false, error: "malformed" });
    }
  });

  it("answers with an error instead of throwing when the area fails or is missing", async () => {
    const broken = createSessionKeys(failing);
    expect(await broken.store({ account: accountKey })).toEqual({
      ok: false,
      error: "storage-failed",
    });
    expect(await broken.read()).toEqual({ ok: false, error: "storage-failed" });
    expect(await broken.clear()).toEqual({ ok: false, error: "storage-failed" });
    const missing = createSessionKeys(undefined);
    expect(await missing.store({ account: accountKey })).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(await missing.read()).toEqual({ ok: false, error: "unavailable" });
    expect(await missing.clear()).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("the browser's areas", () => {
  it("puts keys only into chrome.storage.session, never local or sync", async () => {
    const session = fakeArea();
    const local = fakeArea();
    const sync = fakeArea();
    vi.stubGlobal("chrome", { storage: { session, local, sync } });
    try {
      await createSessionKeys(browserSessionArea()).store({ account: accountKey });
      expect(session.set).toHaveBeenCalledTimes(1);
      for (const other of [local, sync]) {
        expect(other.set).not.toHaveBeenCalled();
        expect(other.items.size).toBe(0);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("finds no area outside an extension", () => {
    expect(browserSessionArea()).toBeUndefined();
  });

  it("keeps the session area from content scripts", async () => {
    const area = fakeArea();
    expect(await restrictToTrustedContexts(area)).toEqual({ ok: true, value: undefined });
    expect(area.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
  });

  it("accepts a browser without setAccessLevel, which keeps the area trusted by itself", async () => {
    const { setAccessLevel: _, ...firefox } = fakeArea();
    expect(await restrictToTrustedContexts(firefox)).toEqual({ ok: true, value: undefined });
  });

  it("reports when the access level cannot be set or there is no area", async () => {
    const area = { ...fakeArea(), setAccessLevel: async () => Promise.reject(new Error("no")) };
    expect(await restrictToTrustedContexts(area)).toEqual({ ok: false, error: "storage-failed" });
    expect(await restrictToTrustedContexts(undefined)).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
