/**
 * The messages of the phishing warning (K-405, P-17), all through the service worker:
 *
 * - the content script asks for the salt of the open account's alert list (`alert-salt`) and hands
 *   over the F-09 tag of what the user typed into a password field (`alert-check`): four bytes in
 *   hex, never the value itself;
 * - the worker, if the tag matches a saved password of another host, asks the content script of the
 *   top frame to open the prompt frame (`kennwort-alert-open`), whose page then takes the warning
 *   from the worker as it takes a submitted login (save/messages.ts, `prompt-take`).
 */
import type { FrameRefusal } from "../fill/frames.ts";

/** From the content script to the service worker */
export type AlertRequest = { type: "alert-salt" } | { type: "alert-check"; tag: string };

export type AlertRefusal =
  | "not-content"
  | "locked"
  | "no-page"
  | "no-match"
  | "same-site"
  | "warned";
export type AlertAnswer =
  | { ok: true; salt?: string }
  | { ok: false; error: AlertRefusal | FrameRefusal };

/** What the warning names: the page's exact host and address, and the entries whose password it is */
export type Warning = { host: string; url: string; entries: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
/** Exactly the F-09 tag: four bytes, lower-case hex */
const TAG = /^[0-9a-f]{8}$/;

/** A request of the content script's shape, or undefined */
export const alertRequest = (value: unknown): AlertRequest | undefined => {
  if (!isObject(value)) return undefined;
  if (value.type === "alert-salt") return { type: "alert-salt" };
  if (value.type !== "alert-check" || !isString(value.tag) || !TAG.test(value.tag))
    return undefined;
  return { type: "alert-check", tag: value.tag };
};

/** The worker's push to the top frame: open the prompt frame for a warning */
export const alertOpenMessage = (value: unknown) =>
  isObject(value) && value.type === "kennwort-alert-open";

/** A warning of the worker's shape, or undefined */
export const warningOf = (value: unknown): Warning | undefined => {
  if (!isObject(value)) return undefined;
  const { host, url, entries } = value;
  if (!isString(host) || !isString(url) || !Array.isArray(entries) || !entries.every(isString))
    return undefined;
  return { host, url, entries };
};
