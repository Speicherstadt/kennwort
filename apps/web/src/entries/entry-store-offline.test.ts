import { type EntryRecord, memoryServer, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { memoryKeyValue } from "../offline/key-value.ts";
import { createLocalCopy } from "../offline/local-copy.ts";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loadVaults, newVault } from "../vaults/vaults.ts";
import { loginContent } from "./entries.test-kit.ts";
import { createEntryStore, type ServerFor } from "./entry-store.ts";

// K-308 part b: the entries' records stay on the device once checked (P-09); without the server the
// store reads them from there, and with it they are what the server is checked against (E-13, E-15)

const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const login = (password: string) =>
  loginContent({ title: "Sparkasse", username: "jonas", password, website: "" }, names);

/** The vault's server; `lie` rewrites what a pull returns, `down` makes every call fail */
const vaultServers = () => {
  const real = memoryServer();
  let lie: ((records: EntryRecord[]) => EntryRecord[]) | undefined;
  let down = false;
  const server: SyncServer = {
    pull: async () => {
      if (down) throw new TypeError("Failed to fetch");
      const records = real.pull();
      return lie ? lie(records) : records;
    },
    push: async (record) => {
      if (down) throw new TypeError("Failed to fetch");
      return real.push(record);
    },
  };
  const serverFor: ServerFor = () => server;
  return {
    serverFor,
    lieWith: (rewrite: (records: EntryRecord[]) => EntryRecord[]) => {
      lie = rewrite;
    },
    goDown: () => {
      down = true;
    },
  };
};

const idle = async (copy: ReturnType<typeof createLocalCopy>) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await copy.settled();
};

/** Jonas saves the Sparkasse login twice (versions 1 and 2) on a device that keeps a copy */
const savedTwice = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  const servers = vaultServers();
  const copy = createLocalCopy(memoryKeyValue());
  await copy.useAccount("jonas");
  const laptop = createEntryStore(servers.serverFor, w.c.session, copy);
  await laptop.load(loaded.value.vaults, loaded.value.trust);
  const first = await laptop.save(made.value, login("Rohr-Ventil-2026!"));
  if (!first.ok) throw new Error(first.error);
  const v1 = servers.serverFor("", new Uint8Array()).pull();
  const second = await laptop.save(made.value, login("Neu-2027!"), first.value);
  if (!second.ok) throw new Error(second.error);
  await idle(copy);
  /** The same account opened anew on this device: a new store with the same copy */
  const reopen = async () => {
    const store = createEntryStore(servers.serverFor, w.c.session, copy);
    await store.load(loaded.value.vaults, loaded.value.trust);
    flush();
    return store;
  };
  return { ...servers, copy, reopen, vaultIdText: made.value, v1: await v1 };
};

const passwordOf = (store: ReturnType<typeof createEntryStore>) =>
  store.entries()[0]?.content.fields.find((f) => f.id === "password")?.value;

describe("entries from the offline copy", () => {
  it("shows the entries it checked before when the server cannot be reached", async () => {
    const { reopen, goDown, copy, vaultIdText } = await savedTwice();
    expect((await copy.records(vaultIdText)).map((r) => r.version)).toEqual([2]);
    goDown();
    const store = await reopen();
    expect(store.entries().map((e) => e.version)).toEqual([2]);
    expect(passwordOf(store)).toBe("Neu-2027!");
    expect(store.refused()).toEqual([]);
  });

  it("refuses an older version the server plays back, against the copy (E-13)", async () => {
    const { reopen, lieWith, v1 } = await savedTwice();
    lieWith(() => v1);
    const store = await reopen();
    expect(store.refused().map((r) => [r.error, r.version])).toEqual([["rollback", 1]]);
    expect(passwordOf(store)).toBe("Neu-2027!");
  });

  it("names an entry the server no longer shows as hidden, against the copy (E-15)", async () => {
    const { reopen, lieWith } = await savedTwice();
    lieWith(() => []);
    const store = await reopen();
    expect(store.refused().map((r) => r.error)).toEqual(["missing"]);
  });

  it("keeps no record the device refused, so a forgery cannot replace what it checks against", async () => {
    const { reopen, lieWith, copy, vaultIdText } = await savedTwice();
    lieWith((records) =>
      records.map((r) => ({ ...r, version: 9, signature: new Uint8Array(65).fill(1) })),
    );
    const store = await reopen();
    await idle(copy);
    expect(store.refused().map((r) => r.error)).toEqual(["bad-signature"]);
    expect((await copy.records(vaultIdText)).map((r) => r.version)).toEqual([2]);
  });
});
