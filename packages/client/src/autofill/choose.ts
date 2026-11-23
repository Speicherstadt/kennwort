/**
 * Which entries the app offers for an autofill request (K-802), and what goes back: the mobile
 * app's autofill service names a target (bridge.ts), and only entries stored for exactly that
 * target are listed. A web page matches by exact host, with the same function as the extension
 * (matches.ts). A native app matches by its package name, stored in an address field of the entry as
 * `android://<package>` (with or without the signing-certificate hash Chrome's export puts in front:
 * `android://<hash>@<package>/`). That is the form Chrome's password export and Bitwarden already
 * use, so an imported login keeps its app, and the entry format stays as it is: no new field, no
 * new format version (docs/plan.md, Entscheidungen "Autofill unter Android"). The extension never
 * reads such a value as a website: it is not http(s).
 */
import type { ShownEntry } from "../entries/entries.ts";
import { type FillField, type FillRequest, type FillTarget, fillResponse } from "./bridge.ts";
import { matchesHost, urlValues } from "./matches.ts";

// RFC-free but as Android defines it: at least two segments, each a letter then letters, digits, _
const ANDROID_APP =
  /^android:\/\/(?:[^@/]*@)?([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)\/?$/;

/** The Android packages an entry is stored for */
export const appPackages = (entry: ShownEntry): string[] =>
  urlValues(entry).flatMap((value) => {
    const found = ANDROID_APP.exec(value.trim());
    return found?.[1] ? [found[1]] : [];
  });

/** How an address field names an Android app, for saving a login from an app */
export const appAddress = (id: string) => `android://${id}`;

const matchesTarget = (entry: ShownEntry, target: FillTarget) =>
  target.kind === "web" ? matchesHost(entry, target.host) : appPackages(entry).includes(target.id);

/** The logins stored for exactly this target, and nothing else */
export const candidates = (request: FillRequest, entries: readonly ShownEntry[]): ShownEntry[] =>
  entries.filter((entry) => entry.type === "login" && matchesTarget(entry, request.target));

const filledValue = (entry: ShownEntry, field: FillField) => {
  if (field === "username") return entry.username || undefined;
  if (field === "password") return entry.password || undefined;
  // A one-time code is copied in the app, never filled from a stored secret (K-802 fills none)
  return undefined;
};

/**
 * The answer for the entry the person picked: only the requested fields, and only if the entry is
 * one of the candidates, so a stale or forged pick fills nothing
 */
export const answerFor = (
  request: FillRequest,
  entries: readonly ShownEntry[],
  pickedId: string,
) => {
  const entry = candidates(request, entries).find((e) => e.id === pickedId);
  if (!entry) return undefined;
  const values = Object.fromEntries(request.fields.map((f) => [f, filledValue(entry, f)]));
  return fillResponse(request, values);
};
