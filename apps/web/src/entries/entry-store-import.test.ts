import { createEntryStore, type ServerFor } from "@kennwort/client/entries/entry-store.ts";
import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes, memoryServer, removeMember, type SyncServer } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { annaInBuero, recordsOf } from "../vaults/exit.test-kit.ts";
import { jonasWithVaults } from "../vaults/vaults.test-kit.ts";
import { loginContent } from "./entries.test-kit.ts";

// K-501: the import writes many new entries through the store's normal write path, one sync per
// batch; what does not reach the server leaves the queue, so it never goes out later unseen
const names = { username: "Benutzername", password: "Passwort", website: "Website" };
const login = (title: string) =>
  loginContent({ title, username: "jonas", password: "Rohr-Ventil-2026!", website: "" }, names);

type Faults = { down?: boolean; refuse?: boolean };
/** One memory server per vault; `down` fails every request, `refuse` turns away one entry */
const servers = (faults: Faults = {}) => {
  const byVault = new Map<string, SyncServer>();
  const pushed: string[] = [];
  const serverFor: ServerFor = (_token, vaultId) => {
    const key = encodeBytes(vaultId);
    const real = byVault.get(key) ?? memoryServer();
    byVault.set(key, real);
    return {
      pull: async () => {
        if (faults.down) throw new TypeError("Failed to fetch");
        return real.pull();
      },
      push: async (record) => {
        if (faults.down) throw new TypeError("Failed to fetch");
        const id = encodeBytes(record.entryId);
        if (!pushed.includes(id)) pushed.push(id);
        // The second entry ever pushed is turned away, however often it is tried
        if (faults.refuse && pushed[1] === id) return { ok: false, current: undefined };
        return real.push(record);
      },
    };
  };
  return { serverFor, byVault, pushed };
};

const buero = async () => {
  const w = await jonasWithVaults();
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const loaded = await loadVaults(w.api, w.c.session);
  if (!loaded.ok) throw new Error(loaded.error);
  return { ...w, loaded: loaded.value, vaultIdText: made.value };
};

describe("saving imported entries", () => {
  it("writes a batch of new entries in one call, read back by another device", async () => {
    const w = await buero();
    const { serverFor } = servers();
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    const saved = await store.saveNew(w.vaultIdText, [login("DATEV"), login("Sparkasse")]);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.saved).toHaveLength(2);
    expect(saved.value.unsaved).toBe(0);
    const laptop = createEntryStore(serverFor, w.c.session);
    await laptop.load(w.loaded.vaults, w.loaded.trust);
    flush();
    expect(laptop.entries().map((e) => e.content.title)).toEqual(["DATEV", "Sparkasse"]);
    expect(laptop.entries().map((e) => e.idText)).toEqual(saved.value.saved);
  });

  it("leaves nothing queued when the server does not answer", async () => {
    const w = await buero();
    const faults: Faults = {};
    const { serverFor, pushed } = servers(faults);
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    faults.down = true;
    expect(await store.saveNew(w.vaultIdText, [login("DATEV")])).toEqual({
      ok: false,
      error: "unreachable",
    });
    faults.down = false;
    const next = await store.save(w.vaultIdText, login("Router"));
    expect(next.ok).toBe(true);
    // Only the later entry went out: the failed import is not sent behind the person's back
    expect(pushed).toEqual([next.ok && next.value]);
  });

  it("counts an entry the server turned away as unsaved and drops it from the queue", async () => {
    const w = await buero();
    const { serverFor, byVault } = servers({ refuse: true });
    const store = createEntryStore(serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    const saved = await store.saveNew(w.vaultIdText, [login("A"), login("B"), login("C")]);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.value.saved).toHaveLength(2);
    expect(saved.value.unsaved).toBe(1);
    const again = await store.save(w.vaultIdText, login("D"));
    expect(again.ok).toBe(true);
    const server = [...byVault.values()][0];
    // A, C and D: B was turned away and is not sent again by a later save
    expect((await server?.pull())?.length).toBe(3);
  });

  it("writes nothing while a rotation is due", async () => {
    const w = await annaInBuero();
    const vault = w.vaultOf();
    const signer = {
      accountId: w.c.opened.accountId,
      edSecretKey: w.c.opened.keyBlock.ed.secretKey,
    };
    await w.deps.api.appendLog(
      "t",
      removeMember(
        signer,
        vault.log,
        vault.ring.vaultId,
        w.anna.account.accountId,
        Math.floor(Date.now() / 1000),
      ),
    );
    await w.reload();
    flush();
    expect(await w.store.saveNew(w.vault.idText, [login("DATEV")])).toEqual({
      ok: false,
      error: "rotation-due",
    });
    expect(await recordsOf(w)).toEqual([[1, 0]]);
  });

  it("writes nothing into a vault it does not know", async () => {
    const w = await buero();
    const store = createEntryStore(servers().serverFor, w.c.session);
    await store.load(w.loaded.vaults, w.loaded.trust);
    expect(await store.saveNew("unknown", [login("DATEV")])).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
