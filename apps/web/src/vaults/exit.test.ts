import {
  encodeBytes,
  genuineShares,
  idKey,
  makeShare,
  removeMember,
  verifyLog,
} from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { loadSharedWithMe } from "../shares/shared-with-me.ts";
import { sessionOf, sparkasseLogin } from "../shares/shares.test-kit.ts";
import { shareWith } from "../shares/shares.ts";
import { accounts, annaInBuero, certificateOf, keyHolders, recordsOf } from "./exit.test-kit.ts";
import { catchUp, createExits, dueVaults, exitVault } from "./exit.ts";
import { candidates } from "./vault-members.ts";

// K-307 part b (P-11): Anna leaves Büro; Jonas's client signs remove and rotate, wraps the new key
// to every member left, writes every entry again under it with Anna's mark, and makes the shares
// of the entries again under their new keys
type World = Awaited<ReturnType<typeof annaInBuero>>;

const annaMark = (w: World) => ({
  account: encodeBytes(w.anna.account.accountId),
  at: expect.any(Number),
  fields: ["password"],
});
const contentNow = (w: World) => w.store.entries().find((e) => e.idText === w.entryIdText)?.content;
const readsAsMax = (w: World) =>
  loadSharedWithMe(
    { ...w.shares.api, ...w.members.state.deps },
    sessionOf(w.max, "t-max", w.c.opened.state.rootFingerprint).session,
    w.loaded.trust,
    w.loaded.people,
  );

describe("removing someone from a vault (P-11)", () => {
  it("signs remove and rotate and wraps the new key to exactly who is left", async () => {
    const w = await annaInBuero();
    const done = await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [
      w.anna.account.accountId,
    ]);
    expect(done).toEqual({ ok: true });
    const log = w.vaultServer.vaults.get(w.vault.idText)?.entries ?? [];
    expect(log.slice(-2).map((e) => [e.action, e.epoch])).toEqual([
      ["remove", 0],
      ["rotate", 1],
    ]);
    expect(keyHolders(w, 1)).toEqual(accounts(w.c.opened.accountId));
    expect(keyHolders(w, 0)).toEqual(accounts(w.c.opened.accountId));
    const after = w.vaultOf(await w.reload());
    expect([after.ring.epoch, after.log.rotationDue, after.older.map((r) => r.epoch)]).toEqual([
      1,
      false,
      [0],
    ]);
  });

  it("seals the vault's name again under the new key", async () => {
    const w = await annaInBuero();
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    expect(w.vaultServer.vaults.get(w.vault.idText)?.nameEpoch).toBe(1);
    expect(w.vaultOf(await w.reload()).name).toBe("Büro");
  });

  it("still names a vault whose name is under an older key", async () => {
    const w = await annaInBuero();
    const keepsName = { ...w.deps, api: { ...w.deps.api, renameVault: async () => false } };
    await exitVault(keepsName, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    expect(w.vaultServer.vaults.get(w.vault.idText)?.nameEpoch).toBe(0);
    expect(w.vaultOf(await w.reload()).name).toBe("Büro");
  });

  it("writes every entry again in the new epoch, marked for the secrets Anna could read", async () => {
    const w = await annaInBuero();
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    expect(await recordsOf(w)).toEqual([[2, 1]]);
    expect(contentNow(w)).toEqual({ ...sparkasseLogin, toChange: [annaMark(w)] });
  });

  it("makes a share again under the entry's new key, so Max reads the new version", async () => {
    const w = await annaInBuero();
    await shareWith(
      w.shares.api,
      w.c.session,
      w.store,
      w.vaultOf(),
      w.entryIdText,
      certificateOf(w.max),
      0,
    );
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    const [read] = (await readsAsMax(w)) ?? [];
    expect(read?.version).toBe(2);
    expect(read?.content.toChange).toEqual([annaMark(w)]);
  });

  it("does not make again a share Anna signed: whoever left shares nothing any more", async () => {
    const w = await annaInBuero();
    const key = w.store.keyOf(w.vault.idText, w.entryIdText);
    if (!key) throw new Error("no key");
    const place = {
      vaultId: w.vault.ring.vaultId,
      entryId: Buffer.from(w.entryIdText, "base64url"),
    };
    const annas = makeShare(
      { id: w.anna.account.accountId, edSecretKey: w.anna.account.keyBlock.ed.secretKey },
      key.entryKey,
      certificateOf(w.max),
      place,
      { validUntil: 0, time: Math.floor(Date.now() / 1000) },
    );
    await w.shares.api.putShare("t", annas);
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    expect(w.shares.shares).toEqual([annas]);
    expect(await readsAsMax(w)).toEqual([]);
    const newKey = w.store.keyOf(w.vault.idText, w.entryIdText);
    expect(
      genuineShares(
        w.shares.shares,
        newKey?.entryKey ?? new Uint8Array(),
        place,
        w.vaultOf(await w.reload()).log,
        w.loaded.trust,
      ),
    ).toEqual([]);
  });

  it("makes Anna a candidate to add again, and sends nothing while the account is locked", async () => {
    const w = await annaInBuero();
    await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    const loaded = await w.reload();
    expect(candidates(w.vaultOf(loaded), loaded.people).map((p) => p.name)).toContain("Anna");
    w.c.session.lock();
    flush();
    expect(
      await exitVault(w.deps, w.exits, w.vaultOf(loaded), w.loaded.trust, [w.c.opened.accountId]),
    ).toEqual({ ok: false, error: "locked" });
  });

  it("refuses someone who is not in the vault and writes nothing", async () => {
    const w = await annaInBuero();
    const done = await exitVault(w.deps, w.exits, w.vaultOf(), w.loaded.trust, [
      w.max.account.accountId,
    ]);
    expect(done).toEqual({ ok: false, error: "not-member" });
    expect(w.vaultServer.vaults.get(w.vault.idText)?.entries).toHaveLength(2);
  });

  it("stops at an entry the server does not take: the rotation is still due", async () => {
    const w = await annaInBuero();
    const append = w.deps.api.appendLog;
    const deps = {
      ...w.deps,
      api: {
        ...w.deps.api,
        appendLog: (async (t, entry, ...rest) =>
          entry.action === "rotate" ? "refused" : append(t, entry, ...rest)) as typeof append,
      },
    };
    const done = await exitVault(deps, w.exits, w.vaultOf(), w.loaded.trust, [
      w.anna.account.accountId,
    ]);
    expect(done).toEqual({ ok: false, error: "refused" });
    expect(w.vaultOf(await w.reload()).log.rotationDue).toBe(true);
  });
});

