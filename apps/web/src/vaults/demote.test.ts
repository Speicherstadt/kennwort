import { encodeBytes, idKey, openRecord, sealRecord } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { sparkasseLogin } from "../shares/shares.test-kit.ts";
import { annaInBuero } from "./exit.test-kit.ts";
import { catchUp, createExits } from "./exit.ts";

// P-09: Jonas reduces Anna, who saved the Sparkasse login last, to reading. His client writes the
// entry again under his signature before the role entry, so it still opens for everyone, and
// writes anew what Anna got onto the server in between, now or at the next catch-up
type World = Awaited<ReturnType<typeof annaInBuero>>;

const annaAuthor = (w: World) => ({
  id: w.anna.account.accountId,
  edSecretKey: w.anna.account.keyBlock.ed.secretKey,
});
const server = (w: World) => w.syncOf(w.vault.ring.vaultId);
const latest = async (w: World) =>
  (await server(w).pull()).find((r) => encodeBytes(r.entryId) === w.entryIdText);

/** Anna writes the next version of the Sparkasse login, as her client would */
const annaWrites = async (w: World, password: string) => {
  const vault = w.vaultOf();
  const before = await latest(w);
  if (!before) throw new Error("no entry");
  const version = before.version + 1;
  const content = {
    ...sparkasseLogin,
    fields: sparkasseLogin.fields.map((f) => (f.kind === "secret" ? { ...f, value: password } : f)),
  };
  const record = sealRecord(
    annaAuthor(w),
    vault.ring,
    before.entryId,
    version,
    content,
    vault.log.hash,
  );
  expect((await server(w).push(record)).ok).toBe(true);
};

/** Whether the newest record opens under the vault's log as it now stands */
const opensNow = async (w: World) => {
  const vault = w.vaultOf(await w.reload());
  const record = await latest(w);
  if (!record) return false;
  return openRecord(record, vault.ring, vault.log, w.loaded.trust, 0).ok;
};

describe("reducing an editor to reading (P-09)", () => {
  it("writes her entries again under the manager's signature, then signs the role", async () => {
    const w = await annaInBuero();
    await annaWrites(w, "Anna-2026!");
    const exits = createExits(w.deps, w.exits);
    expect(await exits.changeRole(w.vaultOf(), w.anna.account.accountId, "read")).toEqual({
      ok: true,
    });
    const vault = w.vaultOf(await w.reload());
    expect(vault.log.members.get(idKey(w.anna.account.accountId))?.role).toBe("read");
    expect(idKey((await latest(w))?.author ?? new Uint8Array())).toBe(idKey(w.c.opened.accountId));
    expect(await opensNow(w)).toBe(true);
    expect(w.store.refused()).toEqual([]);
  });

  it("signs nothing when the re-save fails: she keeps editing", async () => {
    const w = await annaInBuero();
    await annaWrites(w, "Anna-2026!");
    const failing = {
      ...w.exits,
      resave: async () => ({ ok: false, error: "unreachable" }) as const,
    };
    expect(
      await createExits(w.deps, failing).changeRole(w.vaultOf(), w.anna.account.accountId, "read"),
    ).toEqual({
      ok: false,
      error: "unreachable",
    });
    expect(w.vaultOf(await w.reload()).log.members.get(idKey(w.anna.account.accountId))?.role).toBe(
      "edit",
    );
  });

  it("raises a role without any re-save", async () => {
    const w = await annaInBuero();
    const exits = createExits(w.deps, {
      ...w.exits,
      resave: async () => ({ ok: false, error: "locked" }) as const,
    });
    expect(await exits.changeRole(w.vaultOf(), w.anna.account.accountId, "manage")).toEqual({
      ok: true,
    });
    expect(
      await exits.changeRole(w.vaultOf(await w.reload()), w.anna.account.accountId, "edit"),
    ).toEqual({ ok: true });
  });

  it("catches up after going offline: what she wrote in between is refused and the entry written anew", async () => {
    const w = await annaInBuero();
    await annaWrites(w, "Anna-2026!");
    // The device stops after the role entry: no restore
    const offline = {
      ...w.exits,
      restore: async () => ({ ok: false, error: "unreachable" }) as const,
    };
    const resaved = w.exits.resave;
    const racing = {
      ...offline,
      resave: async (idText: string, accountId: Uint8Array) => {
        const done = await resaved(idText, accountId);
        await annaWrites(w, "Anna-war-schneller");
        return done;
      },
    };
    expect(
      await createExits(w.deps, racing).changeRole(w.vaultOf(), w.anna.account.accountId, "read"),
    ).toEqual({ ok: false, error: "unreachable" });
    await w.reload();
    expect(w.store.refused().map((r) => r.error)).toEqual(["not-editor"]);
    expect(w.exits.restorable(w.vault.idText)).toBe(true);
    const tried = new Set<string>();
    expect(await catchUp(w.deps, w.exits, await w.reload(), tried)).toEqual([]);
    await w.reload();
    expect(w.store.refused()).toEqual([]);
    expect(await opensNow(w)).toBe(true);
    const content = w.store.entries().find((e) => e.idText === w.entryIdText)?.content;
    expect(content?.fields.find((f) => f.kind === "secret")?.value).toBe("Anna-2026!");
    // Once per log state: nothing more to do
    expect(await catchUp(w.deps, w.exits, await w.reload(), tried)).toEqual([]);
  });
});
