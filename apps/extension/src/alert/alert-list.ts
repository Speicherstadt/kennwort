/**
 * The alert list of the phishing warning (K-405, P-17): for every saved password with a web address
 * its F-10 tag and the tags of its exact hosts (page/matches.ts), under a salt that is new with every
 * unlock. Pages of the extension that decrypted the entries build it (alert-refresh.ts) and keep it
 * in chrome.storage.session next to the unlocked keys, gone on lock; the service worker compares a
 * typed tag against it (alert-broker.ts). Neither a password nor a host is in it in plain text.
 *
 * As in Google's Password Alert (google/password-alert, service_worker.js: a salted, partial hash
 * of the password, 37 bits), only a short tag is kept, here four bytes of Argon2id (F-10).
 */

import { entryHosts } from "@kennwort/client/autofill/matches.ts";
import { type StoredEntry, shown } from "@kennwort/client/entries/entries.ts";
import { hex } from "./hex.ts";

/** A saved password the list covers, with the hosts it belongs to */
export type AlertSource = { id: string; version: number; password: string; hosts: string[] };
/** What the list keeps of it; id and version tell when a record can be kept as it is */
export type AlertRecord = { id: string; version: number; tag: string; hosts: string[] };
export type AlertList = { salt: string; records: AlertRecord[] };

/** F-10, passed in so tests can use fast stand-ins */
export type Hashers = {
  tag: (password: string, salt: Uint8Array) => Uint8Array;
  hostTag: (host: string, salt: Uint8Array) => Uint8Array;
};

/** The saved passwords the warning covers: those of entries with at least one web address */
export const alertSources = (entries: readonly StoredEntry[]): AlertSource[] =>
  entries.flatMap((entry) => {
    const view = shown(entry);
    const hosts = [...new Set(entryHosts(view))];
    if (view.password === "" || hosts.length === 0) return [];
    return [{ id: entry.idText, version: entry.version, password: view.password, hosts }];
  });

export const recordOf = (source: AlertSource, salt: Uint8Array, hashers: Hashers): AlertRecord => ({
  id: source.id,
  version: source.version,
  tag: hex(hashers.tag(source.password, salt)),
  hosts: source.hosts.map((host) => hex(hashers.hostTag(host, salt))),
});

/** The records of a list that still hold under this salt, by entry and version */
export const reusableRecords = (list: AlertList | undefined, salt: string) =>
  new Map(
    list?.salt === salt
      ? list.records.map((record) => [`${record.id}/${record.version}`, record])
      : [],
  );

/** The records whose password has this tag */
export const matchesOf = (list: AlertList, tag: string) =>
  list.records.filter((record) => record.tag === tag);

/** Whether one of these records belongs to the host with this tag */
export const sameSite = (records: readonly AlertRecord[], hostTag: string) =>
  records.some((record) => record.hosts.includes(hostTag));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const HEX = (bytes: number) => new RegExp(`^[0-9a-f]{${bytes * 2}}$`);
const SALT = HEX(16);
const TAG = HEX(4);
const HOST_TAG = HEX(16);

const recordFrom = (value: unknown): AlertRecord | undefined => {
  if (!isObject(value)) return undefined;
  const { id, version, tag, hosts } = value;
  if (typeof id !== "string" || !Number.isSafeInteger(version)) return undefined;
  if (typeof tag !== "string" || !TAG.test(tag) || !Array.isArray(hosts)) return undefined;
  if (!hosts.every((host) => typeof host === "string" && HOST_TAG.test(host))) return undefined;
  return { id, version: version as number, tag, hosts };
};

/** A list of the stored shape, or undefined */
export const alertListOf = (value: unknown): AlertList | undefined => {
  if (!isObject(value) || typeof value.salt !== "string" || !SALT.test(value.salt))
    return undefined;
  if (!Array.isArray(value.records)) return undefined;
  const records = value.records.map(recordFrom);
  return records.every((record) => record !== undefined)
    ? { salt: value.salt, records: records as AlertRecord[] }
    : undefined;
};
