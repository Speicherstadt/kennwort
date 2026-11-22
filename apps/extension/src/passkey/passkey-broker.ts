/**
 * The service worker's side of the passkey provider (K-406, P-17). It takes a ceremony only from a
 * content script in the top frame or a frame of the same origin as every frame above it, as the
 * browser's frame tree shows it (fill/frames.ts); a cross-origin frame goes to the browser's own
 * WebAuthn, which applies the Permissions Policy (`publickey-credentials-get`/`-create`) itself.
 * The origin comes from that frame tree, never from the page, and the rpId must be the frame's host
 * or a registrable suffix of it (rp-id.ts). Where the browser names the sender document's own origin
 * (Chrome), it must be that origin: a sandboxed document's is opaque, and the browser refuses it. The checked ceremony waits in memory, one per tab, while
 * the top frame opens the prompt, which takes it once and answers after the user's click; only then
 * does the content script's request, and so the page, get an answer. A prompt that never takes it,
 * or a page that is not secure, falls back to the browser's own WebAuthn.
 */
import { ES256 } from "@kennwort/crypto";
import type { Sender } from "../fill/broker.ts";
import { targetOf } from "../fill/broker.ts";
import { type FillTarget, type FrameInfo, fillTarget } from "../fill/frames.ts";
import { contentSender, said } from "../save/save-broker.ts";
import {
  abortRequest,
  type Ceremony,
  type PageRequest,
  type PasskeyAnswer,
  pageRequest,
} from "./messages.ts";
import { rpIdFor } from "./rp-id.ts";

/** The prompt takes the ceremony this soon after the request, else the browser's own WebAuthn */
export const TAKE_MS = 10_000;
/** How long a ceremony waits when the page names no timeout (WebAuthn's recommended default) */
export const DEFAULT_TIMEOUT_MS = 300_000;
const TOP = 0;

export type PasskeyBrokerDeps = {
  extensionId: string;
  frames: (tabId: number) => Promise<FrameInfo[] | undefined>;
  send: (
    tabId: number,
    message: { type: "kennwort-passkey-open" },
    target: FillTarget,
  ) => Promise<unknown>;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (timer: unknown) => void;
};

type Pending = {
  ceremony: Ceremony;
  frameId: number;
  answer: (answer: PasskeyAnswer) => void;
  taken: boolean;
  timers: unknown[];
};

const FALLBACK: PasskeyAnswer = { outcome: "fallback" };
const NOT_ALLOWED: PasskeyAnswer = { outcome: "error", name: "NotAllowedError" };

/** The ceremony of a request, with the origin and rpId the worker checked */
const ceremonyOf = (request: PageRequest, origin: string, rpId: string): Ceremony => {
  if (request.type === "passkey-get") {
    const { challenge, allow, userVerification } = request.options;
    return { kind: "get", origin, rpId, challenge, allow, userVerification };
  }
  const { rp, user, challenge, algorithms, exclude } = request.options;
  return { kind: "create", origin, rpId, rpName: rp.name, user, challenge, algorithms, exclude };
};

/** Kennwort makes ES256 only; an empty list means ES256 and RS256 (WebAuthn §5.4, pubKeyCredParams) */
const takesEs256 = (request: PageRequest) =>
  request.type === "passkey-get" ||
  request.options.algorithms.length === 0 ||
  request.options.algorithms.includes(ES256);

const claimedRpId = (request: PageRequest) =>
  request.type === "passkey-get" ? request.options.rpId : request.options.rp.id;

export const createPasskeyBroker = (deps: PasskeyBrokerDeps) => {
  const pending = new Map<number, Pending>();

  const settle = (tabId: number, answer: PasskeyAnswer) => {
    const held = pending.get(tabId);
    if (!held) return false;
    pending.delete(tabId);
    for (const timer of held.timers) deps.cancel(timer);
    held.answer(answer);
    return true;
  };

  const open = async (tabId: number, frames: readonly FrameInfo[]) => {
    const top = frames.find((frame) => frame.frameId === TOP);
    if (!top) return false;
    try {
      return said(await deps.send(tabId, { type: "kennwort-passkey-open" }, targetOf(top)));
    } catch {
      return false;
    }
  };

  /** Holds the ceremony until the prompt answers, the page's timeout or TAKE_MS without a prompt */
  const hold = (tabId: number, frameId: number, ceremony: Ceremony, timeout: number) =>
    new Promise<PasskeyAnswer>((answer) => {
      settle(tabId, NOT_ALLOWED);
      const held: Pending = { ceremony, frameId, answer, taken: false, timers: [] };
      held.timers.push(
        deps.schedule(() => {
          if (pending.get(tabId) === held && !held.taken) settle(tabId, FALLBACK);
        }, TAKE_MS),
        deps.schedule(() => {
          if (pending.get(tabId) === held) settle(tabId, NOT_ALLOWED);
        }, timeout),
      );
      pending.set(tabId, held);
    });

  const request = async (message: PageRequest, sender: Sender): Promise<PasskeyAnswer> => {
    const content = contentSender(sender, deps.extensionId);
    if (!content) return NOT_ALLOWED;
    const frames = (await deps.frames(content.tabId).catch(() => undefined)) ?? [];
    const target = fillTarget(frames, content.frameId);
    // A cross-origin frame, or one the tree does not show: the browser decides
    if (!target.ok) return FALLBACK;
    if (sender.documentId && target.value.documentId !== sender.documentId) return NOT_ALLOWED;
    const checked = rpIdFor(target.value.url, claimedRpId(message));
    if (!checked.ok)
      return checked.error === "SecurityError"
        ? { outcome: "error", name: "SecurityError" }
        : FALLBACK;
    // A sandboxed document has an opaque origin behind the address the tree shows: the browser decides
    if (sender.origin !== undefined && sender.origin !== checked.value.origin) return FALLBACK;
    if (!takesEs256(message)) return FALLBACK;
    const ceremony = ceremonyOf(message, checked.value.origin, checked.value.rpId);
    const answer = hold(
      content.tabId,
      content.frameId,
      ceremony,
      message.options.timeout ?? DEFAULT_TIMEOUT_MS,
    );
    if (!(await open(content.tabId, frames))) settle(content.tabId, FALLBACK);
    return answer;
  };

  /** Answers a content script's message; undefined for one that is not about passkeys */
  const broker = async (message: unknown, sender: Sender): Promise<PasskeyAnswer | undefined> => {
    const ceremony = pageRequest(message);
    if (ceremony) return request(ceremony, sender);
    if (!abortRequest(message)) return undefined;
    const content = contentSender(sender, deps.extensionId);
    if (content && pending.get(content.tabId)?.frameId === content.frameId)
      settle(content.tabId, NOT_ALLOWED);
    return NOT_ALLOWED;
  };

  return Object.assign(broker, {
    /** The tab's ceremony for its prompt, handed over once */
    take: (tabId: number): Ceremony | undefined => {
      const held = pending.get(tabId);
      if (!held || held.taken) return undefined;
      held.taken = true;
      return held.ceremony;
    },
    /** The prompt's answer to the ceremony it took; false when there is none (aborted, timed out) */
    finish: (tabId: number, answer: PasskeyAnswer) =>
      pending.get(tabId)?.taken === true && settle(tabId, answer),
    /** A tab that closed ends its ceremony */
    drop: (tabId: number) => settle(tabId, NOT_ALLOWED),
  });
};

export type PasskeyBroker = ReturnType<typeof createPasskeyBroker>;
