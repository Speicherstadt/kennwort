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
        return false;
      },
    };
    const vaults = createVaultStore(failing, c.session);
    await vaults.reload();
    await vaults.reload();
    flush();
    expect(tries).toBe(1);
    expect(vaults.shown()).toEqual({ state: "ready", vaults: [], refused: [] });
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
    const offline = createVaultStore({ ...api, newVault: async () => false }, c.session);
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
