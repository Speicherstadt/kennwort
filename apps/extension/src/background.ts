/**
 * The service worker (an event page in Firefox): it closes the session area to content scripts,
 * clears the unlocked keys when the lock alarm rings (account/auto-lock.ts), also while no popup
 * is open, answers the inline menu: which page it sits on, and a fill, which it hands only to
 * the frame it checked (fill/broker.ts, K-403), holds a login the user submitted until the save
 * prompt takes it (save/save-broker.ts, K-404), and compares the tag of a typed password with the
 * alert list for the phishing warning (alert/alert-broker.ts, K-405), and holds a passkey ceremony
 * a page started until the prompt answers it after the user's click (passkey/passkey-broker.ts, K-406).
 */
import { browserAlarms, lockOnAlarm } from "./account/auto-lock.ts";
import { openPopupWith, type PopupApis } from "./account/open-popup.ts";
import { type AlertContentMessage, createAlertBroker } from "./alert/alert-broker.ts";
import { alertRequest, type Warning } from "./alert/messages.ts";
import { createFillBroker } from "./fill/broker.ts";
import type { FillTarget, FrameInfo } from "./fill/frames.ts";
import { type ContentMessage, MENU_PAGE, menuRequest } from "./fill/messages.ts";
import { abortRequest, pageRequest } from "./passkey/messages.ts";
import { createPasskeyBroker } from "./passkey/passkey-broker.ts";
import { createCaptures } from "./save/captures.ts";
import {
  captureRequest,
  PROMPT_PAGE,
  type PromptContentMessage,
  promptRequest,
} from "./save/messages.ts";
import { createSaveBroker } from "./save/save-broker.ts";
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
      message:
        | ContentMessage
        | PromptContentMessage
        | AlertContentMessage
        | { type: "kennwort-passkey-open" },
      options: { frameId: number; documentId?: string },
    ): Promise<unknown>;
    onRemoved: { addListener(listener: (tabId: number) => void): void };
    create(options: { url: string }): Promise<unknown>;
  };
} & PopupApis;

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
  const frames = async (tabId: number) =>
    (await browser.webNavigation.getAllFrames({ tabId })) ?? undefined;
  // documentId pins the one document the frame tree showed: a frame that navigated gets nothing
  const send = (
    tabId: number,
    message:
      | ContentMessage
      | PromptContentMessage
      | AlertContentMessage
      | { type: "kennwort-passkey-open" },
    target: FillTarget,
  ) =>
    browser.tabs.sendMessage(
      tabId,
      message,
      target.documentId
        ? { frameId: target.frameId, documentId: target.documentId }
        : { frameId: target.frameId },
    );
  // The popup over the tab, else in a window of its own, else in a tab (account/open-popup.ts)
  const openPopup = openPopupWith(browser);
  const broker = createFillBroker({
    extensionId: browser.runtime.id,
    menuPath: `/${MENU_PAGE}`,
    frames,
    send,
    openPopup,
  });
  // A submitted login lives only in this worker's memory, and only briefly (save/captures.ts)
  const held = { now: Date.now, schedule: (run: () => void, ms: number) => setTimeout(run, ms) };
  const captures = createCaptures(held);
  // Phishing warnings wait for the prompt the same way, and hold no secret (alert/messages.ts)
  const warnings = createCaptures<Warning>(held);
  const alerts = createAlertBroker({
    extensionId: browser.runtime.id,
    area: browserSessionArea(),
    frames,
    send,
    warnings,
  });
  // A passkey ceremony waits in memory only, for the prompt's answer (K-406)
  const passkeys = createPasskeyBroker({
    extensionId: browser.runtime.id,
    frames,
    send,
    schedule: (run, ms) => setTimeout(run, ms),
    cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    captures.drop(tabId);
    alerts.drop(tabId);
    passkeys.drop(tabId);
  });
  const saving = createSaveBroker({
    extensionId: browser.runtime.id,
    promptPath: `/${PROMPT_PAGE}`,
    captures,
    warnings,
    passkeys,
    frames,
    send,
    openPopup,
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    // The menu's messages, those about saving, the warning's and the passkeys' are the only ones it answers
    if (menuRequest(message)) void broker(message, sender).then(respond);
    else if (captureRequest(message) || promptRequest(message))
      void saving(message, sender).then(respond);
    else if (alertRequest(message)) void alerts(message, sender).then(respond);
    else if (pageRequest(message) || abortRequest(message))
      void passkeys(message, sender).then(respond);
    else return undefined;
    // The answer comes later
    return true;
  });
}
