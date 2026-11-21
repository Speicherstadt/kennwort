import { shown } from "@kennwort/client/entries/entries.ts";
import { createEntryStore, type ServerFor } from "@kennwort/client/entries/entry-store.ts";
import { encodeBytes, exitReport, removeMember } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { memoryKeyValue } from "../offline/key-value.ts";
import { createLocalCopy } from "../offline/local-copy.ts";
import { sparkasseLogin } from "../shares/shares.test-kit.ts";
import { annaInBuero, recordsOf } from "../vaults/exit.test-kit.ts";
import { exitVault } from "../vaults/exit.ts";
import { loginContent } from "./entries.test-kit.ts";

// K-307 part b (P-11): the entry store around an exit – nothing written while the rotation is due,
// versions of an older epoch read with its key, also from the offline copy, a rotation that writes
// only what is behind, and what the exit report reads
type World = Awaited<ReturnType<typeof annaInBuero>>;

/** Anna leaves Büro, but the entries are not written anew: they stay in epoch 0 */
const rotatedNotRewritten = async (w: World) => {
  const failing = {
    ...w.exits,
    rotate: async () => ({ ok: false, error: "unreachable" }) as const,
  };
  await exitVault(w.deps, failing, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
  return w.reload();
};

const removedOnly = async (w: World) => {
  const vault = w.vaultOf();
  const signer = { accountId: w.c.opened.accountId, edSecretKey: w.c.opened.keyBlock.ed.secretKey };
  const time = Math.floor(Date.now() / 1000);
  await w.deps.api.appendLog(
    "t",
    removeMember(signer, vault.log, vault.ring.vaultId, w.anna.account.accountId, time),
  );
  return w.reload();
};

describe("while a rotation is due", () => {
  it("refuses a change with rotation-due, queues nothing and shows no entry as editable", async () => {
    const w = await annaInBuero();
    await removedOnly(w);
    flush();
    const saved = await w.store.save(w.vault.idText, sparkasseLogin);
    expect(saved).toEqual({ ok: false, error: "rotation-due" });
    expect(await recordsOf(w)).toEqual([[1, 0]]);
    flush();
    const entry = w.store.entries()[0];
    expect(entry?.rotationDue).toBe(true);
    expect(entry && shown(entry).editable).toBe(false);
  });
});

describe("versions of an older epoch", () => {
  it("are read with that epoch's key and kept in the offline copy", async () => {
    const w = await annaInBuero();
    const loaded = await rotatedNotRewritten(w);
    let down = false;
    const serverFor: ServerFor = (_t, vaultId) => {
      const real = w.syncOf(vaultId);
      return {
        pull: async () => {
          if (down) throw new TypeError("Failed to fetch");
          return real.pull();
        },
        push: async (record) => real.push(record),
      };
    };
    const copy = createLocalCopy(memoryKeyValue());
    await copy.useAccount("jonas");
    const laptop = createEntryStore(serverFor, w.c.session, copy);
    await laptop.load(loaded.vaults, loaded.trust);
    flush();
    expect(laptop.entries().map((e) => e.content.title)).toEqual([sparkasseLogin.title]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await copy.settled();
    expect((await copy.records(w.vault.idText)).map((r) => [r.version, r.epoch])).toEqual([[1, 0]]);
    down = true;
    const offline = createEntryStore(serverFor, w.c.session, copy);
    await offline.load(loaded.vaults, loaded.trust);
    flush();
    expect(offline.entries().map((e) => e.content.title)).toEqual([sparkasseLogin.title]);
    expect(offline.refused()).toEqual([]);
  });

  it("are written anew by a later rotation, which leaves the current epoch's alone", async () => {
    const w = await annaInBuero();
    await rotatedNotRewritten(w);
    flush();
    const note = loginContent(
      { title: "Router", username: "admin", password: "", website: "" },
      { username: "Benutzer", password: "Passwort", website: "Website" },
    );
    const saved = await w.store.save(w.vault.idText, note);
    if (!saved.ok) throw new Error(saved.error);
    expect(w.store.behind(w.vault.idText)).toBe(true);
    const exposure = { account: encodeBytes(w.anna.account.accountId), at: 1, epochs: [0] };
    const rotated = await w.store.rotate(w.vault.idText, exposure);
    expect(rotated.ok).toBe(true);
    const versions = (await w.syncOf(w.vault.ring.vaultId).pull()).map((r) => [
      encodeBytes(r.entryId) === saved.value ? "router" : "sparkasse",
      r.version,
      r.epoch,
    ]);
    expect(versions.sort()).toEqual([
      ["router", 1, 1],
      ["sparkasse", 2, 1],
    ]);
    expect(w.store.behind(w.vault.idText)).toBe(false);
  });
});

describe("what the exit report reads", () => {
  it("lists the vault with Anna's role and the entry she could read", async () => {
    const w = await annaInBuero();
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    flush();
    const [vault] = exitReport(w.anna.account.accountId, w.store.seen());
    expect(vault).toMatchObject({
      role: "edit",
      until: expect.any(Number),
      entries: [{ title: sparkasseLogin.title, type: "login", secrets: ["Passwort"] }],
    });
    expect(encodeBytes(vault?.vaultId ?? new Uint8Array())).toBe(w.vault.idText);
  });
});
