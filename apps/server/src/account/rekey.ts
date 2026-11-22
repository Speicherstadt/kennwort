/**
 * New account keys after a recovery kit got into other hands (K-307 part e, P-12): the device sends
 * a new bundle, key block, account state, both boxes of AK, both sign-in keys and every vault key
 * it held wrapped anew, signed by the account's previous Ed25519 key (F-11). The server replaces
 * all of it in one transaction and keeps nothing the old keys open: the old boxes and wrapped vault
 * keys, the recovery deposit, the root and recovery keys wrapped to the old bundle, shares and
 * emergency grants to it, and every other session (Bitwarden and 1Password sign the other devices
 * out as well). The old certificate goes to the history, for the logs it signed; the new bundle
 * counts once an owner or admin certifies it after comparing its code with the person.
 */
import { bytes, encodeBytes } from "@kennwort/core";
import { isSignedRekey } from "@kennwort/crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import {
  accountKeys,
  authSession,
  emergencyGrants,
  emergencyRevocations,
  entryShares,
  loginKeys,
  recoveryDeposits,
  recoveryGrants,
  rootGrants,
  supersededCertificates,
  vaultKeys,
} from "../db/schema.ts";
import type { TenantEnv } from "../tenancy/routes.ts";

// A sealed AK: version, nonce, 32 bytes and the tag (F-01)
const SEALED_ACCOUNT_KEY = 1 + 24 + 32 + 16;
// A wrapped vault key: version, X-Wing ciphertext and the box around 32 bytes (F-02)
const WRAPPED_KEY_LENGTH = 1 + 1120 + 1 + 24 + 32 + 16;

const RekeyBody = z.object({
  accountSalt: bytes(16),
  loginPublicKey: bytes(32),
  recoveryLoginPublicKey: bytes(32),
  xwingPublicKey: bytes(1216),
  edPublicKey: bytes(32),
  keyBlock: bytes(),
  state: bytes(),
  stateCounter: z.number().int().positive(),
  unlock: z.object({ passphrase: bytes(SEALED_ACCOUNT_KEY), recovery: bytes(SEALED_ACCOUNT_KEY) }),
  vaultKeys: z.array(
    z.object({
      vaultId: bytes(16),
      epoch: z.number().int().nonnegative(),
      wrapped: bytes(WRAPPED_KEY_LENGTH),
    }),
  ),
  proof: bytes(65),
});
type Rekey = z.infer<typeof RekeyBody>;
type KeysRow = typeof accountKeys.$inferSelect;

const placeOf = (vaultId: string, epoch: number) => `${vaultId}:${epoch}`;

/** Every vault key wrapped anew is one the account holds now, each once */
const fitsHeld = (db: Db, accountId: string, rekey: Rekey) => {
  const held = new Set(
    db
      .select()
      .from(vaultKeys)
      .where(eq(vaultKeys.accountId, accountId))
      .all()
      .map((row) => placeOf(row.vaultId, row.epoch)),
  );
  const given = rekey.vaultKeys.map((key) => placeOf(encodeBytes(key.vaultId), key.epoch));
  return new Set(given).size === given.length && given.every((place) => held.has(place));
};

/** The previous Ed25519 key signed exactly these values (F-11) */
const proven = (keys: KeysRow, accountId: string, rekey: Rekey) => {
  const { proof, ...statement } = rekey;
  const account = bytes(16).safeParse(accountId);
  return (
    account.success &&
    isSignedRekey(new Uint8Array(keys.edPublicKey), proof, {
      ...statement,
      accountId: account.data,
    })
  );
};

