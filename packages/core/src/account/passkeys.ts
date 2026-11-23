/**
 * Unlocking with a passkey (K-707, docs/sicherheitsdesign.md P-03): the PRF output of a passkey,
 * evaluated for its own random salt, gives the key AK is sealed under, with the credential ID in
 * the AAD. The server keeps only that sealed AK. Which passkeys may unlock is in the account state,
 * sealed under AK: a way the server shows that no unlocked device set up is refused (E-01, E-03).
 * Removing a passkey leaves a tombstone, so merging with a device that still knows it does not
 * bring it back.
 */
import { randomBytes } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";

/** The PRF salt of a passkey: random, as P-03 names it (credSalt) */
export const PASSKEY_SALT_LENGTH = 32;

const UnlockPasskey = z.object({
  salt: bytes(PASSKEY_SALT_LENGTH),
  /** When it was set up, Unix ms */
  at: z.number().int().nonnegative(),
  /** Set once the passkey was removed: it never unlocks again */
  removed: z.literal(true).optional(),
});

/** By credential ID (base64url) */
export const UnlockPasskeys = z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), UnlockPasskey);
export type UnlockPasskeys = z.infer<typeof UnlockPasskeys>;

export const newPasskeySalt = (random: (length: number) => Uint8Array = randomBytes) =>
  random(PASSKEY_SALT_LENGTH);

/** The passkeys with one added; a credential ID known already, even removed, stays as it is */
export const addPasskey = (
  passkeys: UnlockPasskeys,
  credentialId: Uint8Array,
  salt: Uint8Array,
  now: number,
): UnlockPasskeys | undefined => {
  const id = encodeBytes(credentialId);
  if (passkeys[id]) return undefined;
  // Through the schema the state is read with, so a passkey that would not read back is refused
  const parsed = UnlockPasskeys.safeParse({ [id]: { salt: encodeBytes(salt), at: now } });
  return parsed.success ? { ...passkeys, ...parsed.data } : undefined;
};

/** The passkeys with one removed, kept as a tombstone; undefined if it is not active */
export const removePasskey = (
  passkeys: UnlockPasskeys,
  credentialId: Uint8Array,
): UnlockPasskeys | undefined => {
  const id = encodeBytes(credentialId);
  const known = passkeys[id];
  if (!known || known.removed) return undefined;
  return { ...passkeys, [id]: { ...known, removed: true } };
};

/** The salt of a passkey that may unlock, undefined for one unknown or removed */
export const activeSalt = (passkeys: UnlockPasskeys, credentialId: Uint8Array) => {
  const known = passkeys[encodeBytes(credentialId)];
  return known && !known.removed ? known.salt : undefined;
};

/** Both sides' passkeys; a removal on either side wins */
export const mergePasskeys = (mine: UnlockPasskeys, theirs: UnlockPasskeys): UnlockPasskeys => {
  const merged = { ...theirs, ...mine };
  for (const [id, passkey] of Object.entries(theirs)) if (passkey.removed) merged[id] = passkey;
  return merged;
};

export const passkeysToJson = (passkeys: UnlockPasskeys) =>
  Object.fromEntries(
    Object.entries(passkeys).map(([id, passkey]) => [
      id,
      { ...passkey, salt: encodeBytes(passkey.salt) },
    ]),
  );
