/**
 * The content script's part in the phishing warning (K-405, P-17): it notices that the user typed
 * into a password field and, when the user leaves the field, presses Enter in it or submits its
 * form, hands the service worker the F-10 tag of the value: four bytes of Argon2id under the salt
 * of the open account's alert list. Never the value, never per key press (Google's Password Alert
 * sends every key press to its service worker; here nothing leaves before the user is done), and
 * it holds no saved password: whether the tag belongs to a saved password of another host only the
 * worker decides (alert/alert-broker.ts).
 *
 * Only a value the user typed counts: a field is checked once after a trusted `input` event (typing
 * or pasting), so a page that fills a guess by script learns nothing from whether a warning comes,
 * and gets at most one check per time the user types. Only fields the page shows (field-shown.ts)
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
  /** Fields the user typed into since their last check */
  const typed = new WeakSet<HTMLInputElement>();
  let salt: Uint8Array | undefined;

  const fetchSalt = async () => {
    const answer = await deps.send({ type: "alert-salt" });
    salt = answer?.ok && answer.salt ? fromHex(answer.salt) : undefined;
    return salt;
  };

  /** Reads the field only right before it hashes, and keeps neither value nor tag */
  const sendTag = (field: HTMLInputElement, key: Uint8Array) => {
    const value = field.value;
    if (value === "") return;
    void deps.send({ type: "alert-check", tag: hex(deps.tag(value, key)) });
  };

  const check = (field: HTMLInputElement | undefined) => {
    if (!field || !typed.has(field)) return;
    typed.delete(field);
    if (!deps.mayCheck() || !shown(field) || field.value === "") return;
    if (salt) return sendTag(field, salt);
    void fetchSalt().then((key) => key && sendTag(field, key));
  };

  return {
    /** A password field got focus: fetch the salt now, so the check later needs no round trip */
    onFocusIn: (event: Event) => {
      if (fieldOf(event) && deps.mayCheck()) void fetchSalt();
    },
    /** Typing or pasting the browser delivered marks the field for one check */
    onInput: (event: Event) => {
      const field = fieldOf(event);
      if (field && event.isTrusted) typed.add(field);
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
