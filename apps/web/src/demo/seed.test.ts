import { createEntryStore, httpServerFor } from "@kennwort/client/entries/entry-store.ts";
import { createApi } from "@kennwort/client/session/api.ts";
import { loadVaults } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, idKey } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import data from "../demo.json";
import { rememberDevice } from "../session/device.ts";
import { derive, memory } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { demoFetch } from "./demo-fetch.ts";
import { DEMO_PASSPHRASE, PEOPLE, seedDemo } from "./seed.ts";

/** The seeded company, unlocked the way the demo page does it: device remembered, passphrase typed */
const unlockSeeded = async () => {
  const seeded = await seedDemo({ derive });
  const api = createApi(demoFetch(seeded.store));
  const storage = memory();
  rememberDevice(storage, seeded.accountId, seeded.secretKey);
  const session = createSession({ api, storage, derive });
  return { seeded, api, session, unlocked: await session.unlock(DEMO_PASSPHRASE) };
};

describe("the demo's seed (K-706)", () => {
  it("unlocks with the demo passphrase only", async () => {
    const { session, unlocked } = await unlockSeeded();
    expect(unlocked.ok).toBe(true);
    session.lock();
    expect((await session.unlock("wrong passphrase")).ok).toBe(false);
  });

  it("has the vaults of Weber Haustechnik, named, and the seeded people with their status", async () => {
    const { api, session } = await unlockSeeded();
    const loaded = await loadVaults(api, session);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.refused).toEqual([]);
    const names = loaded.value.vaults.map((vault) => vault.name).sort();
    const expected = data.vaults.filter((v) => v.id !== "personal").map((v) => v.name);
    expect(names).toEqual(expect.arrayContaining(expected));
    expect(names).toHaveLength(data.vaults.length);
    expect(loaded.value.people.map((p) => p.status)).toEqual([
      "certified",
      "certified",
      "certified",
      "certified",
      "certified",
      "waiting",
    ]);
  });

  it("gives each colleague the role in the vault the log signs", async () => {
    const { api, seeded, session } = await unlockSeeded();
    const loaded = await loadVaults(api, session);
    if (!loaded.ok) throw new Error(loaded.error);
    const office = loaded.value.vaults.find((vault) => vault.name === "Büro");
    const idOf = (name: string) =>
      [...seeded.store.accounts.values()].find((account) => account.name === name)?.id ?? "";
    for (const person of PEOPLE.filter((p) => p.vaults.office)) {
      const member = [...(office?.log.members ?? [])].find(
        ([key]) => key === idKey(Uint8Array.from(Buffer.from(idOf(person.name), "base64url"))),
      );
      expect(member?.[1].role).toBe(person.vaults.office);
    }
  });

  it("holds every login sealed, and they open to what demo.json says", async () => {
    const { api, seeded, session } = await unlockSeeded();
    const raw = JSON.stringify(
      [...seeded.store.vaults.values()].map((v) => [...v.records.values()]),
    );
    for (const entry of data.entries) expect(raw).not.toContain(entry.password);
    const loaded = await loadVaults(api, session);
    if (!loaded.ok) throw new Error(loaded.error);
    const entries = createEntryStore(httpServerFor(api.syncFetch), session);
    await entries.load(loaded.value.vaults, loaded.value.trust);
    expect(entries.refused()).toEqual([]);
    const titles = entries.entries().map((entry) => entry.content.title);
    expect(titles.sort()).toEqual(data.entries.map((entry) => entry.title).sort());
    const bank = entries.entries().find((entry) => entry.content.title === "Sparkasse");
    expect(bank?.content.fields.find((f) => f.id === "password")?.value).toBe("Weber-2026!");
  });

  it("starts empty in every new store: a reload resets the demo", async () => {
    const first = await seedDemo({ derive });
    const second = await seedDemo({ derive });
    expect(encodeBytes(first.accountId)).not.toBe(encodeBytes(second.accountId));
    expect(second.store.accounts.has(encodeBytes(first.accountId))).toBe(false);
  });
});

describe("the demo's fetch", () => {
  it("never reaches the network for anything outside the API", async () => {
    const send = demoFetch((await seedDemo({ derive })).store);
    await expect(send("https://example.com/")).rejects.toThrow();
    await expect(send("/assets/app.js")).rejects.toThrow();
  });

  it("answers the API only with a session, and unknown routes as not found", async () => {
    const send = demoFetch((await seedDemo({ derive })).store);
    expect((await send("/api/vaults")).status).toBe(401);
    expect((await send("/api/nothing")).status).toBe(404);
  });
});
