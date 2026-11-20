/**
 * The account's own ciphertexts (K-303, P-01 and P-03): uploaded once after the account is made,
 * read when a device unlocks, and the account state written back only with the next counter, so a
 * device never overwrites a newer state it has not seen. Each session reaches only its own account.
 */
import { bytes, CertificateWire, encodeBytes, toWire } from "@kennwort/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { accountKeys, loginKeys } from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

const KeysUpload = z.object({
  xwingPublicKey: bytes(1216),
  edPublicKey: bytes(32),
  keyBlock: bytes(),
  unlock: z.object({ passphrase: bytes(), recovery: bytes() }),
  state: bytes(),
  stateCounter: z.literal(0),
  certificate: CertificateWire.optional(),
});
const StateUpdate = z.object({ state: bytes(), stateCounter: z.number().int().positive() });

const same = (a: Uint8Array, b: Uint8Array) => encodeBytes(a) === encodeBytes(b);

export const accountRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>()
    .get("/account/keys", (c) => {
      const { accountId } = c.var.session;
      const row = db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get();
      const login = db.select().from(loginKeys).where(eq(loginKeys.accountId, accountId)).get();
      if (!row) return c.json({ error: "not-found" }, 404);
      return c.json({
        accountId,
        accountSalt: login?.accountSalt,
        xwingPublicKey: encodeBytes(row.xwingPublicKey),
        edPublicKey: encodeBytes(row.edPublicKey),
        keyBlock: encodeBytes(row.keyBlock),
        unlock: {
          passphrase: encodeBytes(row.unlockPassphrase),
          recovery: encodeBytes(row.unlockRecovery),
        },
        state: encodeBytes(row.state),
        stateCounter: row.stateCounter,
        certificate: row.certificate ? JSON.parse(row.certificate) : null,
      });
    })
    .put("/account/keys", async (c) => {
      const parsed = KeysUpload.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const { session } = c.var;
      const upload = parsed.data;
      const certificate = upload.certificate;
      // A certificate is accepted only for this account, this company and the uploaded keys
      if (
        certificate &&
        (encodeBytes(certificate.accountId) !== session.accountId ||
          encodeBytes(certificate.companyId) !== session.companyId ||
          !same(certificate.xwingPublicKey, upload.xwingPublicKey) ||
          !same(certificate.edPublicKey, upload.edPublicKey))
      )
        return c.json({ error: "invalid" }, 400);
      const inserted = db
        .insert(accountKeys)
        .values({
          accountId: session.accountId,
          xwingPublicKey: Buffer.from(upload.xwingPublicKey),
          edPublicKey: Buffer.from(upload.edPublicKey),
          keyBlock: Buffer.from(upload.keyBlock),
          unlockPassphrase: Buffer.from(upload.unlock.passphrase),
          unlockRecovery: Buffer.from(upload.unlock.recovery),
          state: Buffer.from(upload.state),
          stateCounter: 0,
          certificate: certificate ? JSON.stringify(toWire(certificate)) : null,
          updatedAt: now(),
        })
        .onConflictDoNothing()
        .returning()
        .get();
      return inserted ? c.json({ stored: true }, 201) : c.json({ error: "exists" }, 409);
    })
    .put("/account/state", async (c) => {
      const parsed = StateUpdate.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const { accountId } = c.var.session;
      const updated = db
        .update(accountKeys)
        .set({
          state: Buffer.from(parsed.data.state),
          stateCounter: parsed.data.stateCounter,
          updatedAt: now(),
        })
        // Only the next counter: a device that missed a newer state merges it first (P-03)
        .where(
          and(
            eq(accountKeys.accountId, accountId),
            eq(accountKeys.stateCounter, parsed.data.stateCounter - 1),
          ),
        )
        .returning()
        .get();
      if (updated) return c.json({ stored: true });
      const current = db
        .select()
        .from(accountKeys)
        .where(eq(accountKeys.accountId, accountId))
        .get();
      return current
        ? c.json({ error: "stale", stateCounter: current.stateCounter }, 409)
        : c.json({ error: "not-found" }, 404);
    });
