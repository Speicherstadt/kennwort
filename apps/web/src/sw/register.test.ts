import { describe, expect, it, vi } from "vitest";
import { askForCheck, CHECK_EVERY_MS, type WatchDeps, watchForUpdates } from "./register.ts";
import { CHECK_MESSAGE, type CheckOutcome } from "./worker.ts";

/** A worker that answers every check with the next outcome, on the port the page sent */
const fakeWorker = (outcomes: CheckOutcome[]) => {
  const asked: unknown[] = [];
  return {
    asked,
    postMessage: (message: unknown, ports: MessagePort[]) => {
      asked.push(message);
      ports[0]?.postMessage(outcomes.shift() ?? { ready: false });
    },
  } as unknown as ServiceWorker & { asked: unknown[] };
};

const setUp = (outcomes: CheckOutcome[], register = vi.fn(async () => ({}))) => {
  const worker = fakeWorker(outcomes);
  const listeners: Record<string, () => void> = {};
  const repeated: { run?: () => void; ms?: number } = {};
  const onReady = vi.fn();
  const document = {
    visibilityState: "visible",
    addEventListener: (type: string, listener: () => void) => {
      listeners[type] = listener;
    },
  };
  const deps = {
    container: { register, ready: Promise.resolve({ active: worker }) },
    document,
    repeat: (run: () => void, ms: number) => Object.assign(repeated, { run, ms }),
    onReady,
  } as unknown as WatchDeps;
  return { worker, listeners, repeated, onReady, document, deps, register };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("askForCheck", () => {
  it("sends the check message and resolves with the worker's answer", async () => {
    const worker = fakeWorker([{ ready: false, refused: "hash" }]);
    expect(await askForCheck(worker)).toEqual({ ready: false, refused: "hash" });
    expect((worker as unknown as { asked: unknown[] }).asked).toEqual([{ type: CHECK_MESSAGE }]);
  });
});

describe("watchForUpdates", () => {
  it("registers sw.js for the whole app, bypassing the HTTP cache", async () => {
    const { deps, register } = setUp([]);
    expect(await watchForUpdates(deps)).toBe(true);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("checks on load, when the page comes back into view and every hour", async () => {
    const { deps, worker, listeners, repeated, onReady, document } = setUp([
      { ready: false },
      { ready: false, refused: "signature" },
      { ready: true },
    ]);
    await watchForUpdates(deps);
    await settle();
    expect(onReady).not.toHaveBeenCalled();
    document.visibilityState = "hidden";
    listeners.visibilitychange?.();
    document.visibilityState = "visible";
    listeners.visibilitychange?.();
    await settle();
    expect(onReady).not.toHaveBeenCalled();
    expect(repeated.ms).toBe(CHECK_EVERY_MS);
    repeated.run?.();
    await settle();
    expect(onReady).toHaveBeenCalledOnce();
    expect((worker as unknown as { asked: unknown[] }).asked).toHaveLength(3);
  });

  it("leaves the app a plain web page when the browser refuses the worker", async () => {
    const refused = vi.fn(async () => {
      throw new Error("blocked");
    });
    const { deps, onReady } = setUp([{ ready: true }], refused);
    expect(await watchForUpdates(deps)).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });
});
