/**
 * The service worker's side of the inline menu (K-403, P-17). It answers only the extension's own
 * menu page, framed in a tab. For each request it reads the tab's frame tree as it is at that
 * moment and asks the content script of each web frame whether it opened the menu with this
 * nonce: the browser's frame tree does not list the extension's own frames, and only the content
 * script that opened the menu knows its nonce. That one frame must pass frames.ts, and a password
 * goes only to its document, by frameId and documentId, after checking the frame's address against
 * the entry's stored addresses once more (page/matches.ts). It keeps nothing between requests: a
 * worker the browser stopped and woke again answers the same.
 */
import { fillAllowed, pageHost } from "../page/matches.ts";
import { type FillTarget, type FrameInfo, fillTarget, webFrames } from "./frames.ts";
import { type ContentMessage, type MenuAnswer, type MenuRequest, menuRequest } from "./messages.ts";

/** What chrome.runtime.onMessage tells about the sender */
export type Sender = {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
};

export type BrokerDeps = {
  /** chrome.runtime.id */
  extensionId: string;
  /** The menu page's path inside the extension */
  menuPath: string;
  /** chrome.webNavigation.getAllFrames for a tab */
  frames: (tabId: number) => Promise<FrameInfo[] | undefined>;
  /** chrome.tabs.sendMessage to one frame's document; resolves with the content script's answer */
  send: (tabId: number, message: ContentMessage, target: FillTarget) => Promise<unknown>;
  /** Opens the popup to unlock (chrome.action.openPopup, else popup.html in a window) */
  openPopup: () => Promise<void>;
};

const EXTENSION_SCHEMES = new Set(["chrome-extension:", "moz-extension:"]);

/** The tab of the extension's own menu page, framed in it; content scripts and pages are not it */
const menuSender = (sender: Sender, deps: BrokerDeps) => {
  if (sender.id !== deps.extensionId || !sender.url) return undefined;
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId === undefined || sender.frameId === 0) return undefined;
  try {
    const url = new URL(sender.url);
    if (!EXTENSION_SCHEMES.has(url.protocol) || url.pathname !== deps.menuPath) return undefined;
  } catch {
    return undefined;
  }
  return { tabId };
};

const targetOf = (frame: FrameInfo): FillTarget =>
  frame.documentId
    ? { frameId: frame.frameId, documentId: frame.documentId, url: frame.url }
    : { frameId: frame.frameId, url: frame.url };

const said = (answer: unknown) =>
  typeof answer === "object" && answer !== null && (answer as { ok?: unknown }).ok === true;

const refuse = (error: Extract<MenuAnswer, { ok: false }>["error"]): MenuAnswer => ({
  ok: false,
  error,
});

/** A content script's answer to a fill: what it says, or not delivered */
const contentAnswer = (answer: unknown): MenuAnswer => {
  if (typeof answer !== "object" || answer === null) return refuse("not-delivered");
  const { ok, error } = answer as { ok?: unknown; error?: unknown };
  if (ok === true) return { ok: true };
  return refuse(
    error === "menu-hidden" || error === "menu-moved" || error === "no-field"
      ? error
      : "not-delivered",
  );
};

export const createFillBroker = (deps: BrokerDeps) => {
  const deliver = async (tabId: number, message: ContentMessage, target: FillTarget) => {
    try {
      return await deps.send(tabId, message, target);
    } catch {
      // The document is gone, navigated or has no content script: nothing reached it
      return undefined;
    }
  };

  /** The web frames whose content script says it opened the menu with this nonce */
  const ownersOf = async (tabId: number, frames: FrameInfo[], nonce: string) => {
    const candidates = webFrames(frames);
    const answers = await Promise.all(
      candidates.map((frame) => deliver(tabId, { type: "kennwort-owns", nonce }, targetOf(frame))),
    );
    return candidates.filter((_, index) => said(answers[index]));
  };

  const handle = async (
    request: Exclude<MenuRequest, { type: "menu-unlock" }>,
    tabId: number,
    target: FillTarget,
  ): Promise<MenuAnswer> => {
    switch (request.type) {
      case "menu-page":
        return { ok: true, host: pageHost(target.url) ?? "" };
      case "menu-size":
      case "menu-close": {
        const message: ContentMessage =
          request.type === "menu-size"
            ? { type: "kennwort-menu-size", nonce: request.nonce, height: request.height }
            : { type: "kennwort-menu-close", nonce: request.nonce };
        await deliver(tabId, message, target);
        return { ok: true };
      }
      case "menu-fill": {
        const host = pageHost(target.url);
        if (!host || !fillAllowed(target.url, request.addresses)) return refuse("no-match");
        const { nonce, username, password } = request;
        const message: ContentMessage = { type: "kennwort-fill", nonce, host, username, password };
        return contentAnswer(await deliver(tabId, message, target));
      }
    }
  };

  /** Answers one runtime message; undefined for a message that is not the menu's */
  return async (message: unknown, sender: Sender): Promise<MenuAnswer | undefined> => {
    const request = menuRequest(message);
    if (!request) return undefined;
    const menu = menuSender(sender, deps);
    if (!menu) return refuse("not-menu");
    if (request.type === "menu-unlock") {
      await deps.openPopup();
      return { ok: true };
    }
    // The frame tree as it is now, for this one request: the URL check happens at fill time
    const frames = (await deps.frames(menu.tabId).catch(() => undefined)) ?? [];
    const owners = await ownersOf(menu.tabId, frames, request.nonce);
    if (owners.length !== 1) return refuse("unknown-frame");
    const target = fillTarget(frames, (owners[0] as FrameInfo).frameId);
    if (!target.ok) return refuse(target.error);
    return handle(request, menu.tabId, target.value);
  };
};
