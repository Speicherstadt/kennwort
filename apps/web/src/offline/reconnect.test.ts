import { describe, expect, it, vi } from "vitest";
import { RETRY_EVERY_MS, watchConnection } from "./reconnect.ts";

// K-308 part b: while the app reads from the offline copy it tries the server again, when the
// browser says it is online and every half minute; once it answers, the vaults load anew

const setup = (offline: { value: boolean }, reconnect = vi.fn(async () => true)) => {
  const listeners = new Map<string, () => void>();
  const timers: (() => void)[] = [];
  const reload = vi.fn(async () => {});
  const stop = watchConnection({
    offline: () => offline.value,
    reconnect,
    reload,
    window: {
      addEventListener: (type: string, run: () => void) => void listeners.set(type, run),
      removeEventListener: (type: string) => void listeners.delete(type),
    },
    repeat: (run, ms) => {
      expect(ms).toBe(RETRY_EVERY_MS);
      timers.push(run);
      return timers.length;
    },
    stop: (timer) => void timers.splice(Number(timer) - 1, 1),
  });
  return { listeners, timers, reload, reconnect, stop };
};

describe("watchConnection", () => {
  it("signs in again and reloads when the browser comes online", async () => {
    const w = setup({ value: true });
    w.listeners.get("online")?.();
    await vi.waitFor(() => expect(w.reload).toHaveBeenCalledOnce());
    expect(w.reconnect).toHaveBeenCalledOnce();
  });

  it("tries every half minute, and only while offline", async () => {
    const offline = { value: false };
    const w = setup(offline);
    w.timers[0]?.();
    await Promise.resolve();
    expect(w.reconnect).not.toHaveBeenCalled();
    offline.value = true;
    w.timers[0]?.();
    await vi.waitFor(() => expect(w.reload).toHaveBeenCalledOnce());
  });

  it("does not reload while the server still refuses or does not answer", async () => {
    const w = setup(
      { value: true },
      vi.fn(async () => false),
    );
    w.timers[0]?.();
    await vi.waitFor(() => expect(w.reconnect).toHaveBeenCalledOnce());
    expect(w.reload).not.toHaveBeenCalled();
  });

  it("tries once at a time", async () => {
    let answer = (_ok: boolean) => {};
    const reconnect = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const w = setup({ value: true }, reconnect);
    w.timers[0]?.();
    w.listeners.get("online")?.();
    expect(reconnect).toHaveBeenCalledOnce();
    answer(true);
    await vi.waitFor(() => expect(w.reload).toHaveBeenCalledOnce());
  });

  it("stops listening and trying when the app closes", () => {
    const w = setup({ value: true });
    w.stop();
    expect(w.listeners.size).toBe(0);
    expect(w.timers).toHaveLength(0);
  });
});
