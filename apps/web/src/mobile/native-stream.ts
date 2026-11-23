/**
 * The live streams inside the mobile app (K-708; docs/plan.md, Entscheidungen, "Live-Sync in der
 * App"). The webview cannot open a socket to the server (`connect-src 'self'`), so the Rust command
 * `server_stream` opens one of the two SSE streams on the stored origin and sends its events back
 * through a Tauri channel, each checked for size and rate (apps/mobile/src-tauri: live.rs,
 * commands.rs, ServerPlugin.kt). Here they become a Response with an event-stream body again, so
 * watchNotifications and watchVault read them as in the browser. Aborting the request (the lock, the
 * logout, leaving the page) closes the stream on the native side as well.
 */
import type { Invoke } from "./native-send.ts";

/** Tauri's callback registry as @tauri-apps/api/core's Channel uses it, without the package */
export type Channels = {
  transformCallback: (callback: (message: unknown) => void, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
};

/** The registry when the page runs inside the Tauri shell, else nothing */
export const tauriChannels = (scope: object = globalThis): Channels | undefined => {
  const internals = (scope as { __TAURI_INTERNALS__?: Partial<Channels> }).__TAURI_INTERNALS__;
  return internals?.transformCallback && internals.unregisterCallback
    ? (internals as Channels)
    : undefined;
};

/** What live.rs sends (StreamMessage) */
type StreamMessage =
  | { kind: "event"; event: string; data: string }
  | { kind: "end"; reason: string };

/** What Tauri's channel delivers: a message or the end, numbered (ipc/channel.rs) */
type Delivery = { index: number; message?: StreamMessage; end?: true };

export type OpenStream = (
  path: string,
  headers: (readonly [string, string])[],
  signal: AbortSignal | null | undefined,
) => Promise<Response>;

/** Messages in the order Rust sent them: a later one can arrive first once one goes the slow way */
const inOrder = (deliver: (delivery: Delivery) => void) => {
  const waiting = new Map<number, Delivery>();
  let next = 0;
  return (delivery: Delivery) => {
    waiting.set(delivery.index, delivery);
    for (let ready = waiting.get(next); ready; ready = waiting.get(next)) {
      waiting.delete(next);
      next += 1;
      deliver(ready);
    }
  };
};

const refused = () => new TypeError("the live stream cannot be opened"); // i18n-ignore

const aborted = () => new DOMException("aborted", "AbortError"); // i18n-ignore

/** Opens a live stream through Rust; resolves once it listens, like fetch with its headers */
export const nativeStream =
  (invoke: Invoke, channels: Channels): OpenStream =>
  async (path, headers, signal) => {
    if (signal?.aborted) throw aborted();
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let streamId: number | undefined;
    let done = false;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
      cancel: () => finish(),
    });
    const callbackId = channels.transformCallback(
      inOrder(({ message, end }) => {
        if (done) return;
        if (message?.kind === "event")
          controller?.enqueue(encoder.encode(`event: ${message.event}\ndata: ${message.data}\n\n`));
        else if (message?.kind === "end" || end) finish();
      }) as (message: unknown) => void,
    );
    // Once, from whichever side ends first: the server, Rust's limits, the abort or the reader
    function finish() {
      if (done) return;
      done = true;
      channels.unregisterCallback(callbackId);
      signal?.removeEventListener("abort", finish);
      try {
        controller?.close();
      } catch {
        // Already cancelled by the reader
      }
      if (streamId !== undefined)
        void invoke("server_stream_close", { id: streamId }).catch(() => {});
    }
    signal?.addEventListener("abort", finish);
    try {
      streamId = await invoke<number>("server_stream", {
        request: { path, headers },
        onEvent: `__CHANNEL__:${callbackId}`,
      });
    } catch {
      done = true;
      channels.unregisterCallback(callbackId);
      signal?.removeEventListener("abort", finish);
      throw refused();
    }
    // Stopped while Rust was opening it: close it now that it has a number
    if (done) {
      void invoke("server_stream_close", { id: streamId }).catch(() => {});
      throw aborted();
    }
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };

/** Pause before the next try: doubling from 2 s up to `max`, from the start again after a "ready" */
export const reconnectDelay = (failures: number, max: number) =>
  Math.min(max, 2000 * 2 ** Math.max(0, failures));
