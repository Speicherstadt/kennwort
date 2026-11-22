/**
 * Vault membership on the server (K-305, P-05, P-06): the signed log and the wrapped vault keys.
 * An entry is stored only if it is the next link of the chain, signed by the session, and passes
 * the client's own check (vault-chain.ts); log and keys go only to current members. A rotation
 * (K-307, P-11) comes with the new key for exactly the members the log names after it.
 */
import {
  bytes,
  encodeBytes,
  entryHash,
  GENESIS_HASH,
  type LogEntry,
  LogEntryWire,
  toWire,
} from "@kennwort/core";
import { and, asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { vaultKeys, vaultLog, vaultRequests, vaults } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { chainRefusal, isCurrent, membersOf } from "./vault-chain.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte vault key (F-02) */
const WRAPPED_KEY_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

const Append = z.object({
  entry: LogEntryWire,
  wrappedKey: bytes(WRAPPED_KEY_LENGTH).optional(),
  /** A rotation's new vault key, wrapped by the manager's client to each member (P-11) */
  wrappedKeys: z
    .array(z.object({ accountId: bytes(16), wrapped: bytes(WRAPPED_KEY_LENGTH) }))
    .optional(),
});
type WrappedKeys = NonNullable<z.infer<typeof Append>["wrappedKeys"]>;

type Deps = { db: Db; now: () => number };
type Row = typeof vaultLog.$inferSelect;
type Refusal = "stale" | "forbidden" | "invalid";

const store = (deps: Deps) => {
  const { db } = deps;
  const vaultOf = (companyId: string, vaultId: string) =>
    db
      .select()
      .from(vaults)
      .where(and(eq(vaults.companyId, companyId), eq(vaults.id, vaultId)))
      .get();
  const rowsOf = (vaultId: string, from: Pick<Db, "select"> = db): Row[] =>
    from
      .select()
      .from(vaultLog)
      .where(eq(vaultLog.vaultId, vaultId))
      .orderBy(asc(vaultLog.seq))
      .all();
  const entriesOf = (rows: Row[]) => rows.map((row) => LogEntryWire.parse(JSON.parse(row.entry)));
  const seconds = () => Math.floor(deps.now() / 1000);
  /** A current member of a vault of the session's company */
  const isMemberNow = (c: Context<TenantEnv>, vaultId: string) =>
    vaultOf(c.var.session.companyId, vaultId) !== undefined &&
    isCurrent(membersOf(entriesOf(rowsOf(vaultId))).get(c.var.session.accountId), seconds());
  return { db, vaultOf, rowsOf, entriesOf, seconds, isMemberNow };
};
type Store = ReturnType<typeof store>;

/** A rotation carries the new key for exactly the members the log names after it, once each */
const keysFitMembers = (entries: LogEntry[], keys: WrappedKeys) => {
  const members = membersOf(entries);
  const ids = new Set(keys.map((key) => encodeBytes(key.accountId)));
  return (
    ids.size === keys.length && ids.size === members.size && [...ids].every((id) => members.has(id))
  );
};

/** Why this entry may not follow the stored ones; undefined when it may */
const refusal = (
  s: Store,
  c: Context<TenantEnv>,
  rows: Row[],
  entry: LogEntry,
  wrappedKeys: WrappedKeys | undefined,
): Refusal | undefined => {
  const { accountId, companyId } = c.var.session;
  if (encodeBytes(entry.signerId) !== accountId) return "forbidden";
  const prev = rows.at(-1)?.hash ?? Buffer.from(GENESIS_HASH);
  if (entry.seq !== rows.length || encodeBytes(entry.prevHash) !== encodeBytes(prev))
    return "stale";
  // verifyLog counts rights at the entry's signed time; the server also wants a current member
  // now, so no one whose access ran out appends with a backdated entry (review of K-305). Signed
  // times never go back, so a current member's rights are those verifyLog checks: a manager
  // anything, any member her own rekey with her renewed keys (P-12)
  const entries = s.entriesOf(rows);
  if (rows.length > 0) {
    if (!isCurrent(membersOf(entries).get(accountId), s.seconds())) return "forbidden";
  } else if (s.vaultOf(companyId, encodeBytes(entry.vaultId))?.createdBy !== accountId) {
    // Only who created the vault writes its genesis: no colleague takes a new vault over
    return "forbidden";
  }
  const refused = chainRefusal(s.db, companyId, entry.vaultId, [...entries, entry], s.seconds());
  if (refused) return refused;
  return wrappedKeys && !keysFitMembers([...entries, entry], wrappedKeys) ? "invalid" : undefined;
};

const append = (s: Store, deps: Deps) => async (c: Context<TenantEnv>) => {
  const vaultId = c.req.param("vaultId") ?? "";
  if (!s.vaultOf(c.var.session.companyId, vaultId)) return c.json({ error: "not-found" }, 404);
  const body = Append.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "invalid" }, 400);
  const { entry, wrappedKey, wrappedKeys } = body.data;
  const takesKey = entry.action === "create" || entry.action === "add";
  const wellFormed =
    encodeBytes(entry.vaultId) === vaultId &&
    takesKey === (wrappedKey !== undefined) &&
    (entry.action === "rotate") === (wrappedKeys !== undefined);
  if (!wellFormed) return c.json({ error: "invalid" }, 400);
  const stored = s.db.transaction((tx) => {
    const rows = s.rowsOf(vaultId, tx);
    const refused = refusal(s, c, rows, entry, wrappedKeys);
    if (refused) return { refused, seq: rows.length };
    tx.insert(vaultLog)
      .values({
        vaultId,
        seq: entry.seq,
        entry: JSON.stringify(toWire(entry)),
        hash: Buffer.from(entryHash(entry)),
        storedAt: deps.now(),
      })
      .run();
    // An add, or a role change that makes a member current again, answers their request; a role
    // change that leaves their time run out does not (review of K-305)
    const current = entry.validUntil === 0 || entry.validUntil > s.seconds();
    if (entry.action === "add" || (entry.action === "role" && current))
      tx.delete(vaultRequests)
        .where(
          and(
            eq(vaultRequests.vaultId, vaultId),
            eq(vaultRequests.accountId, encodeBytes(entry.accountId)),
          ),
        )
        .run();
    // Who is removed gets no key of the vault any more, not even the old ones (P-11)
    if (entry.action === "remove")
      tx.delete(vaultKeys)
        .where(
          and(
            eq(vaultKeys.vaultId, vaultId),
            eq(vaultKeys.accountId, encodeBytes(entry.accountId)),
          ),
        )
        .run();
    for (const key of wrappedKeys ?? [])
      tx.insert(vaultKeys)
        .values({
          vaultId,
          accountId: encodeBytes(key.accountId),
          epoch: entry.epoch,
          wrapped: Buffer.from(key.wrapped),
        })
        .run();
    // A member removed and added again in the same epoch gets the newly wrapped key
    if (wrappedKey)
      tx.insert(vaultKeys)
        .values({
          vaultId,
          accountId: encodeBytes(entry.accountId),
          epoch: entry.epoch,
          wrapped: Buffer.from(wrappedKey),
        })
        .onConflictDoUpdate({
          target: [vaultKeys.vaultId, vaultKeys.accountId, vaultKeys.epoch],
          set: { wrapped: Buffer.from(wrappedKey) },
        })
        .run();
    return { refused: undefined, seq: entry.seq };
  });
  if (stored.refused === "stale") return c.json({ error: "stale", seq: stored.seq }, 409);
  if (stored.refused === "forbidden") return c.json({ error: "forbidden" }, 403);
  if (stored.refused) return c.json({ error: "invalid" }, 400);
  return c.json({ seq: stored.seq }, 201);
};

