/**
 * Sharing a single entry (K-305 part 6, docs/sicherheitsdesign.md P-10): an editor or manager of
 * the vault stores a share they signed for a colleague of the same company; the recipient lists
 * their shares and fetches the newest record of exactly the shared entries, nothing else of the
 * vault. Signature, binding and the entry key are the recipient's client to check (openShared).
 */
import { encodeBytes, recordToWire, Share, shareToWire } from "@kennwort/core";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import type { TenantEnv } from "../tenancy/routes.ts";
import { roleIn } from "./routes.ts";

type Deps = { db: Db; now: () => number };
type Env = Context<TenantEnv>;

const notFound = { error: "not-found" } as const;
const mayShare = (role: string | undefined) => role === "edit" || role === "manage";

/** Why the server does not store this share for the entry in the path; undefined when it does */
const refusal = (c: Env, share: Share, vaultId: string, entryId: string) => {
  const inPath = encodeBytes(share.vaultId) === vaultId && encodeBytes(share.entryId) === entryId;
  if (!inPath) return [{ error: "invalid" }, 400] as const;
  // Signed as someone else: the recipient would refuse it anyway, the server does not store it
  if (encodeBytes(share.sharer) !== c.var.session.accountId)
    return [{ error: "forbidden" }, 403] as const;
  const recipient = encodeBytes(share.recipient);
  if (recipient === c.var.session.accountId || !c.var.scope.account(recipient))
    return [{ error: "invalid" }, 400] as const;
  if (!c.var.scope.versions(vaultId, entryId)?.length) return [notFound, 404] as const;
  return undefined;
};

export const shareRoutes = ({ db, now }: Deps) => {
  const seconds = () => Math.floor(now() / 1000);
  return new Hono<TenantEnv>()
    .put("/vaults/:vaultId/entries/:entryId/shares", async (c) => {
      const { vaultId, entryId } = c.req.param();
      const role = roleIn(db, c, vaultId, now());
      if (!role) return c.json(notFound, 404);
      // Only who may change the entry hands out its key; a reader could not revoke it later
      if (!mayShare(role)) return c.json({ error: "forbidden" }, 403);
      const parsed = Share.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const refused = refusal(c, parsed.data, vaultId, entryId);
      if (refused) return c.json(refused[0], refused[1]);
      c.var.scope.share(parsed.data, now());
      return c.json({ stored: true });
    })
    .get("/vaults/:vaultId/entries/:entryId/shares", (c) => {
      const { vaultId, entryId } = c.req.param();
      if (!roleIn(db, c, vaultId, now())) return c.json(notFound, 404);
      return c.json({ shares: c.var.scope.shares(vaultId, entryId).map(shareToWire) });
    })
    .delete("/vaults/:vaultId/entries/:entryId/shares/:recipient", (c) => {
      const { vaultId, entryId, recipient } = c.req.param();
      const role = roleIn(db, c, vaultId, now());
      if (!role) return c.json(notFound, 404);
      if (!mayShare(role)) return c.json({ error: "forbidden" }, 403);
      c.var.scope.unshare(vaultId, entryId, recipient);
      return c.json({ ok: true });
    })
    .get("/shared", (c) =>
      c.json({
        shares: c.var.scope.sharedWith(c.var.session.accountId, seconds()).map(shareToWire),
      }),
    )
    .get("/shared/:vaultId/:entryId", (c) => {
      const { vaultId, entryId } = c.req.param();
      // Without a valid share the entry does not exist for this account: the same answer either way
      if (!c.var.scope.isSharedWith(c.var.session.accountId, vaultId, entryId, seconds()))
        return c.json(notFound, 404);
      const record = c.var.scope.versions(vaultId, entryId)?.at(-1);
      return record ? c.json(recordToWire(record)) : c.json(notFound, 404);
    });
};
