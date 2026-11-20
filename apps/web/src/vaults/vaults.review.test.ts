// Review of PR #41 (K-305 part 2): what a lying server makes the vault client do

import { loadVaults, newVault } from "@kennwort/client/vaults/vaults.ts";
import { changeAccess } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createVaultStore } from "./vault-store.ts";
import { jonasWithVaults } from "./vaults.test-kit.ts";

describe("vaults against a lying server (review of K-305 part 2)", () => {
  it("refuses a vault with a malformed wrapped key instead of throwing", async () => {
    const { c, api } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    const lying = { ...api, vaultKeys: async () => [{ epoch: 0, wrapped: new Uint8Array(3) }] };
    const loaded = await loadVaults(lying, c.session);
    expect(loaded.ok && loaded.value.refused.map((r) => r.idText)).toEqual([made.value]);
  });

  it("shows no name for a malformed sealed name instead of throwing", async () => {
    const { c, api, store } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    const vault = store.vaults.get(made.value);
    if (!vault) throw new Error("no vault");
    vault.name = new Uint8Array(2);
    const loaded = await loadVaults(api, c.session);
    expect(loaded.ok && loaded.value.vaults.map((v) => v.name)).toEqual([undefined]);
  });

  it("does not open a vault whose access for this account ran out (isMember)", async () => {
    const { c, api, store } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    const first = await loadVaults(api, c.session);
    if (!first.ok) throw new Error("load");
    const state = first.value.vaults[0]?.log;
    if (!state) throw new Error("no log");
    const opened = c.session.opened();
    if (!opened) throw new Error("locked");
    const now = Math.floor(Date.now() / 1000);
    const signer = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
    const expire = changeAccess(
      signer,
      state,
      Buffer.from(made.value, "base64url"),
      opened.accountId,
      { role: "manage", validUntil: now + 60 },
      now,
    );
    store.vaults.get(made.value)?.entries.push(expire);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3600_000);
    const loaded = await loadVaults(api, c.session);
    vi.useRealTimers();
    expect(loaded.ok && loaded.value.vaults.map((v) => v.idText)).toEqual([]);
  });

  it("creates no personal vault when the server hides the vaults this account remembers", async () => {
    const { c, api, store } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    await loadVaults(api, c.session);
    expect(c.session.opened()?.state.logs[made.value]).toBeDefined();
    let created = 0;
    const hiding = {
      ...api,
      vaults: async () => [],
      newVault: async (t: string, id: Uint8Array) => {
        created += 1;
        return api.newVault(t, id);
      },
    };
    const vaults = createVaultStore(hiding, c.session);
    await vaults.reload();
    flush();
    expect(created).toBe(0);
    expect(store.vaults.size).toBe(1);
  });

  it("creates the personal vault once when two clients load at the same time", async () => {
    const { c, api, store } = await jonasWithVaults();
    const tabA = createVaultStore(api, c.session);
    const tabB = createVaultStore(api, c.session);
    await Promise.all([tabA.reload(), tabB.reload()]);
    expect(store.vaults.size).toBe(1);
  });

  it("does not let a slow earlier load overwrite a newer one", async () => {
    const { c, api } = await jonasWithVaults();
    const first = await newVault(api, c.session, "Büro");
    if (!first.ok) throw new Error(first.error);
    let release: () => void = () => {};
    let slowOnce = true;
    const slow = {
      ...api,
      vaults: async (t: string) => {
        const answer = await api.vaults(t);
        if (slowOnce) {
          slowOnce = false;
          await new Promise<void>((r) => {
            release = r;
          });
        }
        return answer;
      },
    };
    const vaults = createVaultStore(slow, c.session);
    const initial = vaults.reload();
    expect(await vaults.create("Lager")).toBeUndefined();
    release();
    await initial;
    flush();
    const shown = vaults.shown();
    expect(shown.state === "ready" && shown.vaults.map((v) => v.name).sort()).toEqual([
      "Büro",
      "Lager",
    ]);
  });
});
