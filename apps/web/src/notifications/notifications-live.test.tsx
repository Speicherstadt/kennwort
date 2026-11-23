import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import type { Session } from "../session/session.ts";
import { NotificationsLive } from "./notifications-live.tsx";
import type { NotificationsDeps } from "./notifications-query.ts";

// K-708: the reconnect pause of the notifications' live channel, against a server that misbehaves
let dispose = () => {};
afterEach(() => {
  dispose();
  vi.useRealTimers();
});

const session = { opened: () => ({ token: "tok" }) } as unknown as Session;
const deps = { api: {}, session } as unknown as NotificationsDeps;

/** A stream that says "ready" and then ends at once, as the app's rate gate ends a flood */
const readyThenEnd = () =>
  new Response("event: ready\ndata:\n\nevent: notification\ndata:\n\n", {
    headers: { "content-type": "text/event-stream" },
  });

describe("NotificationsLive", () => {
  it("backs off from a server that ends every stream right after ready", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => readyThenEnd()) as unknown as typeof fetch;
    const root = document.createElement("div");
    dispose = render(() => withQueries(() => <NotificationsLive deps={deps} send={send} />), root);
    // 2 + 4 + 8 + 16 + 30 + 30 s: six pauses at most in two minutes, not one every 2 s
    await vi.advanceTimersByTimeAsync(120_000);
    expect(vi.mocked(send).mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("starts over at a short pause once a stream stayed open", async () => {
    vi.useFakeTimers();
    let opened = 0;
    const send = vi.fn(async (_input: unknown, init?: RequestInit) => {
      opened += 1;
      // The first streams fail at once; the fifth stays open a minute after its ready
      if (opened !== 5) return new Response(null, { status: 503 });
      const body = new ReadableStream<Uint8Array>({
        start: (c) => {
          c.enqueue(new TextEncoder().encode("event: ready\ndata:\n\n"));
          const timer = setTimeout(() => c.close(), 60_000);
          init?.signal?.addEventListener("abort", () => clearTimeout(timer));
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const root = document.createElement("div");
    dispose = render(() => withQueries(() => <NotificationsLive deps={deps} send={send} />), root);
    // 2 + 4 + 8 + 16 s of failures, then the long stream, then 2 s again
    await vi.advanceTimersByTimeAsync(30_000 + 60_000 + 2_100);
    expect(opened).toBe(6);
  });
});
