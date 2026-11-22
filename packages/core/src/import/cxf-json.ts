/**
 * The FIDO Alliance's Credential Exchange Format (CXF v1.0, Proposed Standard of 14 August 2025,
 * errata of 9 March 2026), unencrypted, as a file the person picked: a header with `version`,
 * the exporter and `accounts`; each account with `items` and `collections`, which hold item IDs
 * and may nest. An item has a title, favorite, tags, `scope.urls` and a list of credentials
 * (cxf-fields.ts). Collections become folders (`Büro/Banken`); a passkey becomes a passkey entry
 * of its own when Kennwort can keep its key (cxf-passkey.ts), a TOTP the one-time code of the
 * item's entry when Kennwort can work out its codes. What it cannot keep is counted: codes in
 * `skipped`, passkeys in `skippedPasskeys`. CXP, the protocol that moves such a file between
 * managers encrypted, is not read. Sources: fidoalliance.org/specs/cx/cxf-v1.0-ps-20250814.html
 * and bitwarden/credential-exchange, credential-exchange-format/src.
 */
import { z } from "zod";
import { err } from "../result.ts";
import { parseTotp, totpLink } from "../totp/otpauth.ts";
import { fromBase32 } from "./authenticator.ts";
import { type Credential, credentialFields, entryTypeOf, memberValue } from "./cxf-fields.ts";
import { type ItemContext, passkeyEntry } from "./cxf-passkey.ts";
import { custom, type DraftField, imported, known } from "./entry.ts";
import { flag, list, section, text } from "./schema.ts";
import { readJson } from "./text.ts";
import type { ImportedEntry, ImportResult, Parser } from "./types.ts";

const MAJOR_VERSION = 1;

const Totp = z.object({
  secret: text,
  period: z.number(),
  digits: z.number(),
  username: text,
  algorithm: text,
  issuer: text,
});
const Item = z.object({
  id: text,
  title: text,
  favorite: flag,
  tags: list(z.string()),
  scope: section({
    urls: list(z.string()),
    androidApps: list(z.object({ bundleId: text }).catch({ bundleId: "" })),
  }),
  credentials: list(z.record(z.string(), z.unknown()).catch({})),
});
const LinkedItem = z.object({ item: text, account: z.string().optional() });
/** A collection without its sub-collections, which the walk reads one level at a time */
const Collection = z.object({
  title: text,
  items: list(LinkedItem.nullable().catch(null)),
  subCollections: list(z.unknown()),
});
const Account = z.object({ id: text, items: list(Item), collections: list(z.unknown()) });
const Header = z.object({
  version: z.object({ major: z.number() }),
  accounts: list(Account),
});

type Item = z.infer<typeof Item>;
type Account = z.infer<typeof Account>;

/** Where an item is kept: account and item ID, as a collection names it */
const itemKey = (account: string, item: string) => JSON.stringify([account, item]);

/**
 * The folders of each item, from the collections and their sub-collections; walked with a list
 * instead of recursion, so no nesting of a file can overflow the stack
 */
const foldersOf = (account: Account): Map<string, string[]> => {
  const folders = new Map<string, string[]>();
  const pending = account.collections.map((node) => ({ node, parent: "" }));
  for (let next = pending.pop(); next; next = pending.pop()) {
    const collection = Collection.safeParse(next.node).data;
    if (!collection) continue;
    const path = [next.parent, collection.title.trim()].filter((part) => part !== "").join("/");
    for (const linked of collection.items) {
      if (!linked) continue;
      const key = itemKey(linked.account ?? account.id, linked.item);
      folders.set(key, [...(folders.get(key) ?? []), path]);
    }
    pending.push(...collection.subCollections.map((node) => ({ node, parent: path })));
  }
  return folders;
};

/** The otpauth link of a TOTP credential, or undefined for one Kennwort cannot work out */
const totpOf = (credential: Credential): string | undefined => {
  const totp = Totp.safeParse(credential).data;
  if (!totp) return undefined;
  const link = totpLink({
    issuer: totp.issuer.trim(),
    account: totp.username.trim(),
    secret: fromBase32(totp.secret),
    algorithm: totp.algorithm.toUpperCase(),
    digits: totp.digits,
    period: totp.period,
  });
  return parseTotp(link).ok ? link : undefined;
};

const ofKind = (credentials: Credential[], kind: string) =>
  credentials.filter((credential) => credential.type === kind);

type Read = { entries: ImportedEntry[]; skipped: number; skippedPasskeys: number };

/** The item's own entry: every credential but its passkeys, with its addresses and notes */
const mainEntry = (item: Item, context: ItemContext, codes: string[]): ImportedEntry => {
  const { credentials } = item;
  const hasUsername = ofKind(credentials, "basic-auth").length > 0;
  const totpUsers = hasUsername
    ? []
    : ofKind(credentials, "totp").map((c) => memberValue(c, "username").trim());
  const fields: DraftField[] = [
    ...credentials.flatMap(credentialFields),
    ...totpUsers.map((username) => known("username", username)),
    ...codes.map((code) => known("totp", code)),
    ...item.scope.urls.map((url) => known("website", url.trim())),
    ...item.scope.androidApps.map((app) => custom("Android app", app.bundleId)),
  ];
  return imported({
    ...context,
    type: entryTypeOf(credentials) ?? "note",
    fields,
    notes: ofKind(credentials, "note")
      .map((note) => memberValue(note, "content"))
      .join("\n\n"),
  });
};

/** An item's entries: its own unless it holds nothing but passkeys, and one per passkey kept */
const readItem = (item: Item, folders: string[]): Read => {
  const context: ItemContext = {
    title: item.title,
    favorite: item.favorite,
    tags: item.tags,
    folders,
  };
  const passkeys = ofKind(item.credentials, "passkey").map((c) => passkeyEntry(c, context));
  const totps = ofKind(item.credentials, "totp").map(totpOf);
  const codes = totps.filter((code) => code !== undefined);
  const onlyPasskeys = passkeys.length > 0 && passkeys.length === item.credentials.length;
  const kept = passkeys.filter((entry) => entry !== undefined);
  return {
    entries: [...(onlyPasskeys ? [] : [mainEntry(item, context, codes)]), ...kept],
    skipped: totps.length - codes.length,
    skippedPasskeys: passkeys.length - kept.length,
  };
};

const readAccount = (account: Account): Read[] => {
  const folders = foldersOf(account);
  return account.items.map((item) =>
    readItem(item, folders.get(itemKey(account.id, item.id)) ?? []),
  );
};

const sum = (reads: Read[], count: (read: Read) => number) =>
  reads.reduce((total, read) => total + count(read), 0);

export const parseCxfJson: Parser = (input): ImportResult => {
  const header = readJson(input, Header);
  if (!header.ok) return header;
  if (header.value.version.major !== MAJOR_VERSION) return err("unsupported");
  const reads = header.value.accounts.flatMap(readAccount);
  return {
    ok: true,
    value: reads.flatMap((read) => read.entries),
    skipped: sum(reads, (read) => read.skipped),
    skippedPasskeys: sum(reads, (read) => read.skippedPasskeys),
  };
};
