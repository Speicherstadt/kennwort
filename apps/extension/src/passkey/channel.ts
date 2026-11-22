/**
 * The way between the page's world and the content script of the same frame (K-406). The script in
 * the page posts the request to its own window with a fresh MessageChannel; only the content script
 * of that window takes it (`event.source`), so another frame neither sees nor sends one. The content
 * script confirms at once (`ack`) and answers on the same port once the service worker answered; the
 * page's abort goes back the same way. The page could post the same messages itself: they reach
 * nothing but the service worker's checks and the prompt, as a call of navigator.credentials does.
 */
import {
  type AbortRequest,
  type PageRequest,
  type PasskeyAnswer,
  pageRequest,
  passkeyAnswer,
} from "./messages.ts";

export const CHANNEL = "kennwort-passkey";
/** Without a content script to confirm within this time, the browser's own WebAuthn answers */
export const ACK_MS = 2_000;

const FALLBACK: PasskeyAnswer = { outcome: "fallback" };

type Timers = {
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (timer: unknown) => void;
};

const browserTimers: Timers = {
  schedule: (run, ms) => setTimeout(run, ms),
  cancel: (timer) => clearTimeout(timer as number),
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The part of the page's window the request goes through */
export type PostTarget = {
  postMessage: (message: unknown, origin: string, transfer: MessagePort[]) => void;
};

/** The page's side: sends a request and waits for the answer; undefined when nothing answers */
export const askContentScript =
  (win: PostTarget, timers: Timers = browserTimers) =>
  (request: PageRequest, signal: AbortSignal | undefined) =>
    new Promise<PasskeyAnswer | undefined>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      const done = (answer: PasskeyAnswer | undefined) => {
        timers.cancel(timer);
        signal?.removeEventListener("abort", onAbort);
        port1.close();
        resolve(answer);
      };
      const onAbort = () => {
        port1.postMessage({ abort: true });
        done(undefined);
      };
      const timer = timers.schedule(() => done(undefined), ACK_MS);
      port1.onmessage = (event: MessageEvent) => {
        if (isObject(event.data) && event.data.ack === true) return timers.cancel(timer);
        done(passkeyAnswer(event.data));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      win.postMessage({ channel: CHANNEL, request }, "*", [port2]);
    });

/** Whether the window's document has an opaque origin (iframe sandbox, CSP sandbox) */
const opaque = (win: unknown) => isObject(win) && win.origin === "null";

export type BridgeDeps = {
  /** The frame's window: only messages it posted to itself count, and none of an opaque origin */
  win: unknown;
  /** chrome.runtime.sendMessage to the service worker */
  send: (message: PageRequest | AbortRequest) => Promise<unknown>;
};

/** The content script's side: one listener for the window's message events */
export const createPasskeyBridge = (deps: BridgeDeps) => (event: MessageEvent) => {
  if (event.source !== deps.win || !isObject(event.data) || event.data.channel !== CHANNEL) return;
  const port = event.ports[0];
  if (!port) return;
  const request = pageRequest(event.data.request);
  // A sandboxed document's origin is opaque ("null"), whatever its address: the browser refuses it
  if (!request || opaque(deps.win)) {
    port.postMessage(FALLBACK);
    return port.close();
  }
  port.postMessage({ ack: true });
  port.onmessage = (message: MessageEvent) => {
    if (isObject(message.data) && message.data.abort === true)
      void deps.send({ type: "passkey-abort" }).catch(() => undefined);
  };
  void deps
    .send(request)
    .then(
      (answer) => passkeyAnswer(answer) ?? FALLBACK,
      () => FALLBACK,
    )
    .then((answer) => {
      port.postMessage(answer);
      port.close();
    });
};
