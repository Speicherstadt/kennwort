/**
 * The content script's logic (K-403): it opens the menu on a login field the user focuses, moves the
 * keyboard into it on ↓, closes it on Esc or a click elsewhere, and acts on the service worker's
 * messages for the menu it opened. It holds no secret: a login passes through it once, on its way
 * into the fields, and only after these checks:
 *
 * - the message comes from the extension's service worker and names this menu's nonce;
 * - the worker's exact host is this document's host (the worker checked the stored addresses);
 * - the menu is still open, uncovered and opaque as the page shows it (menu-frame.ts).
 *
 * Events the page makes up itself (`isTrusted` false) open nothing.
 */
import { type ContentMessage, contentMessage, newNonce } from "../fill/messages.ts";
import { fillLogin } from "./fill-in.ts";
import { type Login, loginOf } from "./login-fields.ts";
import type { MenuFrame } from "./menu-frame.ts";

export type InlineMenuDeps = {
  frame: MenuFrame;
  /** Whether this frame may show a menu at all (same-origin.ts) */
  mayOpen: () => boolean;
  /** This document's host as the browser normalised it (location.hostname) */
  host: () => string;
  /** chrome.runtime.id */
  extensionId: string;
  random: (length: number) => Uint8Array;
};

/** What a fill answers the worker */
export type FillAnswer =
  | { ok: true }
  | { ok: false; error: "menu-hidden" | "menu-moved" | "no-field" };

type Sender = { id?: string; tab?: unknown };

export const createInlineMenu = (deps: InlineMenuDeps) => {
  let opened: { nonce: string; login: Login; field: HTMLElement } | undefined;
  // The field the keyboard goes back to after a fill or Esc in the menu, which opens no new menu
  let returning: EventTarget | undefined;

  const close = () => {
    deps.frame.close();
    opened = undefined;
  };
  const closeAndReturn = () => {
    const field = opened?.field;
    close();
    returning = field;
    field?.focus();
  };

  const fill = (message: Extract<ContentMessage, { type: "kennwort-fill" }>): FillAnswer => {
    if (!opened) return { ok: false, error: "menu-hidden" };
    if (message.host !== deps.host().replace(/\.$/, "")) return { ok: false, error: "menu-moved" };
    if (!deps.frame.isClear()) return { ok: false, error: "menu-hidden" };
    const filled = fillLogin(opened.login, message);
    closeAndReturn();
    return filled ? { ok: true } : { ok: false, error: "no-field" };
  };

  return {
    onFocusIn: (event: FocusEvent) => {
      if (!event.isTrusted) return;
      const field = event.composedPath()[0];
      const back = field === returning;
      returning = undefined;
      if (back || field === opened?.field || deps.frame.contains(field ?? null)) return;
      const login = loginOf(field);
      if (!login || !deps.mayOpen()) return close();
      const nonce = newNonce(deps.random);
      opened = { nonce, login, field: field as HTMLElement };
      deps.frame.open(field as HTMLElement, nonce);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!event.isTrusted || !opened || event.composedPath()[0] !== opened.field) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        deps.frame.focus();
      } else if (event.key === "Escape") close();
    },
    onPointerDown: (event: PointerEvent) => {
      if (!opened) return;
      const target = event.composedPath()[0] ?? null;
      if (target !== opened.field && !deps.frame.contains(target)) close();
    },
    onViewportChange: () => deps.frame.place(),
    /** A runtime message; the answer goes back to the worker, undefined for none */
    onMessage: (raw: unknown, sender: Sender): FillAnswer | undefined => {
      // Only the service worker: it has the extension's ID and no tab
      if (sender.id !== deps.extensionId || sender.tab !== undefined) return undefined;
      const message = contentMessage(raw);
      if (!message || !opened || message.nonce !== opened.nonce) return undefined;
      switch (message.type) {
        // The worker asks which frame opened this menu; only this one knows the nonce
        case "kennwort-owns":
          return { ok: true };
        case "kennwort-menu-size":
          deps.frame.resize(message.height);
          return undefined;
        case "kennwort-menu-close":
          closeAndReturn();
          return undefined;
        case "kennwort-fill":
          return fill(message);
      }
    },
  };
};