/** A sealed name (F-01): version, nonce, 1 to 100 characters of up to 4 bytes, tag */
const SEALED_NAME = { min: 1 + 24 + 1 + 16, max: 1 + 24 + 400 + 16 };
const Rename = z.object({
  epoch: z.number().int().nonnegative(),
  name: bytes().refine((b) => b.length >= SEALED_NAME.min && b.length <= SEALED_NAME.max),
});

/** A current manager names the vault, sealed with the key of the vault's current epoch (P-05) */
const rename = (s: Store) => async (c: Context<TenantEnv>) => {
  const vaultId = c.req.param("vaultId") ?? "";
  if (!s.isMemberNow(c, vaultId)) return c.json({ error: "not-found" }, 404);
  const body = Rename.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "invalid" }, 400);
  const entries = s.entriesOf(s.rowsOf(vaultId));
  if (membersOf(entries).get(c.var.session.accountId)?.role !== "manage")
    return c.json({ error: "forbidden" }, 403);
  const epoch = Math.max(...entries.map((e) => e.epoch));
  if (body.data.epoch !== epoch) return c.json({ error: "invalid" }, 400);
  s.db
    .update(vaults)
    .set({ name: Buffer.from(body.data.name), nameEpoch: epoch })
    .where(eq(vaults.id, vaultId))
    .run();
  return c.json({ epoch });
};

const keysOf = (s: Store, vaultId: string, accountId: string) =>
  s.db
    .select()
    .from(vaultKeys)
    .where(and(eq(vaultKeys.vaultId, vaultId), eq(vaultKeys.accountId, accountId)))
    .orderBy(asc(vaultKeys.epoch))
    .all();

export const logRoutes = (deps: Deps) => {
  const s = store(deps);
  return new Hono<TenantEnv>()
    .get("/vaults", (c) => {
      const me = c.var.session.accountId;
      const held = s.db.select().from(vaultKeys).where(eq(vaultKeys.accountId, me)).all();
      const ids = [...new Set(held.map((row) => row.vaultId))].filter((id) => s.isMemberNow(c, id));
      const named = ids.map((id) => {
        const vault = s.vaultOf(c.var.session.companyId, id);
        return {
          id,
          name: vault?.name ? encodeBytes(vault.name) : null,
          nameEpoch: vault?.nameEpoch ?? null,
        };
      });
      return c.json({ vaults: named });
    })
    .get("/vaults/:vaultId/log", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!s.isMemberNow(c, vaultId)) return c.json({ error: "not-found" }, 404);
      return c.json({ entries: s.entriesOf(s.rowsOf(vaultId)).map(toWire) });
    })
    .get("/vaults/:vaultId/keys", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!s.isMemberNow(c, vaultId)) return c.json({ error: "not-found" }, 404);
      const rows = keysOf(s, vaultId, c.var.session.accountId);
      return c.json({
        keys: rows.map((row) => ({ epoch: row.epoch, wrapped: encodeBytes(row.wrapped) })),
      });
    })
    .post("/vaults/:vaultId/log", append(s, deps))
    .put("/vaults/:vaultId/name", rename(s));
};
