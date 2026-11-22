/**
 * The XML inside a KDBX 4 export (K-504), as KeePassXC writes it: `KeePassFile` with `Meta` and
 * `Root`, a root group "Kennwort" with one group per vault, entries with `String` pairs (Title,
 * UserName, Password, URL, Notes, `otp` for the one-time code, `KP2A_URL_n` for more links, one
 * pair per extra field) and the earlier passwords under `History`. Sources: keepassxreboot/
 * keepassxc, src/format/KdbxXmlWriter.cpp (writeEntry, writeString, writeDateTime,
 * stripInvalidXml10Chars) and src/core/EntryAttributes.cpp; the import's keepass-xml.ts reads it.
 *
 * Secret values are `Protected="True"`: XORed with the inner stream in document order and
 * written as Base64. The document comes out as parts, plain text and values still to protect, so
 * the caller can draw the stream once it knows how long all of them are.
 */
import type { FlatEntry, FlatField } from "./flat.ts";

/** Text as it is, or a value the inner stream still has to hide */
export type XmlPart = string | { protect: Uint8Array };
export type KdbxGroup = { name: string; entries: FlatEntry[] };
/** 16 random bytes per UUID; the caller's source of randomness */
export type Random = (length: number) => Uint8Array;

const STANDARD = new Set(["Title", "UserName", "Password", "URL", "Notes", "otp"]);

/**
 * Whether XML 1.0 allows the character (tab, line feed and carriage return among the controls,
 * no lone surrogate, not U+FFFE or U+FFFF), as KeePassXC keeps it (stripInvalidXml10Chars)
 */
const allowed = (char: string) => {
  const code = char.codePointAt(0) as number;
  if (code < 0x20) return code === 0x09 || code === 0x0a || code === 0x0d;
  return !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff;
};

/** The text without what XML 1.0 forbids; by code point, so a surrogate pair stays whole */
const xml10 = (text: string) => Array.from(text).filter(allowed).join("");

/** Text for an element's content: the five specials escaped, a CR kept as a reference */
export const xmlText = (text: string): string =>
  xml10(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;");

/** Standard Base64 with padding, byte by byte: spreading a long value would overflow the stack */
export const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** Seconds from 0001-01-01 to 1970-01-01, both UTC */
const SECONDS_BEFORE_1970 = 62_135_596_800n;

/** A time as KDBX 4 writes it: Base64 of the seconds since 0001-01-01 as uint64 LE */
export const kdbxTime = (unixSeconds: number): string => {
  const bytes = new Uint8Array(8);
  const seconds = BigInt(Math.max(0, Math.floor(unixSeconds))) + SECONDS_BEFORE_1970;
  new DataView(bytes.buffer).setBigUint64(0, seconds, true);
  return toBase64(bytes);
};

const utf8 = new TextEncoder();

const element = (name: string, text: string): string => `<${name}>${xmlText(text)}</${name}>`;

/** A `String` pair; a secret one as a value for the inner stream */
const pair = (key: string, value: string, secret: boolean): XmlPart[] =>
  secret
    ? [
        `<String>${element("Key", key)}<Value Protected="True">`,
        { protect: utf8.encode(value) },
        "</Value></String>",
      ]
    : [`<String>${element("Key", key)}${element("Value", value)}</String>`];

/**
 * Each extra field under a key of its own: KeePass keys are unique, the standard ones are taken,
 * and a key starting with KP2A_URL would read as another link
 */
const ownKeys = (fields: FlatField[]): string[] => {
  const used = new Set(STANDARD);
  return fields.map(({ name }) => {
    // Unique as written: KeePassXC refuses a database with a key twice, and an empty key is none
    const written = xml10(name) || "Field";
    const base = written.startsWith("KP2A_URL") ? `(${written})` : written;
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base} (${n})`;
    used.add(key);
    return key;
  });
};

const times = (unixSeconds: number) =>
  `<Times>${element("CreationTime", kdbxTime(unixSeconds))}${element(
    "LastModificationTime",
    kdbxTime(unixSeconds),
  )}</Times>`;

const strings = (entry: FlatEntry): XmlPart[] => {
  const [url = "", ...more] = entry.urls;
  const keys = ownKeys(entry.fields);
  return [
    ...pair("Title", entry.title, false),
    ...pair("UserName", entry.username, false),
    ...pair("Password", entry.password, true),
    ...pair("URL", url, false),
    ...pair("Notes", entry.notes, false),
    ...(entry.totp === "" ? [] : pair("otp", entry.totp, true)),
    // KeePassXC and KeePass2Android name more links KP2A_URL, KP2A_URL_1, …
    ...more.flatMap((link, i) => pair(i === 0 ? "KP2A_URL" : `KP2A_URL_${i}`, link, false)),
    ...entry.fields.flatMap((field, i) => pair(keys[i] as string, field.value, field.secret)),
  ];
};

/** An earlier state with the old password, as KeePass keeps one per change */
const historyOf = (entry: FlatEntry, uuid: string): XmlPart[] =>
  entry.passwords.length === 0
    ? []
    : [
        "<History>",
        ...entry.passwords.flatMap(({ value, replacedAt }) => [
          `<Entry>${element("UUID", uuid)}${times(replacedAt)}`,
          ...pair("Title", entry.title, false),
          ...pair("Password", value, true),
          "</Entry>",
        ]),
        "</History>",
      ];

const entryOf = (entry: FlatEntry, random: Random, now: number): XmlPart[] => {
  const uuid = toBase64(random(16));
  return [
    `<Entry>${element("UUID", uuid)}${times(now)}${element("Tags", entry.tags.join(";"))}`,
    ...strings(entry),
    ...historyOf(entry, uuid),
    "</Entry>",
  ];
};

/** A group; its UUID is drawn before what is inside, so the UUIDs come in document order */
const groupOf = (name: string, random: Random, inner: () => XmlPart[]): XmlPart[] => [
  `<Group>${element("UUID", toBase64(random(16)))}${element("Name", name)}`,
  ...inner(),
  "</Group>",
];

/** The whole document; `now` in Unix seconds for the entries' times */
export const kdbxXml = (groups: KdbxGroup[], random: Random, now: number): XmlPart[] => [
  '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
  `<KeePassFile><Meta>${element("Generator", "Kennwort")}${element("DatabaseName", "Kennwort")}</Meta><Root>`,
  ...groupOf("Kennwort", random, () =>
    groups.flatMap((group) =>
      groupOf(group.name, random, () => group.entries.flatMap((e) => entryOf(e, random, now))),
    ),
  ),
  "</Root></KeePassFile>",
];

/**
 * The document as bytes: every value to protect XORed with the stream, in order, and Base64.
 * `keystream(length)` gives the inner stream's first bytes; one call covers all values.
 */
export const protectXml = (
  parts: XmlPart[],
  keystream: (length: number) => Uint8Array,
): Uint8Array => {
  const hidden = parts.filter((part) => typeof part !== "string");
  const stream = keystream(hidden.reduce((sum, part) => sum + part.protect.length, 0));
  let at = 0;
  const text = parts
    .map((part) => {
      if (typeof part === "string") return part;
      const xored = part.protect.map((byte, i) => byte ^ (stream[at + i] as number));
      at += part.protect.length;
      return toBase64(xored);
    })
    .join("");
  return utf8.encode(text);
};
