/**
 * The content script's part in the phishing warning (K-405, P-17): it notices that the user typed
 * into a password field and, when the user leaves the field, presses Enter in it or submits its
 * form, hands the service worker the F-10 tag of the value: four bytes of Argon2id under the salt
 * of the open account's alert list. Never the value, never per key press (Google's Password Alert
 * sends every key press to its service worker; here nothing leaves before the user is done), and
 * it holds no saved password: whether the tag belongs to a saved password of another host only the
 * worker decides (alert/alert-broker.ts).
 *
 * Only a value the user typed counts, so a page that fills a guess by script learns nothing from
 * whether a warning comes, and gets at most one check per time the user types. `isTrusted` alone
 * does not tell: in Chromium, `document.execCommand("insertText")` fires a trusted `input` with no
 * user action (review of K-405). Typing, pasting and dropping fire a trusted `beforeinput` first,
 * execCommand does not; so an `input` counts only right after a trusted `beforeinput` on the same
 * field whose dispatch has ended (not one written from inside a page's handler) and that the page
 * did not cancel. The value right after that input is what gets checked, and only if the field still
 * holds it: a value the page changed afterwards is not checked. It stays in this script's memory, as
 * it does in the field, until the check, and goes with it. Only fields the page shows (field-shown.ts)
 * and only in the top frame or a frame of the same origin as every frame above it (same-origin.ts).
 * With the salt already fetched when the field got focus, the check runs synchronously, so a submit
 * that navigates away still sends it.
 */
import { fromHex, hex } from "../alert/hex.ts";
import type { AlertAnswer, AlertRequest } from "../alert/messages.ts";
import { fieldShown } from "./field-shown.ts";

export type AlertWatchDeps = {
  /** Whether this frame may check at all (same-origin.ts) */
  mayCheck: () => boolean;
  /** A message to the service worker; undefined when nothing answered */
  send: (request: AlertRequest) => Promise<AlertAnswer | undefined>;
  /** F-10's tag (packages/crypto) */
  tag: (value: string, salt: Uint8Array) => Uint8Array;
  shown?: (input: HTMLInputElement) => boolean;
};

const isPassword = (node: unknown): node is HTMLInputElement =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).tagName === "INPUT" &&
  (node as HTMLInputElement).type === "password";

const fieldOf = (event: Event) => {
  const target = event.composedPath()[0];
  return isPassword(target) ? target : undefined;
};

export const createAlertWatch = (deps: AlertWatchDeps) => {
  const shown = deps.shown ?? fieldShown;
  /** The trusted beforeinput of each field whose input has not come yet */
  const pending = new WeakMap<HTMLInputElement, Event>();
  /** Fields the user typed into since their last check, with the value the user's edit left */
  const typed = new WeakMap<HTMLInputElement, string>();
  let salt: Uint8Array | undefined;

  const fetchSalt = async () => {
    const answer = await deps.send({ type: "alert-salt" });
    salt = answer?.ok && answer.salt ? fromHex(answer.salt) : undefined;
    return salt;
  };

  /** Hashes only a value the field still holds as the user left it, and keeps no tag */
  const sendTag = (field: HTMLInputElement, value: string, key: Uint8Array) => {
    if (field.value !== value) return;
    void deps.send({ type: "alert-check", tag: hex(deps.tag(value, key)) });
  };

  const check = (field: HTMLInputElement | undefined) => {
    const value = field && typed.get(field);
    if (!field || value === undefined) return;
    typed.delete(field);
    if (!deps.mayCheck() || !shown(field) || value === "" || field.value !== value) return;
    if (salt) return sendTag(field, value, salt);
    void fetchSalt().then((key) => key && sendTag(field, value, key));
  };

  /** The browser's own edit: its beforeinput ran to the end (eventPhase NONE) and went through */
  const userEdit = (before: Event | undefined) =>
    before !== undefined && before.eventPhase === 0 && !before.defaultPrevented;

  return {
    /** A password field got focus: fetch the salt now, so the check later needs no round trip */
    onFocusIn: (event: Event) => {
      if (fieldOf(event) && deps.mayCheck()) void fetchSalt();
    },
    /** Typing, pasting or dropping announces its edit: the input that follows may count */
    onBeforeInput: (event: Event) => {
      const field = fieldOf(event);
      if (field && event.isTrusted) pending.set(field, event);
    },
    /** The user's edit marks the field for one check; any other trusted edit takes the mark away */
    onInput: (event: Event) => {
      const field = fieldOf(event);
      if (!field || !event.isTrusted) return;
      const before = pending.get(field);
      pending.delete(field);
      if (userEdit(before)) typed.set(field, field.value);
      else typed.delete(field);
    },
    onFocusOut: (event: Event) => check(fieldOf(event)),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.isTrusted && event.key === "Enter") check(fieldOf(event));
    },
    onSubmit: (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!event.isTrusted || form?.tagName !== "FORM") return;
      for (const input of Array.from(form.elements)) if (isPassword(input)) check(input);
    },
  };
};
