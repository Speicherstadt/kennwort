import { personalVaultId } from "@kennwort/client/vaults/vaults.ts";
import { encodeBytes } from "@kennwort/core";
import { m } from "@kennwort/ui";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createVaultStore } from "./vault-store.ts";
import { jonasWithVaults } from "./vaults.test-kit.ts";

// K-305 part 2: the personal vault comes by itself, once
describe("createVaultStore", () => {
  it("creates the personal vault on the first load of an account without vaults", async () => {
    const { c, api, store } = await jonasWithVaults();
    const vaults = createVaultStore(api, c.session);
    await vaults.reload();
    flush();
    const shown = vaults.shown();
    expect(shown.state === "ready" && shown.vaults.map((v) => [v.name, v.role])).toEqual([
      [m.vaults_personal_name(), "manage"],
    ]);
    await vaults.reload();
    expect(store.vaults.size).toBe(1);
  });

  it("tries the personal vault only once, and shows the empty list when it cannot be made", async () => {
    const { c, api } = await jonasWithVaults();
    let tries = 0;
    const failing = {
      ...api,
      newVault: async () => {
        tries += 1;
        return "failed" as const;
      },
    };
    const vaults = createVaultStore(failing, c.session);
    await vaults.reload();
    await vaults.reload();
    flush();
    expect(tries).toBe(1);
    const shown = vaults.shown();
    expect(shown.state === "ready" && [shown.vaults, shown.refused]).toEqual([[], []]);
  });

  it("adds a vault created on the page and says why one could not be created", async () => {
    const { c, api } = await jonasWithVaults();
    const vaults = createVaultStore(api, c.session);
    await vaults.reload();
    expect(await vaults.create("Büro")).toBeUndefined();
    flush();
    const shown = vaults.shown();
    expect(shown.state === "ready" && shown.vaults.map((v) => v.name).sort()).toEqual(
      ["Büro", m.vaults_personal_name()].sort(),
    );
    const offline = createVaultStore(
      { ...api, newVault: async () => "failed" as const },
      c.session,
    );
    expect(await offline.create("Lager")).toBe("unreachable");
  });

  it("says when the vaults cannot be loaded", async () => {
    const { c, api } = await jonasWithVaults();
    const vaults = createVaultStore({ ...api, vaults: async () => undefined }, c.session);
    await vaults.reload();
    flush();
    expect(vaults.shown()).toEqual({ state: "failed", error: "unreachable" });
  });
});

describe("the personal vault's ID", () => {
  it("is the same on every device, and one that died after taking the ID leaves it to the next", async () => {
    const { c, api, store } = await jonasWithVaults();
    const opened = c.session.opened();
    if (!opened) throw new Error("locked");
    // another device took the ID, then stopped before its genesis
    expect(await api.newVault(opened.token, personalVaultId(opened))).toBe("ok");
    const vaults = createVaultStore(api, c.session);
    await vaults.reload();
    flush();
    const shown = vaults.shown();
    expect(shown.state === "ready" && shown.vaults.map((v) => v.idText)).toEqual([
      encodeBytes(personalVaultId(opened)),
    ]);
    expect(store.vaults.size).toBe(1);
  });
});

describe("an account whose keys are not confirmed yet", () => {
  it("gets its personal vault on the first load after the confirmation, in the same store", async () => {
    let confirmed = false;
    const { c, api, store } = await jonasWithVaults();
    const rows = async () => {
      const all = await api.members("token-1");
      return confirmed ? all : all?.map((row) => ({ ...row, certificate: null }));
    };
    const vaults = createVaultStore({ ...api, members: rows }, c.session);
    await vaults.reload();
    expect(store.vaults.size).toBe(0);
    confirmed = true;
    await vaults.reload();
    expect(store.vaults.size).toBe(1);
  });
});
