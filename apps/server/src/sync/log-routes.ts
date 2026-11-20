/**
 * Vault membership on the server (K-305, P-05, P-06): the signed log and the wrapped vault keys.
 * The server keeps the chain whole (next sequence number, previous hash, the signer is the session
 * and, by the entries it holds, a manager) so an honest server stays consistent; whether to trust
 * an entry is the client's check (verifyLog), whatever the server let through.
 */
import {
  bytes,
  encodeBytes,
  entryBytes,
  entryHash,
  GENESIS_HASH,
  type LogEntry,
  LogEntryWire,
  toWire,
} from "@kennwort/core";
import { verify } from "@kennwort/crypto";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { accountKeys, vaultKeys, vaultLog, vaults } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

/** Version, X-Wing ciphertext and the box around the 32-byte vault key (F-02) */
const WRAPPED_KEY_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

const Append = z.object({
  entry: LogEntryWire,
  wrappedKey: bytes(WRAPPED_KEY_LENGTH).optional(),
});

type Member = { role: string; validUntil: number };

/** Who is in the vault by the entries the server holds */
const membersOf = (entries: LogEntry[]) => {
  const members = new Map<string, Member>();
  for (const e of entries) {
    const id = encodeBytes(e.accountId);
    if (e.action === "remove") members.delete(id);
    else if (e.action !== "rotate") members.set(id, { role: e.role, validUntil: e.validUntil });
  }
  return members;
};

const current = (member: Member | undefined, now: number) =>
  member !== undefined && (member.validUntil === 0 || member.validUntil > now);

export const logRoutes = ({ db, now }: { db: Db; now: () => number }) => {
  const vaultOf = (companyId: string, vaultId: string) =>
    db
      .select()
      .from(vaults)
      .where(and(eq(vaults.companyId, companyId), eq(vaults.id, vaultId)))
      .get();
  const entriesOf = (vaultId: string) =>
    db
      .select()
      .from(vaultLog)
      .where(eq(vaultLog.vaultId, vaultId))
      .orderBy(asc(vaultLog.seq))
      .all();
  const parsed = (rows: ReturnType<typeof entriesOf>) =>
    rows.map((row) => LogEntryWire.parse(JSON.parse(row.entry)));
  const seconds = () => Math.floor(now() / 1000);

  /** Signed with the session's own key, so no broken entry blocks the chain for the others */
  const signedByMe = (entry: LogEntry, me: string) => {
    const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, me)).get();
    if (!keys?.edPublicKey) return false;
    return verify(new Uint8Array(keys.edPublicKey), entry.signature, "log", entryBytes(entry));
  };

  /** What the chain demands of the next entry, or why this one does not fit */
  const refusal = (rows: ReturnType<typeof entriesOf>, entry: LogEntry, me: string) => {
    if (encodeBytes(entry.signerId) !== me) return "not-signer";
    const last = rows.at(-1);
    if (entry.seq !== rows.length) return "stale";
    const prev = last ? last.hash : Buffer.from(GENESIS_HASH);
    if (encodeBytes(entry.prevHash) !== encodeBytes(prev)) return "stale";
    if (rows.length === 0) {
      if (entry.action !== "create" || encodeBytes(entry.accountId) !== me) return "invalid";
    } else {
      if (entry.action === "create" || entry.action === "rotate") return "invalid";
      const manager = membersOf(parsed(rows)).get(me);
      if (manager?.role !== "manage" || !current(manager, seconds())) return "forbidden";
    }
    return signedByMe(entry, me) ? undefined : "invalid";
  };

  return new Hono<TenantEnv>()
    .get("/vaults", (c) => {
      const me = c.var.session.accountId;
      const mine = db.select().from(vaultKeys).where(eq(vaultKeys.accountId, me)).all();
      const ids = [...new Set(mine.map((row) => row.vaultId))].filter((id) => {
        if (!vaultOf(c.var.session.companyId, id)) return false;
        return current(membersOf(parsed(entriesOf(id))).get(me), seconds());
      });
      return c.json({ vaults: ids });
    })
    .get("/vaults/:vaultId/log", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!vaultOf(c.var.session.companyId, vaultId)) return c.json({ error: "not-found" }, 404);
      const holds = db
        .select()
        .from(vaultKeys)
        .where(
          and(eq(vaultKeys.vaultId, vaultId), eq(vaultKeys.accountId, c.var.session.accountId)),
        )
        .get();
      if (!holds) return c.json({ error: "not-found" }, 404);
      return c.json({ entries: parsed(entriesOf(vaultId)).map(toWire) });
    })
    .get("/vaults/:vaultId/keys", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!vaultOf(c.var.session.companyId, vaultId)) return c.json({ error: "not-found" }, 404);
      const rows = db
        .select()
        .from(vaultKeys)
        .where(
          and(eq(vaultKeys.vaultId, vaultId), eq(vaultKeys.accountId, c.var.session.accountId)),
        )
        .orderBy(asc(vaultKeys.epoch))
        .all();
      return c.json({
        keys: rows.map((row) => ({ epoch: row.epoch, wrapped: encodeBytes(row.wrapped) })),
      });
    })
    .post("/vaults/:vaultId/log", async (c) => {
      const vaultId = c.req.param("vaultId");
      if (!vaultOf(c.var.session.companyId, vaultId)) return c.json({ error: "not-found" }, 404);
      const body = Append.safeParse(await c.req.json().catch(() => undefined));
      if (!body.success) return c.json({ error: "invalid" }, 400);
      const { entry, wrappedKey } = body.data;
      const takesKey = entry.action === "create" || entry.action === "add";
      if (encodeBytes(entry.vaultId) !== vaultId || takesKey !== (wrappedKey !== undefined))
        return c.json({ error: "invalid" }, 400);
      const stored = db.transaction((tx) => {
        const rows = tx
          .select()
          .from(vaultLog)
          .where(eq(vaultLog.vaultId, vaultId))
          .orderBy(asc(vaultLog.seq))
          .all();
        const refused = refusal(rows, entry, c.var.session.accountId);
        if (refused) return { refused, seq: rows.length };
        tx.insert(vaultLog)
          .values({
            vaultId,
            seq: entry.seq,
            entry: JSON.stringify(toWire(entry)),
            hash: Buffer.from(entryHash(entry)),
            storedAt: now(),
          })
          .run();
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
      if (stored.refused === "forbidden" || stored.refused === "not-signer")
        return c.json({ error: "forbidden" }, 403);
      if (stored.refused) return c.json({ error: "invalid" }, 400);
      return c.json({ seq: stored.seq }, 201);
    });
};
