import { idKey } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import {
  addToVault,
  candidates,
  changeVaultRole,
  removeFromVault,
  vaultMembers,
} from "./vault-members.ts";
import { certifiedAnna, jonasWithVaults } from "./vaults.test-kit.ts";
import { loadVaults, newVault, type Vault } from "./vaults.ts";

// K-305 part 3: Jonas adds Anna to the vault Büro, makes her an editor and removes her again
const buero = async () => {
  const w = await jonasWithVaults((c) => [ownerRow(c), certifiedAnna(c)]);
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const current = async (): Promise<{ vault: Vault; people: Parameters<typeof candidates>[1] }> => {
    const loaded = await loadVaults(w.api, w.c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.value.refused).toEqual([]);
    const vault = loaded.value.vaults[0];
    if (!vault) throw new Error("no vault");
    return { vault, people: loaded.value.people };
  };
  return { ...w, current };
};

describe("vault members", () => {
  it("offers only certified people outside the vault, and Jonas as its manager", async () => {
    const w = await buero();
    const { vault, people } = await w.current();
    expect(candidates(vault, people).map((p) => p.name)).toEqual(["Anna"]);
    const members = vaultMembers(vault, people, w.c.opened.accountId);
    expect(members.map((p) => [p.role, p.me])).toEqual([["manage", true]]);
  });

  it("adds Anna, changes her role and removes her: every entry passes the client's check", async () => {
    const w = await buero();
    let { vault, people } = await w.current();
    const anna = candidates(vault, people)[0];
    if (!anna) throw new Error("no Anna");
    expect(await addToVault(w.api, w.c.session, vault, anna.certificate, "read")).toEqual({
      ok: true,
    });
    ({ vault, people } = await w.current());
    expect(vaultMembers(vault, people, w.c.opened.accountId).map((p) => [p.name, p.role])).toEqual([
      [null, "manage"],
      ["Anna", "read"],
    ]);
    expect(candidates(vault, people)).toEqual([]);
    expect(await changeVaultRole(w.api, w.c.session, vault, anna.accountId, "edit")).toEqual({
      ok: true,
    });
    ({ vault } = await w.current());
    expect(vault.log.members.get(idKey(anna.accountId))?.role).toBe("edit");
    expect(await removeFromVault(w.api, w.c.session, vault, anna.accountId)).toEqual({ ok: true });
    ({ vault, people } = await w.current());
    expect(vault.log.members.has(idKey(anna.accountId))).toBe(false);
    expect(candidates(vault, people).map((p) => p.name)).toEqual(["Anna"]);
  });

  it("signs no time before the newest entry, even when this device's clock runs behind", async () => {
    const w = await buero();
    const { vault, people } = await w.current();
    const anna = candidates(vault, people)[0];
    if (!anna) throw new Error("no Anna");
    const ahead = { ...vault, log: { ...vault.log, time: vault.log.time + 120 } };
    await addToVault(w.api, w.c.session, ahead, anna.certificate, "read");
    const stored = w.store.vaults.get(vault.idText)?.entries.at(-1);
    expect(stored?.time).toBe(vault.log.time + 120);
  });

  it("passes on what the server answers, and nothing goes out when the account is locked", async () => {
    const w = await buero();
    const { vault, people } = await w.current();
    const anna = candidates(vault, people)[0];
    if (!anna) throw new Error("no Anna");
    const stale = { ...w.api, appendLog: async () => "stale" as const };
    expect(await addToVault(stale, w.c.session, vault, anna.certificate, "read")).toEqual({
      ok: false,
      error: "stale",
    });
    w.c.session.lock();
    flush();
    expect(await removeFromVault(w.api, w.c.session, vault, anna.accountId)).toEqual({
      ok: false,
      error: "locked",
    });
    expect(await changeVaultRole(w.api, w.c.session, vault, anna.accountId, "edit")).toEqual({
      ok: false,
      error: "locked",
    });
    expect(await addToVault(w.api, w.c.session, vault, anna.certificate, "edit")).toEqual({
      ok: false,
      error: "locked",
    });
  });
});
