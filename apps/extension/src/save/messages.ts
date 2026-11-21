/**
 * The messages of saving a login (K-404), all through the service worker:
 *
 * - the content script hands over a login the user just submitted (`save-capture`) and, in the top
 *   frame, asks whether there is one to offer (`save-pending`);
 * - the save prompt (an extension page the content script frames in the top frame) takes the login
 *   from the worker once (`prompt-take`) and asks the worker to show, size, check or close its frame;
 * - the worker passes those on to the content script of the top frame (`kennwort-prompt-…`).
 *
 * Like the inline menu's (fill/messages.ts), every prompt message names the prompt's nonce, which
 * only the content script and its own prompt frame know. The page itself can send none of them.
 */

/** The save prompt's page inside the extension (vite.config.ts builds it, manifest.ts frames it) */
export const PROMPT_PAGE = "src/prompt/prompt.html";

/** A login as the content script read it from the fields the user submitted */
export type Submitted = {
  username: string;
  password: string;
  /** The current password a change-password form asked for, if it did */
  previous?: string;
};

/** From the content script to the service worker */
export type CaptureRequest = ({ type: "save-capture" } & Submitted) | { type: "save-pending" };

/** From the save prompt to the service worker */
export type PromptRequest =
  | { type: "prompt-take"; nonce: string }
  | { type: "prompt-show"; nonce: string }
  | { type: "prompt-size"; nonce: string; height: number }
  | { type: "prompt-check"; nonce: string }
  | { type: "prompt-close"; nonce: string }
  | { type: "prompt-unlock"; nonce: string };

/** From the service worker to the content script of the top frame */
export type PromptContentMessage =
  | { type: "kennwort-prompt-owns"; nonce: string }
  | { type: "kennwort-prompt-show"; nonce: string }
  | { type: "kennwort-prompt-size"; nonce: string; height: number }
  | { type: "kennwort-prompt-check"; nonce: string }
  | { type: "kennwort-prompt-close"; nonce: string };

/** The login the prompt gets: what was submitted, and the page it was submitted on */
export type Capture = Submitted & {
  /** The exact host of the frame, from the browser's frame tree (page/matches.ts) */
  host: string;
  /** The frame's address then, which a new entry keeps as its website */
  url: string;
};

export type SaveRefusal =
  | "not-content"
  | "not-prompt"
  | "foreign-frame"
  | "unknown-frame"
  | "no-page"
  | "not-top"
  | "nothing"
  | "prompt-hidden"
  | "not-delivered";

export type SaveAnswer = { ok: true; capture?: Capture } | { ok: false; error: SaveRefusal };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
const NONCE = /^[0-9a-f]{32}$/;
const isNonce = (value: unknown): value is string => isString(value) && NONCE.test(value);
/** Longer than any password or user name a person types: the worker keeps nothing bigger */
const MAX_LENGTH = 1024;
const isValue = (value: unknown): value is string => isString(value) && value.length <= MAX_LENGTH;

const submitted = (value: Record<string, unknown>): Submitted | undefined => {
  const { username, password, previous } = value;
  if (!isValue(username) || !isValue(password) || password === "") return undefined;
  if (previous === undefined) return { username, password };
  return isValue(previous) && previous !== "" ? { username, password, previous } : undefined;
};

/** A request of the content script's shape, or undefined */
export const captureRequest = (value: unknown): CaptureRequest | undefined => {
  if (!isObject(value)) return undefined;
  if (value.type === "save-pending") return { type: "save-pending" };
  if (value.type !== "save-capture") return undefined;
  const login = submitted(value);
  return login && { type: "save-capture", ...login };
};

/** A request of the prompt's shape, or undefined */
export const promptRequest = (value: unknown): PromptRequest | undefined => {
  if (!isObject(value) || !isNonce(value.nonce)) return undefined;
  const nonce = value.nonce;
  switch (value.type) {
    case "prompt-take":
    case "prompt-show":
    case "prompt-check":
    case "prompt-close":
    case "prompt-unlock":
      return { type: value.type, nonce };
    case "prompt-size":
      return typeof value.height === "number" && Number.isFinite(value.height)
        ? { type: "prompt-size", nonce, height: value.height }
        : undefined;
    default:
      return undefined;
  }
};

/** A message of the worker's shape for the prompt, or undefined: the content script acts on no other */
export const promptContentMessage = (value: unknown): PromptContentMessage | undefined => {
  if (!isObject(value) || !isNonce(value.nonce)) return undefined;
  const nonce = value.nonce;
  switch (value.type) {
    case "kennwort-prompt-owns":
    case "kennwort-prompt-show":
    case "kennwort-prompt-check":
    case "kennwort-prompt-close":
      return { type: value.type, nonce };
    case "kennwort-prompt-size":
      return typeof value.height === "number" && Number.isFinite(value.height)
        ? { type: value.type, nonce, height: value.height }
        : undefined;
    default:
      return undefined;
  }
};
