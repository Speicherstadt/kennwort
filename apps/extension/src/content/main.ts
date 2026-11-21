/**
 * The content script (K-403), in every http(s) frame: small, without secrets and without the
 * entries. It only places the extension's menu frame under a login field and writes a login the
 * service worker sends after a click or Enter in that menu (inline-menu.ts). It reads no storage
 * area; the session area is closed to content scripts anyway (session-keys.ts).
 */
import { m } from "../../paraglide/messages.js";
import { MENU_PAGE } from "../fill/messages.ts";
import { createInlineMenu } from "./inline-menu.ts";
import { createMenuFrame } from "./menu-frame.ts";
import { mayOpenMenu } from "./same-origin.ts";

type Runtime = {
  id: string;
  getURL(path: string): string;
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: { id?: string; tab?: unknown },
        respond: (answer: unknown) => void,
      ) => void,
    ): void;
  };
};

const runtime = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;

if (runtime?.id) {
  const menu = createInlineMenu({
    // With use_dynamic_url the address changes each browser session (manifest.ts)
    frame: createMenuFrame(document, runtime.getURL(MENU_PAGE), m.inline_menu_frame()),
    mayOpen: () => mayOpenMenu(window as unknown as Parameters<typeof mayOpenMenu>[0]),
    host: () => location.hostname,
    extensionId: runtime.id,
    random: (length) => crypto.getRandomValues(new Uint8Array(length)),
  });
  // Capturing, so a page that stops the events in its own handlers does not keep the menu open
  document.addEventListener("focusin", menu.onFocusIn, true);
  document.addEventListener("keydown", menu.onKeyDown, true);
  document.addEventListener("pointerdown", menu.onPointerDown, true);
  window.addEventListener("scroll", menu.onViewportChange, { capture: true, passive: true });
  window.addEventListener("resize", menu.onViewportChange, { passive: true });
  runtime.onMessage.addListener((message, sender, respond) => {
    const answer = menu.onMessage(message, sender);
    if (answer) respond(answer);
  });
}
