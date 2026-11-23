/**
 * Passkeys that unlock (K-707, docs/sicherheitsdesign.md P-03): the device registers the passkey
 * with Better Auth, seals AK under the key its PRF output gives and leaves only that here. The
 * server takes it for a passkey of the session's own account, once, and serves it with the keys;
 * removing the passkey removes both. Whether a passkey may unlock decides the client, from the
 * account state sealed under AK: the server can drop a way, never add one.
 */
import { bytes, encodeBytes } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { authPasskey, unlockPasskeys } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

// A sealed AK: version, nonce, 32 bytes and the tag (F-01)
const SEALED_ACCOUNT_KEY = 1 + 24 + 32 + 16;
// WebAuthn credential IDs are at most 1023 bytes (WebAuthn Level 3, 5.1)
const CredentialId = z.string().regex(/^[A-Za-z0-9_-]{1,1364}$/);

const Upload = z.object({ credentialId: CredentialId, sealed: bytes(SEALED_ACCOUNT_KEY) });

const ownPasskey = (db: Db, accountId: string, credentialId: string) =>
  db
    .select()
    .from(authPasskey)
    .where(and(eq(authPasskey.userId, accountId), eq(authPasskey.credentialID, credentialId)))
    .get();

/** The account's sealed AKs by credential ID, as GET /api/account/keys serves them */
export const passkeyWays = (db: Db, accountId: string) =>
  db
    .select({ credentialId: authPasskey.credentialID, sealed: unlockPasskeys.sealed })
    .from(unlockPasskeys)
    .innerJoin(authPasskey, eq(authPasskey.id, unlockPasskeys.passkeyId))
    .where(and(eq(unlockPasskeys.accountId, accountId), eq(authPasskey.userId, accountId)))
    .all()
    .map((way) => ({ credentialId: way.credentialId, sealed: encodeBytes(way.sealed) }));

export const unlockPasskeyRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>()
    .put("/account/unlock-passkeys", async (c) => {
      const parsed = Upload.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const { accountId } = c.var.session;
      const passkey = ownPasskey(db, accountId, parsed.data.credentialId);
      if (!passkey) return c.json({ error: "not-found" }, 404);
      const inserted = db
        .insert(unlockPasskeys)
        .values({
          passkeyId: passkey.id,
          accountId,
          sealed: Buffer.from(parsed.data.sealed),
          createdAt: now(),
        })
        .onConflictDoNothing()
        .returning()
        .get();
      return inserted ? c.json({ stored: true }, 201) : c.json({ error: "exists" }, 409);
    })
    .delete("/account/unlock-passkeys/:credentialId", (c) => {
      const credentialId = CredentialId.safeParse(c.req.param("credentialId"));
      if (!credentialId.success) return c.json({ error: "invalid" }, 400);
      const { accountId } = c.var.session;
      // The sealed AK goes with the passkey (ON DELETE CASCADE)
      const removed = db
        .delete(authPasskey)
        .where(
          and(eq(authPasskey.userId, accountId), eq(authPasskey.credentialID, credentialId.data)),
        )
        .returning()
        .get();
      return removed ? c.json({ removed: true }) : c.json({ error: "not-found" }, 404);
    });
