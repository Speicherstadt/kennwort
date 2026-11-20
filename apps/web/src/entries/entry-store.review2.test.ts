import { loginOf } from "@kennwort/client/entries/entries.ts";
import { createEntryStore, type ServerFor } from "@kennwort/client/entries/entry-store.ts";
import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import { memoryServer, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loginContent } from "./entries.test-kit.ts";

const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const login = (title: string, password: string) =>
  loginContent({ title, username: "jonas", password, website: "" }, names);

const buero = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...w, loaded: loaded.value, vaultIdText: made.value };
};

describe("entry store review 2 (K-306)", () => {
  it("does not drop a second change to an entry when the first sync ends after the second failed", async () => {
    const w = await buero();
    const inner = memoryServer();
    let holdPush: Promise<void> | undefined;
    let releasePush = () => {};
    let offline = false;
    const server: SyncServer = {
      pull: async () => {
        if (offline) throw new Error("offline");
        return inner.pull();
      },
      push: async (record) => {
        const waiting = holdPush;
        if (waiting) await waiting;
        if (offline) throw new Error("offline");
        return inner.push(record);
      },
    };
    const serverFor: ServerFor = () => server;
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    const first = await store.save(w.vaultIdText, login("Sparkasse", "alt-1"));
    if (!first.ok) throw new Error(first.error);
    // Change 1 is on its way (its push held) ...
    holdPush = new Promise((resolve) => {
      releasePush = () => {
        holdPush = undefined;
        resolve();
      };
    });
    const one = store.save(w.vaultIdText, login("Sparkasse", "neu-1"), first.value);
    await new Promise((r) => setTimeout(r, 0));
    // ... then the connection drops for change 2, which stays waiting on the device
    offline = true;
    const two = await store.save(w.vaultIdText, login("Sparkasse", "neu-2"), first.value);
    expect(two).toEqual({ ok: false, error: "unreachable" });
    offline = false;
    releasePush();
    expect((await one).ok).toBe(true);
    // Back online: any next save syncs the queue, change 2 included
    const other = await store.save(w.vaultIdText, login("DATEV", "x"));
    expect(other.ok).toBe(true);
    const laptop = createEntryStore(serverFor, w.c.session);
    await laptop.load(w.loaded.vaults, w.loaded.trust);
    flush();
    const sparkasse = laptop.entries().find((e) => e.idText === first.value);
    expect(sparkasse && loginOf(sparkasse.content).password).toBe("neu-2");
  });
});