/** What only the old keys could open, or what was made for them, goes */
const dropOld = (tx: Pick<Db, "delete">, accountId: string, sessionId: string | undefined) => {
  tx.delete(vaultKeys).where(eq(vaultKeys.accountId, accountId)).run();
  tx.delete(recoveryDeposits).where(eq(recoveryDeposits.accountId, accountId)).run();
  tx.delete(rootGrants).where(eq(rootGrants.accountId, accountId)).run();
  tx.delete(recoveryGrants).where(eq(recoveryGrants.accountId, accountId)).run();
  tx.delete(entryShares).where(eq(entryShares.recipient, accountId)).run();
  for (const table of [emergencyGrants, emergencyRevocations])
    tx.delete(table).where(eq(table.grantee, accountId)).run();
  tx.delete(authSession)
    .where(and(eq(authSession.userId, accountId), ne(authSession.id, sessionId ?? "")))
    .run();
};

/** Everything at once, only on top of the state counter the server holds */
const replace = (
  db: Db,
  at: number,
  accountId: string,
  sessionId: string | undefined,
  rekey: Rekey,
) =>
  db.transaction((tx) => {
    const keys = tx.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get();
    if (!keys || keys.stateCounter !== rekey.stateCounter - 1)
      return { stale: keys?.stateCounter ?? 0 };
    if (keys.certificate)
      tx.insert(supersededCertificates)
        .values({ accountId, certificate: keys.certificate, supersededAt: at })
        .run();
    tx.update(accountKeys)
      .set({
        xwingPublicKey: Buffer.from(rekey.xwingPublicKey),
        edPublicKey: Buffer.from(rekey.edPublicKey),
        keyBlock: Buffer.from(rekey.keyBlock),
        unlockPassphrase: Buffer.from(rekey.unlock.passphrase),
        unlockRecovery: Buffer.from(rekey.unlock.recovery),
        state: Buffer.from(rekey.state),
        stateCounter: rekey.stateCounter,
        certificate: null,
        inviteMac: null,
        updatedAt: at,
      })
      .where(eq(accountKeys.accountId, accountId))
      .run();
    tx.update(loginKeys)
      .set({
        publicKey: encodeBytes(rekey.loginPublicKey),
        accountSalt: encodeBytes(rekey.accountSalt),
        recoveryPublicKey: encodeBytes(rekey.recoveryLoginPublicKey),
      })
      .where(eq(loginKeys.accountId, accountId))
      .run();
    dropOld(tx, accountId, sessionId);
    for (const key of rekey.vaultKeys)
      tx.insert(vaultKeys)
        .values({
          vaultId: encodeBytes(key.vaultId),
          accountId,
          epoch: key.epoch,
          wrapped: Buffer.from(key.wrapped),
        })
        .run();
    return { stale: undefined };
  });

/** PUT /api/account/rekey */
const rekeyAccount = (db: Db, now: () => number) => async (c: Context<TenantEnv>) => {
  const parsed = RekeyBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const { accountId, sessionId } = c.var.session;
  const keys = db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId)).get();
  if (!keys) return c.json({ error: "not-found" }, 404);
  if (!proven(keys, accountId, parsed.data)) return c.json({ error: "not-proven" }, 403);
  if (!fitsHeld(db, accountId, parsed.data)) return c.json({ error: "invalid" }, 400);
  const done = replace(db, now(), accountId, sessionId, parsed.data);
  if (done.stale !== undefined) return c.json({ error: "stale", stateCounter: done.stale }, 409);
  return c.json({ stored: true });
};

/** The certificates of bundles these accounts have replaced, as stored JSON, oldest first */
export const supersededOf = (db: Db, accountIds: readonly string[]) => {
  const byAccount = new Map<string, unknown[]>();
  const rows = db
    .select()
    .from(supersededCertificates)
    .where(inArray(supersededCertificates.accountId, [...accountIds]))
    .orderBy(asc(supersededCertificates.supersededAt))
    .all();
  for (const row of rows)
    byAccount.set(row.accountId, [
      ...(byAccount.get(row.accountId) ?? []),
      JSON.parse(row.certificate),
    ]);
  return byAccount;
};

export const rekeyRoutes = ({ db, now }: { db: Db; now: () => number }) =>
  new Hono<TenantEnv>().put("/account/rekey", rekeyAccount(db, now));
