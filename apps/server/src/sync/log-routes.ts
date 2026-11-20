/**
 * Vault membership on the server (K-305, P-05, P-06): the signed log and the wrapped vault keys.
 * An entry is stored only if it is the next link of the chain, signed by the session, and passes
 * the client's own check (vault-chain.ts); log and keys go only to current members.
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
import { vaultKeys, vaultLog, vaults } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { chainRefusal, isCurrent, membersOf } from "./vault-chain.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte vault key (F-02) */
const WRAPPED_KEY_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

const Append = z.object({
  entry: LogEntryWire,
  wrappedKey: bytes(WRAPPED_KEY_LENGTH).optional(),
});

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

/** Why this entry may not follow the stored ones; undefined when it may */
const refusal = (
  s: Store,
  c: Context<TenantEnv>,
  rows: Row[],
  entry: LogEntry,
): Refusal | undefined => {
  const { accountId, companyId } = c.var.session;
  if (encodeBytes(entry.signerId) !== accountId) return "forbidden";
  const prev = rows.at(-1)?.hash ?? Buffer.from(GENESIS_HASH);
  if (entry.seq !== rows.length || encodeBytes(entry.prevHash) !== encodeBytes(prev))
    return "stale";
  // The key rotation comes with K-307, which also hands every member the new vault key
  if (entry.action === "rotate") return "invalid";
  // verifyLog counts rights at the entry's signed time; the server also wants a manager now, so
  // no one whose access ran out appends with a backdated entry (review of K-305)
  const entries = s.entriesOf(rows);
  if (rows.length > 0) {
    const signer = membersOf(entries).get(accountId);
    if (signer?.role !== "manage" || !isCurrent(signer, s.seconds())) return "forbidden";
  }
  return chainRefusal(s.db, companyId, entry.vaultId, [...entries, entry], s.seconds());
};

const append = (s: Store, deps: Deps) => async (c: Context<TenantEnv>) => {
  const vaultId = c.req.param("vaultId") ?? "";
  if (!s.vaultOf(c.var.session.companyId, vaultId)) return c.json({ error: "not-found" }, 404);
  const body = Append.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "invalid" }, 400);
  const { entry, wrappedKey } = body.data;
  const takesKey = entry.action === "create" || entry.action === "add";
  if (encodeBytes(entry.vaultId) !== vaultId || takesKey !== (wrappedKey !== undefined))
    return c.json({ error: "invalid" }, 400);
  const stored = s.db.transaction((tx) => {
    const rows = s.rowsOf(vaultId, tx);
    const refused = refusal(s, c, rows, entry);
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