describe("catching up on exits after unlock (P-11)", () => {
  it("removes someone who left the company from the vaults it manages and rotates", async () => {
    const w = await annaInBuero();
    await w.members.api.leave("t", w.anna.account.accountId);
    const loaded = await w.reload();
    expect(dueVaults(loaded).map((v) => v.idText)).toEqual([w.vault.idText]);
    expect(await catchUp(w.deps, w.exits, loaded, new Set())).toEqual([]);
    const after = await w.reload();
    expect(after.vaults[0]?.log.members.has(idKey(w.anna.account.accountId))).toBe(false);
    expect(dueVaults(after)).toEqual([]);
    expect(contentNow(w)?.toChange).toEqual([annaMark(w)]);
  });

  it("rotates after a removal the server kept without its rotation", async () => {
    const w = await annaInBuero();
    const vault = w.vaultOf();
    const signer = {
      accountId: w.c.opened.accountId,
      edSecretKey: w.c.opened.keyBlock.ed.secretKey,
    };
    const remove = removeMember(
      signer,
      vault.log,
      vault.ring.vaultId,
      w.anna.account.accountId,
      Math.floor(Date.now() / 1000),
    );
    await w.deps.api.appendLog("t", remove);
    const loaded = await w.reload();
    expect(w.vaultOf(loaded).log.rotationDue).toBe(true);
    expect(await catchUp(w.deps, w.exits, loaded, new Set())).toEqual([]);
    const after = w.vaultOf(await w.reload());
    expect([after.log.rotationDue, after.ring.epoch]).toEqual([false, 1]);
    expect(verifyLog(after.ring.vaultId, after.entries, w.loaded.trust).ok).toBe(true);
    expect(await recordsOf(w)).toEqual([[2, 1]]);
  });

  it("writes anew what a rotation left in the old epoch, as when the server hid it", async () => {
    const w = await annaInBuero();
    const failing = {
      ...w.exits,
      rotate: async () => ({ ok: false, error: "unreachable" }) as const,
    };
    await exitVault(w.deps, failing, w.vaultOf(), w.loaded.trust, [w.anna.account.accountId]);
    expect(await recordsOf(w)).toEqual([[1, 0]]);
    const loaded = await w.reload();
    expect(w.exits.behind(w.vault.idText)).toBe(true);
    expect(await catchUp(w.deps, w.exits, loaded, new Set())).toEqual([]);
    expect(await recordsOf(w)).toEqual([[2, 1]]);
    expect(contentNow(w)?.toChange).toEqual([annaMark(w)]);
    expect(w.exits.behind(w.vault.idText)).toBe(false);
  });

  it("tries a vault once per log state, so a failing exit does not loop", async () => {
    const w = await annaInBuero();
    await w.members.api.leave("t", w.anna.account.accountId);
    const loaded = await w.reload();
    const refusing = {
      ...w.deps,
      api: { ...w.deps.api, appendLog: async () => "refused" as const },
    };
    const tried = new Set<string>();
    expect(await catchUp(refusing, w.exits, loaded, tried)).toEqual([
      { idText: w.vault.idText, error: "refused" },
    ]);
    expect(await catchUp(refusing, w.exits, loaded, tried)).toEqual([]);
  });

  it("leaves vaults alone that it does not manage or that owe nothing", async () => {
    const w = await annaInBuero();
    const loaded = await w.reload();
    expect(dueVaults(loaded)).toEqual([]);
    const left = new Set([idKey(w.anna.account.accountId)]);
    const reader = {
      ...loaded,
      left,
      vaults: loaded.vaults.map((v) => ({ ...v, role: "edit" as const })),
    };
    expect(dueVaults(reader)).toEqual([]);
  });
});

describe("one exit at a time", () => {
  it("lets a catch-up started in the middle of an exit wait, then find nothing left to do", async () => {
    const w = await annaInBuero();
    const writes: string[] = [];
    let exits: ReturnType<typeof createExits> | undefined;
    const stores = {
      ...w.exits,
      // as the app's vault store: every load starts a catch-up it does not wait for
      reload: async () => {
        const loaded = await w.exits.reload();
        void exits?.catchUp(loaded);
        return loaded;
      },
      rotate: async (...args: Parameters<typeof w.exits.rotate>) => {
        writes.push("rotate");
        return w.exits.rotate(...args);
      },
    };
    exits = createExits(w.deps, stores);
    expect(await exits.remove(w.vaultOf(), w.loaded.trust, w.anna.account.accountId)).toEqual({
      ok: true,
    });
    expect(await exits.catchUp(await w.exits.reload())).toEqual([]);
    expect(writes).toEqual(["rotate"]);
    expect(await recordsOf(w)).toEqual([[2, 1]]);
  });
});
