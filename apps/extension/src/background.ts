/**
 * The service worker (an event page in Firefox): it closes the session area to content scripts,
 * clears the unlocked keys when the lock alarm rings (account/auto-lock.ts), also while no popup
 * is open, and answers the inline menu: which page it sits on, and a fill, which it hands only to
 * the frame it checked (fill/broker.ts, K-403).
 */
import { browserAlarms, lockOnAlarm } from "./account/auto-lock.ts";
import { createFillBroker } from "./fill/broker.ts";
import type { FillTarget, FrameInfo } from "./fill/frames.ts";
import { type ContentMessage, MENU_PAGE, menuRequest } from "./fill/messages.ts";
import { browserSessionArea, restrictToTrustedContexts } from "./session-keys.ts";

type Chrome = {
  runtime: {
    id: string;
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: object,
          respond: (answer: unknown) => void,
        ) => boolean | undefined,
      ): void;
    };
  };
  webNavigation: {
    getAllFrames(details: { tabId: number }): Promise<FrameInfo[] | null>;
  };
  tabs: {
    sendMessage(
      tabId: number,
      message: ContentMessage,
      options: { frameId: number; documentId?: string },
    ): Promise<unknown>;
  };
  action: { openPopup?: () => Promise<void> };
  windows: { create(options: object): Promise<unknown> };
};

// Not awaited at the top level: service workers refuse top-level await. The popup closes the area
// once more before it stores a key and refuses to store one if that fails (account/unlocked-store.ts).
void restrictToTrustedContexts(browserSessionArea()).then((restricted) => {
  if (!restricted.ok) console.error(`kennwort: session area not restricted (${restricted.error})`);
});

// Registered at once, at the top level, so a worker woken by the alarm has its listener (MV3)
browserAlarms()?.onAlarm?.addListener((alarm) => void lockOnAlarm(browserSessionArea(), alarm));

const chrome = (globalThis as { chrome?: Chrome }).chrome;

if (chrome?.webNavigation && chrome.tabs) {
  const browser = chrome;
  const broker = createFillBroker({
    extensionId: browser.runtime.id,
    menuPath: `/${MENU_PAGE}`,
    frames: async (tabId) => (await browser.webNavigation.getAllFrames({ tabId })) ?? undefined,
    // documentId pins the one document the frame tree showed: a frame that navigated gets nothing
    send: (tabId, message, target: FillTarget) =>
      browser.tabs.sendMessage(
        tabId,
        message,
        target.documentId
          ? { frameId: target.frameId, documentId: target.documentId }
          : { frameId: target.frameId },
      ),
    // The popup over the tab; where the browser refuses that, the popup in a window of its own
    openPopup: async () => {
      const opened = await browser.action.openPopup?.().then(
        () => true,
        () => false,
      );
      if (!opened) {
        await browser.windows.create({ url: "popup.html", type: "popup", width: 360, height: 600 });
      }
    },
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    // The menu's messages are the only ones this worker answers
    if (!menuRequest(message)) return undefined;
    void broker(message, sender).then(respond);
    // The answer comes later
    return true;
  });
}
