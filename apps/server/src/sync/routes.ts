/**
 * The sync API under /api (K-204, docs/sicherheitsdesign.md P-21): vaults, entry records with all
 * their versions, and a live stream (SSE) that names each new version. The server checks what it
 * can without keys: the company, that the session is a current member of the vault by its stored
 * log (to read) and an editor or manager (to write), the next version number and that the session
 * signed as itself; signatures, roles and contents are still the client's to check (P-09).
 */
import { bytes, EntryRecord, encodeBytes, recordToWire } from "@kennwort/core";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Hub } from "./hub.ts";
import { currentMembers } from "./vault-chain.ts";

export type SyncDeps = { db: Db; hub: Hub; now: () => number; keepAliveMs?: number };

const VaultRequest = z.object({ id: bytes(16) });
/** One record holds one entry; 1 MiB leaves room for attachments' keys, not for files */
const MAX_RECORD_BYTES = 1024 * 1024;

const notFound = { error: "not-found" } as const;

/** The session's role in the vault by its stored log, if it is a current member (K-305) */
const roleIn = (db: Db, c: Context<TenantEnv>, vaultId: string, now: number) =>
  c.var.scope.vault(vaultId)
    ? currentMembers(db, vaultId, Math.floor(now / 1000)).get(c.var.session.accountId)?.role
    : undefined;

export const syncRoutes = ({ db, hub, now, keepAliveMs = 20_000 }: SyncDeps) =>
  new Hono<TenantEnv>()
    .post("/vaults", async (c) => {
      const parsed = VaultRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const id = encodeBytes(parsed.data.id);
      const at = now();
      if (c.var.scope.createVault(id, at, c.var.session.accountId) !== "created")
        return c.json({ error: "taken" }, 409);
      c.var.scope.audit({
        time: at,
        actor: c.var.session.accountId,
        action: "vault-created",
        subject: id,
        signature: new Uint8Array(),
      });
      return c.json({ id }, 201);
    })
    .get("/vaults/:vaultId/records", (c) => {
      if (!roleIn(db, c, c.req.param("vaultId"), now())) return c.json(notFound, 404);
      const records = c.var.scope.latest(c.req.param("vaultId"));
      return records ? c.json(records.map(recordToWire)) : c.json(notFound, 404);
    })
    .get("/vaults/:vaultId/entries/:entryId/versions", (c) => {
      if (!roleIn(db, c, c.req.param("vaultId"), now())) return c.json(notFound, 404);
      const records = c.var.scope.versions(c.req.param("vaultId"), c.req.param("entryId"));
      return records ? c.json(records.map(recordToWire)) : c.json(notFound, 404);
    })
    .put(
      "/vaults/:vaultId/records",
      bodyLimit({
        maxSize: MAX_RECORD_BYTES,
        onError: (c) => c.json({ error: "too-large" }, 413),
      }),
      async (c) => {
        const vaultId = c.req.param("vaultId");
        const role = roleIn(db, c, vaultId, now());
        if (!role) return c.json(notFound, 404);
        // A reader or a non-member could only fill the history with versions clients refuse
        if (role !== "edit" && role !== "manage") return c.json({ error: "forbidden" }, 403);
        const parsed = EntryRecord.safeParse(await c.req.json().catch(() => undefined));
        if (!parsed.success || encodeBytes(parsed.data.vaultId) !== vaultId)
          return c.json({ error: "invalid" }, 400);
        // Signed as someone else: the client would refuse it anyway, the server does not store it
        if (encodeBytes(parsed.data.author) !== c.var.session.accountId)
          return c.json({ error: "forbidden" }, 403);
        const appended = c.var.scope.append(parsed.data, now());
        if (!appended) return c.json(notFound, 404);
        if (!appended.stored)
          return c.json({ current: appended.current ? recordToWire(appended.current) : null }, 409);
        hub.publish(vaultId, {
          entryId: encodeBytes(parsed.data.entryId),
          version: parsed.data.version,
        });
        return c.json({ stored: true });
      },
    )
    .get("/vaults/:vaultId/events", (c) => {
      const vaultId = c.req.param("vaultId");
      if (!roleIn(db, c, vaultId, now())) return c.json(notFound, 404);
      return streamSSE(c, async (stream) => {
        // Someone removed, or whose time ran out, hears nothing more: checked before every
        // change and every ping, and then the stream ends (review of the members-only sync)
        const stillMember = () => {
          if (roleIn(db, c, vaultId, now())) return true;
          stream.abort();
          return false;
        };
        const unsubscribe = hub.subscribe(vaultId, (change) => {
          if (stillMember())
            void stream.writeSSE({ event: "record", data: JSON.stringify(change) });
        });
        stream.onAbort(unsubscribe);
        // "ready" once listening, so a client knows no change after this one is missed
        await stream.writeSSE({ event: "ready", data: "" });
        while (!stream.aborted) {
          await stream.sleep(keepAliveMs);
          if (!stream.aborted && stillMember()) await stream.writeSSE({ event: "ping", data: "" });
        }
      });
    });
