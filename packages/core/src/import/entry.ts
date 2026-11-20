/**
 * Building Kennwort entries from what a parser read (K-502). Template fields take the fixed IDs of
 * the entry types (apps/web/src/entries/entry-types.ts), so the app shows them in their place;
 * everything else becomes the owner's own field. Empty fields are left out, a second field with
 * the same ID gets `-2`, `-3`, and notes go into a note field at the end.
 */
import type { EntryContent, Field } from "../sync/content.ts";
import type { ImportedEntry } from "./types.ts";

type Kind = Field["kind"];
export type DraftField = { id?: string; name: string; value: string; kind: Kind };
export type Draft = {
  type: EntryContent["type"];
  title: string;
  fields: DraftField[];
  notes?: string | undefined;
  tags?: string[] | undefined;
  favorite?: boolean | undefined;
  folders?: string[] | undefined;
  /** Earlier passwords, as far as the export has them */
  history?: EntryContent["history"] | undefined;
};

/** The template fields parsers fill: ID, stored name and kind (as in entry-types.ts) */
const TEMPLATE = {
  username: ["Username", "text"],
  password: ["Password", "secret"],
  website: ["Website", "url"],
  totp: ["One-time code", "totp"],
  ssid: ["SSID", "text"],
  security: ["Security", "text"],
  holder: ["Cardholder", "text"],
  number: ["Card number", "secret"],
  expiry: ["Expiry", "text"],
  cvc: ["CVC", "secret"],
  pin: ["PIN", "secret"],
  "private-key": ["Private key", "secret"],
  "public-key": ["Public key", "note"],
  passphrase: ["Passphrase", "secret"],
  name: ["Name", "text"],
  email: ["Email", "email"],
  phone: ["Phone", "text"],
  address: ["Address", "note"],
} as const satisfies Record<string, readonly [string, Kind]>;

export type TemplateId = keyof typeof TEMPLATE;

/** A template field with this value */
export const known = (id: TemplateId, value: string): DraftField => {
  const [name, kind] = TEMPLATE[id];
  return { id, name, value, kind };
};

/** One of the owner's own fields */
export const custom = (name: string, value: string, kind: Kind = "text"): DraftField => ({
  name,
  value,
  kind,
});

const filled = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/** Line breaks as `\n`, whatever the exporting system wrote */
const unixLines = (value: string) => value.replace(/\r\n?/g, "\n");

/** Unique IDs: own fields count up as `field-1`, `field-2`; a taken ID gets `-2`, `-3` */
const withIds = (fields: DraftField[]): Field[] => {
  const used = new Set<string>();
  let own = 0;
  return fields.map((field) => {
    const base = field.id ?? `field-${++own}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return { id, name: field.name, value: unixLines(field.value), kind: field.kind };
  });
};

/** Trimmed, without empty ones and without repeats, in the order given */
const cleanList = (items: readonly string[]) => [
  ...new Set(items.map((item) => item.trim()).filter(filled)),
];

const NOTE = { id: "note", name: "Notes", kind: "note" } as const;

export const imported = (draft: Draft): ImportedEntry => {
  const notes = filled(draft.notes) ? [{ ...NOTE, value: draft.notes }] : [];
  return {
    content: {
      type: draft.type,
      title: draft.title.trim(),
      fields: withIds([...draft.fields.filter((field) => field.value.trim() !== ""), ...notes]),
      tags: cleanList(draft.tags ?? []).sort((a, b) => a.localeCompare(b)),
      favorite: draft.favorite ?? false,
      history: draft.history ?? [],
    },
    folders: cleanList(draft.folders ?? []),
  };
};

/** The host of a link, for a title the export does not have */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export type LoginParts = {
  title: string;
  username?: string | undefined;
  password?: string | undefined;
  urls?: string[] | undefined;
  totp?: string | undefined;
  fields?: DraftField[] | undefined;
  notes?: string | undefined;
  tags?: string[] | undefined;
  favorite?: boolean | undefined;
  folders?: string[] | undefined;
  history?: EntryContent["history"] | undefined;
};

/**
 * A login; one with nothing but notes is a note, as managers export their notes in the same
 * columns. Without a title it takes the host of its first link that has one, then the username.
 */
export const login = (parts: LoginParts): ImportedEntry => {
  const urls = parts.urls ?? [];
  const main = [parts.username, parts.password, parts.totp, ...urls];
  const isLogin = main.some(filled) || !filled(parts.notes);
  const title = [parts.title, ...urls.map(hostOf), parts.username].find(filled) ?? "";
  return imported({
    type: isLogin ? "login" : "note",
    title,
    fields: [
      known("username", parts.username ?? ""),
      known("password", parts.password ?? ""),
      ...urls.map((url) => known("website", url.trim())),
      known("totp", parts.totp ?? ""),
      ...(parts.fields ?? []),
    ],
    notes: parts.notes,
    tags: parts.tags,
    favorite: parts.favorite,
    folders: parts.folders,
    history: parts.history,
  });
};

/** An expiry date as MM/YYYY (or as much of it as the export has) */
export const expiry = (month: string, year: string): string => {
  const [m, y] = [month.trim(), year.trim()];
  if (m === "" || y === "") return m + y;
  return `${m.padStart(2, "0")}/${y}`;
};

/** The filled parts, trimmed, with this between them */
export const joinFilled = (separator: string, parts: string[]): string =>
  parts
    .map((part) => part.trim())
    .filter(filled)
    .join(separator);

/** The filled parts, one per line (an address from its parts) */
export const joinLines = (...parts: string[]): string => joinFilled("\n", parts);
