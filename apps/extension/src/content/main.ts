/**
 * The content script (K-403, K-404), in every http(s) frame: small, without secrets and without the
 * entries. It places the extension's menu frame under a login field and writes a login the service
 * worker sends after a click or Enter in that menu (inline-menu.ts); it hands a login the user
 * submits straight to the service worker and, in the top frame, opens the save prompt
 * (save-watch.ts). It reads no storage area; the session area is closed to content scripts anyway
 * (session-keys.ts).
 */
import { m } from "../../paraglide/messages.js";
import { MENU_PAGE } from "../fill/messages.ts";
import { type CaptureRequest, PROMPT_PAGE, type SaveAnswer } from "../save/messages.ts";
import { createInlineMenu } from "./inline-menu.ts";
import { createMenuFrame } from "./menu-frame.ts";
import { createPromptFrame } from "./prompt-frame.ts";
import { mayOpenMenu } from "./same-origin.ts";
import { createSaveWatch } from "./save-watch.ts";

type Runtime = {
  id: string;
  getURL(path: string): string;
  sendMessage(message: CaptureRequest): Promise<SaveAnswer | undefined>;
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
  const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
  const mayOpen = () => mayOpenMenu(window as unknown as Parameters<typeof mayOpenMenu>[0]);
  const menu = createInlineMenu({
    // With use_dynamic_url the address changes each browser session (manifest.ts)
    frame: createMenuFrame(document, runtime.getURL(MENU_PAGE), m.inline_menu_frame()),
    mayOpen,
    host: () => location.hostname,
    extensionId: runtime.id,
    random,
  });
  const top = window === window.top;
  const save = createSaveWatch({
    frame: top
      ? createPromptFrame(document, runtime.getURL(PROMPT_PAGE), m.save_prompt_frame())
      : undefined,
    mayCapture: mayOpen,
    send: (request) => runtime.sendMessage(request).catch(() => undefined),
    extensionId: runtime.id,
    random,
    now: () => performance.now(),
    repeat: (run, ms) => setInterval(run, ms),
    stop: (timer) => clearInterval(timer as number),
  });
  // Capturing, so a page that stops the events in its own handlers does not keep the menu open
  document.addEventListener("focusin", menu.onFocusIn, true);
  document.addEventListener("keydown", menu.onKeyDown, true);
  document.addEventListener("pointerdown", menu.onPointerDown, true);
  window.addEventListener("scroll", menu.onViewportChange, { capture: true, passive: true });
  window.addEventListener("resize", menu.onViewportChange, { passive: true });
  // Saving (K-404): a real click or key press first, then the submit it led to
  document.addEventListener("pointerdown", save.onUserAction, true);
  document.addEventListener("keydown", save.onUserAction, true);
  document.addEventListener("submit", save.onSubmit, true);
  document.addEventListener("click", save.onClick, true);
  document.addEventListener("keydown", save.onKeyDown, true);
  window.addEventListener("pagehide", save.onPageHide);
  window.addEventListener("resize", save.onViewportChange, { passive: true });
  runtime.onMessage.addListener((message, sender, respond) => {
    const answer = menu.onMessage(message, sender) ?? save.onMessage(message, sender);
    if (answer) respond(answer);
  });
  save.onLoad();
}
