/**
 * KeePass 2's XML export (File → Export → KeePass XML (2.x)), which KeePassXC reads and writes too:
 * `KeePassFile` with `Meta` and `Root`, groups inside groups, entries with `String` pairs of `Key`
 * and `Value` (`ProtectInMemory="True"` or `1` for secrets), `Tags` separated by `;` or `,`, and earlier
 * versions under `History`. The standard keys are Title, UserName, Password, URL and Notes;
 * KeePassXC keeps the one-time code as `otp` (older versions `TOTP Seed`) and more links as
 * `KP2A_URL…`, KeePass 2.47+ its own TOTP secret as `TimeOtp-Secret-Base32`. Times are ISO 8601 in
 * the export and Base64 seconds in KDBX 4. The recycle bin (`Meta/RecycleBinUUID`) stays out; the
 * folder is the group path below the root group. Sources: keepassxreboot/keepassxc,
 * src/format/KdbxXmlReader.cpp, src/core/Totp.h and src/core/EntryAttributes.cpp; Bitwarden's
 * keepass2-xml test data.
 */
import { err, ok } from "../result.ts";
import { fromBase64 } from "./base64.ts";
import { custom, type DraftField, login } from "./entry.ts";
import { decodeText } from "./text.ts";
import type { ImportedEntry, ImportResult, Parser } from "./types.ts";
import { child, children, childText, parseXml, type XmlElement } from "./xml.ts";

const STANDARD = new Set(["Title", "UserName", "Password", "URL", "Notes"]);
const TOTP_KEYS = new Set(["otp", "TOTP Seed", "TimeOtp-Secret-Base32"]);
/** How KeePass writes yes in an attribute */
const TRUE = /^(true|1)$/i;

type Strings = { key: string; value: string; secret: boolean }[];

const stringsOf = (entry: XmlElement): Strings =>
  children(entry, "String").map((pair) => {
    const value = child(pair, "Value");
    return {
      key: childText(pair, "Key"),
      value: value?.text ?? "",
      secret: TRUE.test(String(value?.attributes.get("ProtectInMemory"))),
    };
  });

const stringValue = (strings: Strings, key: string) =>
  strings.find((s) => s.key === key)?.value ?? "";

/** Seconds from 0001-01-01 to 1970-01-01, both UTC */
const SECONDS_BEFORE_1970 = 62_135_596_800;

/**
 * A time in milliseconds since 1970, 0 if unknown or earlier. KDBX 4 writes Base64 of the seconds
 * since 0001-01-01 as uint64 LE, the XML export ISO 8601 (KdbxXmlReader::readDateTime).
 */
const timeOf = (text: string): number => {
  const binary = fromBase64(text);
  if (!binary) return Math.max(0, Date.parse(text) || 0);
  const seconds = new Uint8Array(8);
  seconds.set(binary.subarray(0, 8));
  const since1 = Number(new DataView(seconds.buffer).getBigUint64(0, true));
  return Math.max(0, (since1 - SECONDS_BEFORE_1970) * 1000);
};

const isExtraUrl = (key: string) => key.startsWith("KP2A_URL");

/** Older passwords from the entry's history, newest last as KeePass keeps them */
const historyOf = (entry: XmlElement, current: string) =>
  children(child(entry, "History"), "Entry")
    .map((old) => ({
      fieldId: "password",
      value: stringValue(stringsOf(old), "Password"),
      replacedAt: timeOf(childText(child(old, "Times"), "LastModificationTime")),
    }))
    .filter((old) => old.value !== "" && old.value !== current);

const entryOf = (entry: XmlElement, folder: string): ImportedEntry => {
  const strings = stringsOf(entry);
  const value = (key: string) => stringValue(strings, key);
  const own: DraftField[] = strings
    .filter(({ key }) => !STANDARD.has(key) && !TOTP_KEYS.has(key) && !isExtraUrl(key))
    .map(({ key, value: v, secret }) => custom(key, v, secret ? "secret" : "text"));
  return login({
    title: value("Title"),
    username: value("UserName"),
    password: value("Password"),
    urls: [value("URL"), ...strings.filter((s) => isExtraUrl(s.key)).map((s) => s.value)],
    totp: strings.find((s) => TOTP_KEYS.has(s.key))?.value,
    fields: own,
    notes: value("Notes"),
    tags: childText(entry, "Tags").split(/[;,]/),
    folders: [folder],
    history: historyOf(entry, value("Password")),
  });
};

/** Every entry below the root group with its path, without recursion and without the bin */
const walk = (root: XmlElement, recycleBin: string): ImportedEntry[] => {
  const entries: ImportedEntry[] = [];
  // The path as a string: copying a list per level would be quadratic in deeply nested files
  const pending: { group: XmlElement; path: string }[] = [{ group: root, path: "" }];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { group, path } = next;
    if (recycleBin !== "" && childText(group, "UUID") === recycleBin) continue;
    for (const entry of children(group, "Entry")) entries.push(entryOf(entry, path));
    for (const sub of children(group, "Group").reverse()) {
      const name = childText(sub, "Name");
      pending.push({ group: sub, path: path === "" ? name : `${path}/${name}` });
    }
  }
  return entries;
};

/** The entries of a parsed `KeePassFile`, the XML export's or a KDBX database's (kdbx.ts) */
export const keePassEntries = (file: XmlElement): ImportResult => {
  const root = child(child(file, "Root"), "Group");
  if (file.name !== "KeePassFile" || !root) return err("wrong-format");
  return ok(walk(root, childText(child(file, "Meta"), "RecycleBinUUID")));
};

export const parseKeePassXml: Parser = (input) => {
  const text = decodeText(input);
  if (!text.ok) return text;
  const xml = parseXml(text.value);
  return xml.ok ? keePassEntries(xml.value) : xml;
};
