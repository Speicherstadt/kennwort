import { encodeBytes, memoryServer, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loadVaults, newVault } from "../vaults/vaults.ts";
import { loginContent, loginOf, shown } from "./entries.ts";
import { createEntryStore, type ServerFor } from "./entry-store.ts";

const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const sparkasse = {
  title: " Sparkasse ",
  username: "jonas@weber-haustechnik.de",
  password: "Rohr-Ventil-2026!",
  website: " https://sparkasse.de ",
};

/** One memory server per vault, shared by every store: as two devices share the real server */
const servers = () => {
  const byVault = new Map<string, SyncServer>();
  const serverFor: ServerFor = (_token, vaultId) => {
    const key = encodeBytes(vaultId);
    const server = byVault.get(key) ?? memoryServer();
    byVault.set(key, server);
    return server;
  };
  return { serverFor, byVault };
};

// K-306 part 1: Jonas saves the Sparkasse login in Büro; another device of his reads it back
const buero = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...w, loaded: loaded.value, vaultIdText: made.value };
};

describe("entry store", () => {
  it("saves a login and shows it, trimmed, to a second device of the same account", async () => {
    const w = await buero();
    const { serverFor } = servers();
    const phone = createEntryStore(serverFor, w.c.session);
    await phone.load(w.loaded.vaults, w.loaded.trust);
    const saved = await phone.save(w.vaultIdText, loginContent(sparkasse, names));
    if (!saved.ok) throw new Error(saved.error);
    const laptop = createEntryStore(serverFor, w.c.session);
    await laptop.load(w.loaded.vaults, w.loaded.trust);
    flush();
    const [entry] = laptop.entries();
    expect(entry && shown(entry)).toMatchObject({
      id: saved.value,
      title: "Sparkasse",
      username: "jonas@weber-haustechnik.de",
      password: "Rohr-Ventil-2026!",
      website: "https://sparkasse.de",
      vault: w.vaultIdText,
    });
  });

  it("changes an entry as its next version and keeps fields it does not know", async () => {
    const w = await buero();
    const { serverFor } = servers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    const extra = { id: "pin", name: "PIN", value: "4711", kind: "secret" as const };
    const first = loginContent(sparkasse, names);
    const saved = await store.save(w.vaultIdText, { ...first, fields: [...first.fields, extra] });
    if (!saved.ok) throw new Error(saved.error);
    flush();
    const [entry] = store.entries();
    if (!entry) throw new Error("no entry");
    const changed = loginContent(
      { ...loginOf(entry.content), password: "Neu-2027!" },
      names,
      entry.content,
    );
    expect(await store.save(w.vaultIdText, changed, saved.value)).toEqual({
      ok: true,
      value: saved.value,
    });
    flush();
    const [after] = store.entries();
    expect(after?.version).toBe(2);
    expect(after && loginOf(after.content).password).toBe("Neu-2027!");
    expect(after?.content.fields.find((f) => f.id === "pin")?.value).toBe("4711");
  });

  it("refuses a record whose content the server swapped, and saves nothing for a reader", async () => {
    const w = await buero();
    const { serverFor, byVault } = servers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    await store.save(w.vaultIdText, loginContent(sparkasse, names));
    const server = byVault.get(w.vaultIdText);
    if (!server) throw new Error("no server");
    const lying: SyncServer = {
      push: server.push,
      pull: async () => (await server.pull()).map((r) => ({ ...r, version: r.version + 1 })),
    };
    const other = createEntryStore(() => lying, w.c.session);
    await other.load(w.loaded.vaults, w.loaded.trust);
    flush();
    expect(other.entries()).toEqual([]);
    expect(other.refused().map((r) => r.error)).toEqual(["bad-signature"]);
    const reader = w.loaded.vaults.map((v) => ({ ...v, role: "read" as const }));
    const readOnly = createEntryStore(serverFor, w.c.session);
    await readOnly.load(reader, w.loaded.trust);
    expect(await readOnly.save(w.vaultIdText, loginContent(sparkasse, names))).toEqual({
      ok: false,
      error: "read-only",
    });
  });

  it("keeps a change queued when the server does not answer", async () => {
    const w = await buero();
    const down: SyncServer = {
      push: async () => {
        throw new Error("offline");
      },
      pull: async () => {
        throw new Error("offline");
      },
    };
    const store = createEntryStore(() => down, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    expect(await store.save(w.vaultIdText, loginContent(sparkasse, names))).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await store.save("unknown", loginContent(sparkasse, names))).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
