import { describe, expect, it, vi } from "vitest";
import { ACK_MS, askContentScript, CHANNEL, createPasskeyBridge } from "./channel.ts";
import type { PageRequest } from "./messages.ts";

// K-406: the page's script reaches only the content script of its own window, which confirms at
// once and answers what the service worker answered; without a content script the browser answers
const request: PageRequest = {
  type: "passkey-get",
  options: { challenge: "q83v", allow: [], userVerification: "preferred" },
};

const fakeTimers = () => {
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    timers,
    schedule: (run: () => void, ms: number) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer: unknown) => {
      if (timer) (timer as { cancelled: boolean }).cancelled = true;
    },
  };
};

/** A window whose posted messages go to the bridge, as the browser delivers them */
const connected = (send: (message: unknown) => Promise<unknown>, source?: unknown) => {
  const win = {
    postMessage: vi.fn((data: unknown, _origin: string, ports: MessagePort[]) => {
      bridge({ source: source ?? win, data, ports } as unknown as MessageEvent);
    }),
  };
  const bridge = createPasskeyBridge({ win, send: vi.fn(send) });
  return win;
};

describe("the passkey channel", () => {
  it("hands the request to the worker and returns its answer", async () => {
    const send = vi.fn(async () => ({ outcome: "error", name: "SecurityError" }));
    const timers = fakeTimers();
    const win = connected(send);
    const answer = await askContentScript(win, timers)(request, undefined);
    expect(answer).toEqual({ outcome: "error", name: "SecurityError" });
    expect(send).toHaveBeenCalledWith(request);
    expect(win.postMessage).toHaveBeenCalledWith({ channel: CHANNEL, request }, "*", [
      expect.anything(),
    ]);
    expect(timers.timers[0]?.ms).toBe(ACK_MS);
    expect(timers.timers[0]?.cancelled).toBe(true);
  });

  it("falls back for a broken request, a broken answer and a worker that is gone", async () => {
    const ask = (send: () => Promise<unknown>, req: unknown = request) =>
      askContentScript(connected(send), fakeTimers())(req as PageRequest, undefined);
    expect(await ask(async () => ({ outcome: "fallback" }), { type: "passkey-get" })).toEqual({
      outcome: "fallback",
    });
    expect(await ask(async () => undefined)).toEqual({ outcome: "fallback" });
    expect(await ask(async () => ({ outcome: "credential", credential: {} }))).toEqual({
      outcome: "fallback",
    });
    expect(
      await ask(async () => Promise.reject(new Error("Extension context invalidated"))),
    ).toEqual({
      outcome: "fallback",
    });
  });

  it("answers nothing when no content script confirms in time", async () => {
    const timers = fakeTimers();
    const asked = askContentScript({ postMessage: vi.fn() }, timers)(request, undefined);
    timers.timers[0]?.run();
    expect(await asked).toBeUndefined();
  });

  it("ignores messages from another window and without the channel or a port", () => {
    const send = vi.fn(async () => ({ outcome: "fallback" }));
    const win = {};
    const bridge = createPasskeyBridge({ win, send });
    const { port2 } = new MessageChannel();
    bridge({
      source: {},
      data: { channel: CHANNEL, request },
      ports: [port2],
    } as unknown as MessageEvent);
    bridge({
      source: win,
      data: { channel: "other", request },
      ports: [port2],
    } as unknown as MessageEvent);
    bridge({ source: win, data: null, ports: [port2] } as unknown as MessageEvent);
    bridge({
      source: win,
      data: { channel: CHANNEL, request },
      ports: [],
    } as unknown as MessageEvent);
    expect(send).not.toHaveBeenCalled();
    port2.close();
  });

  it("passes the page's abort on to the worker and answers nothing", async () => {
    let finish: (answer: unknown) => void = () => {};
    const send = vi.fn(
      (message: unknown) =>
        new Promise<unknown>((resolve) => {
          if ((message as { type: string }).type === "passkey-abort")
            return resolve({ outcome: "error", name: "NotAllowedError" });
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const asked = askContentScript(connected(send), fakeTimers())(request, controller.signal);
    await new Promise((done) => setTimeout(done, 10));
    controller.abort();
    expect(await asked).toBeUndefined();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: "passkey-abort" }));
    finish({ outcome: "fallback" });
  });
});
