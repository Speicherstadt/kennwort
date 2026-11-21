/**
 * The service worker's side of saving a login (K-404, P-17). It takes a submitted login only from
 * a content script in a frame the browser's frame tree shows as the top frame or a frame of the
 * same origin as every frame above it (fill/frames.ts), the same rule as for filling, and reads the
 * host from that frame tree, never from the message. It holds the login in memory (captures.ts),
 * offers it once to the top frame of the tab, and hands it once to the save prompt that this top
 * frame's content script opened with its nonce. The prompt, an extension page, compares and saves.
 */

import { extensionFrameSender, type Sender, targetOf } from "../fill/broker.ts";
import { type FillTarget, type FrameInfo, fillTarget } from "../fill/frames.ts";
import { pageHost } from "../page/matches.ts";
import type { Captures } from "./captures.ts";
import {
  type CaptureRequest,
  captureRequest,
  type PromptContentMessage,
  type PromptRequest,
  promptRequest,
  type SaveAnswer,
  type SaveRefusal,
} from "./messages.ts";

export type SaveBrokerDeps = {
  extensionId: string;
  /** The prompt page's path inside the extension */
  promptPath: string;
  captures: Captures;
  frames: (tabId: number) => Promise<FrameInfo[] | undefined>;
  send: (tabId: number, message: PromptContentMessage, target: FillTarget) => Promise<unknown>;
  openPopup: () => Promise<void>;
};

const WEB = new Set(["http:", "https:"]);
const TOP = 0;

const refuse = (error: SaveRefusal): SaveAnswer => ({ ok: false, error });

const isWeb = (url: string | undefined) => {
  try {
    return url !== undefined && WEB.has(new URL(url).protocol);
  } catch {
    return false;
  }
};

/** A content script of a web frame in a tab: the extension's ID, a tab and a web address */
const contentSender = (sender: Sender, extensionId: string) => {
  const tabId = sender.tab?.id;
  if (sender.id !== extensionId || tabId === undefined || sender.frameId === undefined)
    return undefined;
  return isWeb(sender.url) ? { tabId, frameId: sender.frameId } : undefined;
};

const said = (answer: unknown) =>
  typeof answer === "object" && answer !== null && (answer as { ok?: unknown }).ok === true;

export const createSaveBroker = (deps: SaveBrokerDeps) => {
  const framesOf = async (tabId: number) => (await deps.frames(tabId).catch(() => undefined)) ?? [];
  const deliver = async (tabId: number, message: PromptContentMessage, target: FillTarget) => {
    try {
      return await deps.send(tabId, message, target);
    } catch {
      return undefined;
    }
  };

  /** A submitted login from a frame that may be filled, with its host from the frame tree */
  const capture = async (
    request: Extract<CaptureRequest, { type: "save-capture" }>,
    sender: Sender,
    tabId: number,
    frameId: number,
  ): Promise<SaveAnswer> => {
    const target = fillTarget(await framesOf(tabId), frameId);
    if (!target.ok) return refuse(target.error);
    // The frame navigated since it sent this: the login belongs to a document that is gone
    if (sender.documentId && target.value.documentId !== sender.documentId)
      return refuse("unknown-frame");
    const host = pageHost(target.value.url);
    if (!host) return refuse("no-page");
    const { type: _, ...submitted } = request;
    deps.captures.put(tabId, { ...submitted, host, url: target.value.url });
    return { ok: true };
  };

  const fromContent = async (request: CaptureRequest, sender: Sender): Promise<SaveAnswer> => {
    const content = contentSender(sender, deps.extensionId);
    if (!content) return refuse("not-content");
    if (request.type === "save-capture")
      return capture(request, sender, content.tabId, content.frameId);
    if (content.frameId !== TOP) return refuse("not-top");
    return deps.captures.offer(content.tabId) ? { ok: true } : refuse("nothing");
  };

  /** The top frame, if its content script says it opened the prompt with this nonce */
  const promptOwner = async (tabId: number, nonce: string) => {
    const top = (await framesOf(tabId)).find((frame) => frame.frameId === TOP);
    if (!top || !isWeb(top.url)) return undefined;
    const target = targetOf(top);
    const answer = await deliver(tabId, { type: "kennwort-prompt-owns", nonce }, target);
    return said(answer) ? target : undefined;
  };

  const fromPrompt = async (request: PromptRequest, sender: Sender): Promise<SaveAnswer> => {
    const prompt = extensionFrameSender(sender, deps.extensionId, deps.promptPath);
    if (!prompt) return refuse("not-prompt");
    const target = await promptOwner(prompt.tabId, request.nonce);
    if (!target) return refuse("unknown-frame");
    const { nonce } = request;
    switch (request.type) {
      case "prompt-take": {
        const taken = deps.captures.take(prompt.tabId);
        return taken ? { ok: true, capture: taken } : refuse("nothing");
      }
      case "prompt-unlock":
        await deps.openPopup();
        return { ok: true };
      case "prompt-check": {
        const answer = await deliver(
          prompt.tabId,
          { type: "kennwort-prompt-check", nonce },
          target,
        );
        return said(answer) ? { ok: true } : refuse("prompt-hidden");
      }
      case "prompt-size":
        await deliver(
          prompt.tabId,
          { type: "kennwort-prompt-size", nonce, height: request.height },
          target,
        );
        return { ok: true };
      case "prompt-show":
      case "prompt-close":
        await deliver(
          prompt.tabId,
          {
            type: request.type === "prompt-show" ? "kennwort-prompt-show" : "kennwort-prompt-close",
            nonce,
          },
          target,
        );
        return { ok: true };
    }
  };

  /** Answers one runtime message; undefined for one that is not about saving */
  return async (message: unknown, sender: Sender): Promise<SaveAnswer | undefined> => {
    const fromPage = captureRequest(message);
    if (fromPage) return fromContent(fromPage, sender);
    const fromFrame = promptRequest(message);
    return fromFrame && fromPrompt(fromFrame, sender);
  };
};
