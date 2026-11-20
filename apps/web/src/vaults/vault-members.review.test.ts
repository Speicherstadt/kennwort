// Review of K-305 part 3: the members dialog against a lying server, role changes and time limits
import { changeAccess, idKey } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { ownerRow } from "../members/members.test-kit.ts";
import { addToVault, candidates, changeVaultRole, vaultMembers } from "./vault-members.ts";
import { certifiedAnna, jonasWithVaults } from "./vaults.test-kit.ts";
import { loadVaults, newVault, type Vault } from "./vaults.ts";

const bueroWithAnna = async () => {
  const w = await jonasWithVaults((c) => [ownerRow(c), certifiedAnna(c)]);
  const made = await newVault(w.api, w.c.session, "Büro");
  if (!made.ok) throw new Error(made.error);
  const current = async (api = w.api) => {
    const loaded = await loadVaults(api, w.c.session);
    if (!loaded.ok) throw new Error(loaded.error);
    const vault = loaded.value.vaults[0] as Vault;
    return { vault, people: loaded.value.people };
  };
  const { vault, people } = await current();
  const anna = candidates(vault, people)[0];
  if (!anna) throw new Error("no Anna");
  expect(await addToVault(w.api, w.c.session, vault, anna.certificate, "read")).toEqual({
    ok: true,
  });
  return { ...w, current, anna };
};

describe("review K-305 part 3", () => {
  it("lists every member the checked log names, even one the server leaves out of the members list", async () => {
    const w = await bueroWithAnna();
    const { vault, people } = await w.current();
    // A lying server drops Anna's row: she still holds the vault key by the log
    const hidden = people.filter((p) => idKey(p.accountId) !== idKey(w.anna.accountId));
    expect(vault.log.members.has(idKey(w.anna.accountId))).toBe(true);
    const shown = vaultMembers(vault, hidden, w.c.opened.accountId).map((p) => idKey(p.accountId));
    expect(shown).toContain(idKey(w.anna.accountId));
  });

  it("keeps a member's time limit when only the role changes", async () => {
    const w = await bueroWithAnna();
    let { vault } = await w.current();
    const until = Math.floor(Date.now() / 1000) + 3600;
    const opened = w.c.session.opened();
    if (!opened) throw new Error("locked");
    const signer = { accountId: opened.accountId, edSecretKey: opened.keyBlock.ed.secretKey };
    const limited = changeAccess(
      signer,
      vault.log,
      vault.ring.vaultId,
      w.anna.accountId,
      { role: "read", validUntil: until },
      Math.max(vault.log.time, Math.floor(Date.now() / 1000)),
    );
    expect(await w.api.appendLog(opened.token, limited)).toBe("ok");
    ({ vault } = await w.current());
    expect(vault.log.members.get(idKey(w.anna.accountId))?.validUntil).toBe(until);
    expect(await changeVaultRole(w.api, w.c.session, vault, w.anna.accountId, "edit")).toEqual({
      ok: true,
    });
    ({ vault } = await w.current());
    expect(vault.log.members.get(idKey(w.anna.accountId))).toMatchObject({
      role: "edit",
      validUntil: until,
    });
  });
});
