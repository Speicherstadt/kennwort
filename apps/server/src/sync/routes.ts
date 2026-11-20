/**
 * The sync API under /api (K-204, docs/sicherheitsdesign.md P-21): vaults, entry records with all
 * their versions, and a live stream (SSE) that names each new version. The server checks only
 * what it can without keys: the company, the next version number and that the session signed as
 * itself; signatures, roles and contents are the client's to check (P-09).
 */
import { bytes, EntryRecord, encodeBytes, recordToWire } from "@kennwort/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { TenantEnv } from "../tenancy/routes.ts";
import type { Hub } from "./hub.ts";

export type SyncDeps = { hub: Hub; now: () => number; keepAliveMs?: number };

const VaultRequest = z.object({ id: bytes(16) });
/** One record holds one entry; 1 MiB leaves room for attachments' keys, not for files */
const MAX_RECORD_BYTES = 1024 * 1024;

const notFound = { error: "not-found" } as const;

export const syncRoutes = ({ hub, now, keepAliveMs = 20_000 }: SyncDeps) =>
  new Hono<TenantEnv>()
    .post("/vaults", async (c) => {
      const parsed = VaultRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const id = encodeBytes(parsed.data.id);
      return c.var.scope.createVault(id, now()) === "created"
        ? c.json({ id }, 201)
        : c.json({ error: "taken" }, 409);
    })
    .get("/vaults/:vaultId/records", (c) => {
      const records = c.var.scope.latest(c.req.param("vaultId"));
      return records ? c.json(records.map(recordToWire)) : c.json(notFound, 404);
    })
    .get("/vaults/:vaultId/entries/:entryId/versions", (c) => {
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
        if (!c.var.scope.vault(vaultId)) return c.json(notFound, 404);
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
      if (!c.var.scope.vault(vaultId)) return c.json(notFound, 404);
      return streamSSE(c, async (stream) => {
        const unsubscribe = hub.subscribe(vaultId, (change) => {
          void stream.writeSSE({ event: "record", data: JSON.stringify(change) });
        });
        stream.onAbort(unsubscribe);
        // "ready" once listening, so a client knows no change after this one is missed
        await stream.writeSSE({ event: "ready", data: "" });
        while (!stream.aborted) {
          await stream.sleep(keepAliveMs);
          if (!stream.aborted) await stream.writeSSE({ event: "ping", data: "" });
        }
      });
    });
