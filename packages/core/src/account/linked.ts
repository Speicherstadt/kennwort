/**
 * Several companies in one account (K-605, docs/sicherheitsdesign.md P-27): each company keeps its
 * own server account with its own keys, root and membership logs, and the server keeps them apart
 * as any two accounts. What makes them one account is here: the account state of the account a
 * person unlocks with their passphrase (the home account) holds, sealed under its AK, the way into
 * each further one, its account ID, Secret Key and a passphrase the device made up and never shows.
 * Removing a company drops that way and leaves a tombstone, so merging with a device that still
 * knows it does not bring it back.
 */
import { randomBytes, SECRET_KEY_LENGTH } from "@kennwort/crypto";
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";

/** 32 random bytes in base64url: as strong as AK, so the stored way adds no weaker one */
export const LINK_PASSPHRASE_BYTES = 32;

const Credentials = z.object({
  secretKey: bytes(SECRET_KEY_LENGTH),
  passphrase: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const LinkedCompany = z.object({
  /** The name the person gave the company here; the server knows no company names */
  name: z.string().trim().min(1).max(100),
  /** When it was linked, Unix ms */
  at: z.number().int().nonnegative(),
  /** The way into the company's account; gone once the person removed the company */
  credentials: Credentials.optional(),
});
export type LinkedCompany = z.infer<typeof LinkedCompany>;

/** By the account ID of the company's account (base64url) */
export const LinkedCompanies = z.record(z.string().regex(/^[A-Za-z0-9_-]{22}$/), LinkedCompany);
export type LinkedCompanies = z.infer<typeof LinkedCompanies>;

/** A company that is still linked, with the way into its account */
export type ActiveLink = {
  accountId: string;
  name: string;
  secretKey: Uint8Array;
  passphrase: string;
};

/** A new passphrase for a further company's account, made on the device and never shown */
export const newLinkPassphrase = (random: (length: number) => Uint8Array = randomBytes) =>
  encodeBytes(random(LINK_PASSPHRASE_BYTES));

/**
 * Both sides' companies. A removal on either side wins: the tombstone has no way in, and a device
 * that has not seen the removal yet must not hand the way back
 */
export const mergeLinked = (mine: LinkedCompanies, theirs: LinkedCompanies): LinkedCompanies => {
  const merged = { ...theirs, ...mine };
  for (const [id, company] of Object.entries(theirs)) {
    const own = mine[id];
    if (own?.credentials && !company.credentials) merged[id] = company;
  }
  return merged;
};

/** The companies with a company added; an account ID that is linked or removed already stays */
export const linkCompany = (
  linked: LinkedCompanies,
  accountId: Uint8Array,
  name: string,
  credentials: { secretKey: Uint8Array; passphrase: string },
  now: number,
): LinkedCompanies | undefined => {
  const id = encodeBytes(accountId);
  if (linked[id]) return undefined;
  // Through the schema the state is read with, so a way in that would not read back is refused
  const company = LinkedCompany.safeParse({
    name,
    at: now,
    credentials: { ...credentials, secretKey: encodeBytes(credentials.secretKey) },
  });
  return company.success ? { ...linked, [id]: company.data } : undefined;
};

/** The companies with one removed: its way in is dropped, its name and time stay as a tombstone */
export const unlinkCompany = (linked: LinkedCompanies, accountId: string) => {
  const company = linked[accountId];
  return company?.credentials
    ? { ...linked, [accountId]: { name: company.name, at: company.at } }
    : undefined;
};

/** The companies still linked, oldest first */
export const activeLinks = (linked: LinkedCompanies): ActiveLink[] =>
  Object.entries(linked)
    .flatMap(([accountId, { name, at, credentials }]) =>
      credentials ? [{ accountId, name, at, ...credentials }] : [],
    )
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...link }) => link);

/** The companies as JSON for the sealed state: the Secret Keys in base64url */
export const linkedToJson = (linked: LinkedCompanies) =>
  Object.fromEntries(
    Object.entries(linked).map(([id, company]) => [
      id,
      company.credentials
        ? {
            ...company,
            credentials: {
              secretKey: encodeBytes(company.credentials.secretKey),
              passphrase: company.credentials.passphrase,
            },
          }
        : company,
    ]),
  );
