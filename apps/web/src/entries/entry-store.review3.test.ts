import { memoryServer, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loadVaults, newVault } from "../vaults/vaults.ts";
import { type LoginInput, loginContent, loginOf } from "./entries.ts";
import { createEntryStore, type ServerFor } from "./entry-store.ts";

const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const sparkasse: LoginInput = {
  title: "Sparkasse",
  username: "jonas",
  password: "alt-1",
  website: "",
};

const buero = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...w, loaded: loaded.value, vaultIdText: made.value };
};

describe("entry store review 3 (K-306)", () => {
  it("keeps another device's change when a waiting change is synced after a send that merged it", async () => {
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
    const phone = createEntryStore(serverFor, w.c.session);
    await phone.load(w.loaded.vaults, w.loaded.trust);
    const first = await phone.save(w.vaultIdText, loginContent(sparkasse, names));
    if (!first.ok) throw new Error(first.error);
    flush();
    const v1 = phone.entries()[0]?.content;
    if (!v1) throw new Error("no entry");
    // The laptop sets the website (v2); the phone does not know yet
    const laptop = createEntryStore(serverFor, w.c.session);
    await laptop.load(w.loaded.vaults, w.loaded.trust);
    const site = { ...sparkasse, website: "https://sparkasse.de" };
    expect((await laptop.save(w.vaultIdText, loginContent(site, names, v1), first.value)).ok).toBe(
      true,
    );
    // The phone changes the password from v1; its sync merges in the website and sends v3 (held)
    holdPush = new Promise((resolve) => {
      releasePush = () => {
        holdPush = undefined;
        resolve();
      };
    });
    const one = phone.save(
      w.vaultIdText,
      loginContent({ ...sparkasse, password: "neu-1" }, names, v1),
      first.value,
    );
    await new Promise((r) => setTimeout(r, 0));
    // A second change from what the phone shows (still v1) cannot be sent and waits
    offline = true;
    const two = await phone.save(
      w.vaultIdText,
      loginContent({ ...sparkasse, password: "neu-2" }, names, v1),
      first.value,
    );
    expect(two).toEqual({ ok: false, error: "unreachable" });
    offline = false;
    releasePush();
    expect((await one).ok).toBe(true);
    // Back online: the next save sends the waiting change
    expect(
      (await phone.save(w.vaultIdText, loginContent({ ...sparkasse, title: "DATEV" }, names))).ok,
    ).toBe(true);
    const fresh = createEntryStore(serverFor, w.c.session);
    await fresh.load(w.loaded.vaults, w.loaded.trust);
    flush();
    const entry = fresh.entries().find((e) => e.idText === first.value);
    if (!entry) throw new Error("no entry");
    // The phone never touched the website: the laptop's change must survive
    expect(loginOf(entry.content).website).toBe("https://sparkasse.de");
  });
});
