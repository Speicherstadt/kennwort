import { loginOf } from "@kennwort/client/entries/entries.ts";
import { createEntryStore, type ServerFor } from "@kennwort/client/entries/entry-store.ts";
import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, memoryServer, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loginContent } from "./entries.test-kit.ts";

const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const login = (title: string) =>
  loginContent({ title, username: "jonas", password: "pw", website: "" }, names);

const buero = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...w, loaded: loaded.value, vaultIdText: made.value };
};

/** A memory server per vault whose pulls can be held until released */
const gatedServers = () => {
  const byVault = new Map<string, SyncServer>();
  let gate: Promise<void> | undefined;
  let open = () => {};
  const hold = () => {
    gate = new Promise((resolve) => {
      open = () => {
        gate = undefined;
        resolve();
      };
    });
  };
  const serverFor: ServerFor = (_t, vaultId) => {
    const key = encodeBytes(vaultId);
    const inner = byVault.get(key) ?? memoryServer();
    byVault.set(key, inner);
    return {
      push: inner.push,
      pull: async () => {
        const waiting = gate;
        const records = await inner.pull();
        if (waiting) await waiting;
        return records;
      },
    };
  };
  return { serverFor, hold, release: () => open() };
};

const titles = (store: ReturnType<typeof createEntryStore>) =>
  store
    .entries()
    .map((e) => loginOf(e.content).title)
    .sort();

describe("entry store review (K-306)", () => {
  it("keeps both of two saves made at the same time", async () => {
    const w = await buero();
    const { serverFor } = gatedServers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    const [a, b] = await Promise.all([
      store.save(w.vaultIdText, login("Sparkasse")),
      store.save(w.vaultIdText, login("DATEV")),
    ]);
    expect(a.ok && b.ok).toBe(true);
    flush();
    expect(titles(store)).toEqual(["DATEV", "Sparkasse"]);
  });

  it("keeps a change saved while a load is still pulling", async () => {
    const w = await buero();
    const { serverFor, hold, release } = gatedServers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    hold();
    const loading = store.load(w.loaded.vaults, w.loaded.trust);
    // the save's own pull also waits; let it through, but keep the load's pull waiting
    const saving = store.save(w.vaultIdText, login("Sparkasse"));
    release();
    await saving;
    await loading;
    flush();
    expect(titles(store)).toEqual(["Sparkasse"]);
  });

  it("does not bring back a vault's entries from an older load that ends after a newer one", async () => {
    const w = await buero();
    const { serverFor, hold, release } = gatedServers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    await store.save(w.vaultIdText, login("Sparkasse"));
    hold();
    const older = store.load(w.loaded.vaults, w.loaded.trust); // pull held
    // Jonas was removed from Büro: the newer load lists no vault
    await store.load([], w.loaded.trust);
    flush();
    expect(store.entries()).toEqual([]);
    release();
    await older;
    flush();
    expect(store.entries()).toEqual([]);
  });
});
