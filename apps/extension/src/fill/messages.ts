/**
 * The messages of the inline menu (K-403), all through the service worker: the menu (an extension
 * page framed inside the page) asks, the worker checks the frame tree and answers or passes the
 * request on to the content script of the one frame it checked. The page itself can send none of
 * them: it reaches neither the runtime messaging nor the menu's frame. Every message names the
 * menu's nonce, a random value only the content script and its own menu frame know, so a menu frame
 * the content script did not open (a page can frame the menu page itself) moves and fills nothing.
 */

/** The menu page inside the extension (vite.config.ts builds it, manifest.ts makes it framable) */
export const MENU_PAGE = "src/menu/menu.html";

/** From the inline menu to the service worker */
export type MenuRequest =
  | { type: "menu-page"; nonce: string }
  | {
      type: "menu-fill";
      nonce: string;
      /** The entry's stored addresses, which the worker checks against the frame's address again */
      addresses: string[];
      username: string;
      password: string;
    }
  | { type: "menu-size"; nonce: string; height: number }
  | { type: "menu-close"; nonce: string }
  | { type: "menu-unlock" };

/** From the service worker to the content scripts: which frame opened the menu, then that frame */
export type ContentMessage =
  | { type: "kennwort-owns"; nonce: string }
  | { type: "kennwort-fill"; nonce: string; host: string; username: string; password: string }
  | { type: "kennwort-menu-size"; nonce: string; height: number }
  | { type: "kennwort-menu-close"; nonce: string };

export type FillRefusal =
  | "not-menu"
  | "unknown-frame"
  | "foreign-frame"
  | "no-page"
  | "no-match"
  | "not-delivered"
  | "menu-hidden"
  | "menu-moved"
  | "no-field";

/** What the menu hears back */
export type MenuAnswer = { ok: true; host?: string } | { ok: false; error: FillRefusal };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
const NONCE = /^[0-9a-f]{32}$/;
const isNonce = (value: unknown): value is string => isString(value) && NONCE.test(value);

/** A request of the menu's shape, or undefined: the worker answers nothing else */
export const menuRequest = (value: unknown): MenuRequest | undefined => {
  if (!isObject(value)) return undefined;
  if (value.type === "menu-unlock") return { type: "menu-unlock" };
  if (!isNonce(value.nonce)) return undefined;
  const nonce = value.nonce;
  switch (value.type) {
    case "menu-page":
    case "menu-close":
      return { type: value.type, nonce };
    case "menu-size":
      return typeof value.height === "number" && Number.isFinite(value.height)
        ? { type: "menu-size", nonce, height: value.height }
        : undefined;
    case "menu-fill": {
      const { addresses, username, password } = value;
      if (!Array.isArray(addresses) || !addresses.every(isString)) return undefined;
      if (!isString(username) || !isString(password)) return undefined;
      return { type: "menu-fill", nonce, addresses, username, password };
    }
    default:
      return undefined;
  }
};

/** A message of the worker's shape, or undefined: the content script acts on nothing else */
export const contentMessage = (value: unknown): ContentMessage | undefined => {
  if (!isObject(value) || !isNonce(value.nonce)) return undefined;
  const nonce = value.nonce;
  switch (value.type) {
    case "kennwort-owns":
    case "kennwort-menu-close":
      return { type: value.type, nonce };
    case "kennwort-menu-size":
      return typeof value.height === "number" && Number.isFinite(value.height)
        ? { type: value.type, nonce, height: value.height }
        : undefined;
    case "kennwort-fill": {
      const { host, username, password } = value;
      return isString(host) && isString(username) && isString(password)
        ? { type: value.type, nonce, host, username, password }
        : undefined;
    }
    default:
      return undefined;
  }
};

/** A fresh nonce for one opened menu (128 bits, hex) */
export const newNonce = (random: (length: number) => Uint8Array) =>
  Array.from(random(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
