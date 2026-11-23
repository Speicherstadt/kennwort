import { watchNotifications } from "@kennwort/client/session/notifications-api.ts";
import { describe, expect, it, vi } from "vitest";
import type { Invoke } from "./native-send.ts";
import { type Channels, nativeStream, reconnectDelay, tauriChannels } from "./native-stream.ts";
import { appFetch } from "./start.tsx";

const SERVER = "https://kennwort.weber-haustechnik.test";

/** Tauri's callback registry and the two stream commands, as the Rust side answers them */
const fakeTauri = (opened: number | Error = 7) => {
  const callbacks = new Map<number, (message: unknown) => void>();
  const calls: { command: string; args: unknown }[] = [];
  let nextId = 40;
  const channels: Channels = {
    transformCallback: (callback) => {
      nextId += 1;
      callbacks.set(nextId, callback);
      return nextId;
    },
    unregisterCallback: (id) => void callbacks.delete(id),
  };
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "server_stream" && opened instanceof Error) throw "unreachable";
    return command === "server_stream" ? opened : null;
  }) as unknown as Invoke;
  let index = 0;
  const deliver = (id: number, message: unknown) => {
    callbacks.get(id)?.({ index, message });
    index += 1;
  };
  return { channels, invoke, calls, callbacks, deliver };
};

const read = (response: Response) => response.text();

describe("nativeStream", () => {
  it("opens the stream by path through a channel and turns its events into SSE", async () => {
    const tauri = fakeTauri();
    const send = appFetch(SERVER, tauri.invoke, tauri.channels);
    const response = await send("/api/notifications/events", {
      headers: { accept: "text/event-stream", authorization: "Bearer abc" },
    });
    expect(tauri.calls).toEqual([
      {
        command: "server_stream",
        args: {
          request: {
            path: "/api/notifications/events",
            headers: [
              ["accept", "text/event-stream"],
              ["authorization", "Bearer abc"],
            ],
          },
          onEvent: "__CHANNEL__:41",
        },
      },
    ]);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    tauri.deliver(41, { kind: "event", event: "ready", data: "" });
    tauri.deliver(41, { kind: "event", event: "record", data: '{"entryId":"a","version":2}' });
    tauri.deliver(41, { kind: "end", reason: "closed" });
    expect(await read(response)).toBe(
      'event: ready\ndata: \n\nevent: record\ndata: {"entryId":"a","version":2}\n\n',
    );
    expect(tauri.callbacks.size).toBe(0);
  });

  it("keeps Rust's order when a message overtakes another", async () => {
    const tauri = fakeTauri();
    const response = await nativeStream(tauri.invoke, tauri.channels)("/api/x", [], undefined);
    const callback = tauri.callbacks.get(41) ?? (() => {});
    callback({ index: 1, message: { kind: "event", event: "notification", data: "" } });
    callback({ index: 2, end: true });
    callback({ index: 0, message: { kind: "event", event: "ready", data: "" } });
    expect(await read(response)).toBe("event: ready\ndata: \n\nevent: notification\ndata: \n\n");
  });

  it("closes the native stream when the listener stops, as at the lock or the logout", async () => {
    const tauri = fakeTauri(9);
    const stop = new AbortController();
    const events: string[] = [];
    const watching = watchNotifications(
      appFetch(SERVER, tauri.invoke, tauri.channels),
      "abc",
      (event) => events.push(event),
      stop.signal,
    );
    await vi.waitFor(() => expect(tauri.callbacks.size).toBe(1));
    tauri.deliver(41, { kind: "event", event: "ready", data: "" });
    tauri.deliver(41, { kind: "event", event: "notification", data: "" });
    await vi.waitFor(() => expect(events).toEqual(["ready", "notification"]));
    stop.abort();
    await watching;
    expect(tauri.calls.at(-1)).toEqual({ command: "server_stream_close", args: { id: 9 } });
    expect(tauri.callbacks.size).toBe(0);
    // Nothing that still arrives reaches the page
    tauri.deliver(41, { kind: "event", event: "notification", data: "" });
    expect(events).toEqual(["ready", "notification"]);
  });

  it("closes a stream that was stopped while Rust opened it", async () => {
    const tauri = fakeTauri(5);
    const stop = new AbortController();
    const opening = nativeStream(tauri.invoke, tauri.channels)("/api/x", [], stop.signal);
    stop.abort();
    await expect(opening).rejects.toThrow("aborted");
    expect(tauri.calls.map(({ command }) => command)).toEqual([
      "server_stream",
      "server_stream_close",
    ]);
    expect(tauri.callbacks.size).toBe(0);
  });

  it("fails like fetch when Rust refuses, and leaves no callback behind", async () => {
    const tauri = fakeTauri(new Error("refused"));
    await expect(
      nativeStream(tauri.invoke, tauri.channels)("/api/x", [], undefined),
    ).rejects.toThrow(TypeError);
    expect(tauri.callbacks.size).toBe(0);
  });

  it("opens nothing for a signal that is already aborted", async () => {
    const tauri = fakeTauri();
    await expect(
      nativeStream(tauri.invoke, tauri.channels)("/api/x", [], AbortSignal.abort()),
    ).rejects.toThrow("aborted");
    expect(tauri.calls).toEqual([]);
  });
});

describe("tauriChannels", () => {
  it("finds the callback registry only inside the Tauri shell", () => {
    expect(tauriChannels({})).toBeUndefined();
    expect(tauriChannels({ __TAURI_INTERNALS__: { invoke: () => {} } })).toBeUndefined();
    const registry = { transformCallback: () => 1, unregisterCallback: () => {} };
    expect(tauriChannels({ __TAURI_INTERNALS__: registry })).toBe(registry);
  });
});

describe("reconnectDelay", () => {
  it("doubles from 2 s up to the cap", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => reconnectDelay(n, 30_000))).toEqual([
      2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});
