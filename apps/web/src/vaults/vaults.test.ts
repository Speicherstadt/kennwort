import { openState } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { jonasWithVaults } from "./vaults.test-kit.ts";
import { loadVaults, newVault } from "./vaults.ts";

// K-305 part 2: Jonas creates the vault "Büro" and his client checks what the server hands back
describe("newVault and loadVaults", () => {
  it("creates a vault Jonas manages and reads it back by its checked log", async () => {
    const { c, api } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    const loaded = await loadVaults(api, c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.refused).toEqual([]);
    expect(loaded.value.vaults.map((v) => [v.idText, v.name, v.role])).toEqual([
      [made.value, "Büro", "manage"],
    ]);
  });

  it("remembers how far the log reached, in the account state on the server too", async () => {
    const { c, api, members } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    await loadVaults(api, c.session);
    expect(c.session.opened()?.state.logs[made.value]?.seq).toBe(0);
    const stored = await members.state.deps.keys("token-1");
    if (!stored) throw new Error("no state");
    const opened = c.session.opened();
    if (!opened) throw new Error("locked");
    const served = openState(
      opened.accountKey,
      opened.accountId,
      stored.stateCounter,
      stored.state,
    );
    expect(served.ok && served.value.logs[made.value]?.seq).toBe(0);
  });

  it("refuses a log the server cut back behind what this account saw (E-07)", async () => {
    const { c, api, store } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    await loadVaults(api, c.session);
    const vault = store.vaults.get(made.value);
    if (!vault) throw new Error("no vault");
    vault.entries.length = 0;
    const loaded = await loadVaults(api, c.session);
    expect(loaded.ok && loaded.value).toEqual({
      vaults: [],
      refused: [{ idText: made.value, error: "empty" }],
    });
  });

  it("refuses a vault whose genesis no certified account signed", async () => {
    const { c, api, store } = await jonasWithVaults();
    const made = await newVault(api, c.session, "Büro");
    if (!made.ok) throw new Error(made.error);
    const vault = store.vaults.get(made.value);
    const genesis = vault?.entries[0];
    if (!vault || !genesis) throw new Error("no vault");
    vault.entries[0] = { ...genesis, signature: new Uint8Array(65).fill(1) };
    const loaded = await loadVaults(api, c.session);
    expect(loaded.ok && loaded.value.refused).toEqual([
      { idText: made.value, error: "bad-signature" },
    ]);
  });

  it("shows no name the server moved from another vault", async () => {
    const { c, api, store } = await jonasWithVaults();
    const buero = await newVault(api, c.session, "Büro");
    const lager = await newVault(api, c.session, "Lager");
    if (!buero.ok || !lager.ok) throw new Error("not made");
    const a = store.vaults.get(buero.value);
    const b = store.vaults.get(lager.value);
    if (!a || !b) throw new Error("no vault");
    a.name = b.name;
    const loaded = await loadVaults(api, c.session);
    const names = loaded.ok ? loaded.value.vaults.map((v) => [v.idText, v.name]) : [];
    expect(names).toContainEqual([buero.value, undefined]);
    expect(names).toContainEqual([lager.value, "Lager"]);
  });

  it("trusts nothing under a root key that is not the pinned one", async () => {
    const { c, api } = await jonasWithVaults();
    const lying = {
      ...api,
      company: async () => ({
        id: "weber",
        rootPublicKey: ed25519KeyPair().publicKey,
        policy: null,
      }),
    };
    expect(await loadVaults(lying, c.session)).toEqual({ ok: false, error: "untrusted" });
    expect(await newVault(lying, c.session, "Büro")).toEqual({ ok: false, error: "uncertified" });
  });

  it("says when the server does not answer", async () => {
    const { c, api } = await jonasWithVaults();
    expect(await loadVaults({ ...api, vaults: async () => undefined }, c.session)).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(await newVault({ ...api, newVault: async () => false }, c.session, "Büro")).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
