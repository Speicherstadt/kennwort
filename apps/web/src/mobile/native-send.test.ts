import { describe, expect, it, vi } from "vitest";
import { appServer, type Invoke, nativeSend, tauriInvoke } from "./native-send.ts";
import { appFetch } from "./start.tsx";

const SERVER = "https://kennwort.weber-haustechnik.test";

/** An IPC that records each command and answers like the Rust side would */
const fakeInvoke = (
  answer: unknown = { status: 200, contentType: "application/json", body: "{}" },
) => {
  const calls: { command: string; args: unknown }[] = [];
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (answer instanceof Error) throw answer.message;
    return answer;
  }) as unknown as Invoke;
  return { invoke, calls };
};

describe("appFetch", () => {
  it("hands the Rust side only method, path, headers and body, never an address", async () => {
    const { invoke, calls } = fakeInvoke({
      status: 201,
      contentType: "application/json",
      body: '{"a":1}',
    });
    const response = await appFetch(SERVER, invoke)("/api/vaults/abc/records?since=3", {
      method: "put",
      headers: { Authorization: "Bearer abc", "content-type": "application/json" },
      body: '{"x":1}',
    });
    expect(calls).toEqual([
      {
        command: "server_fetch",
        args: {
          request: {
            method: "PUT",
            path: "/api/vaults/abc/records?since=3",
            headers: [
              ["authorization", "Bearer abc"],
              ["content-type", "application/json"],
            ],
            body: '{"x":1}',
          },
        },
      },
    ]);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("refuses another origin before anything crosses the IPC", async () => {
    const { invoke, calls } = fakeInvoke();
    const send = appFetch(SERVER, invoke);
    await expect(send("https://evil.test/api/vaults")).rejects.toThrow(TypeError);
    await expect(send("//evil.test/api/vaults")).rejects.toThrow(TypeError);
    await expect(send(new Request("https://evil.test/api/x"))).rejects.toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it("refuses another origin in nativeSend too, without serverFetch in front", async () => {
    const { invoke, calls } = fakeInvoke();
    await expect(nativeSend(SERVER, invoke)("https://evil.test/api/x")).rejects.toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it("fails like a network error when the Rust side refuses, so callers see status 0", async () => {
    const { invoke } = fakeInvoke(new Error("unreachable"));
    await expect(appFetch(SERVER, invoke)("/api/vaults")).rejects.toThrow(TypeError);
  });

  it("opens no live stream: the IPC has no socket for it", async () => {
    const { invoke, calls } = fakeInvoke();
    await expect(
      appFetch(SERVER, invoke)("/api/vaults/abc/events", {
        headers: { accept: "text/event-stream" },
      }),
    ).rejects.toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it("sends text bodies only", async () => {
    const { invoke, calls } = fakeInvoke();
    await expect(
      appFetch(SERVER, invoke)("/api/x", { method: "POST", body: new Uint8Array([1]) }),
    ).rejects.toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it("gives a bodiless status an empty body", async () => {
    const { invoke } = fakeInvoke({ status: 204, body: "" });
    const response = await appFetch(SERVER, invoke)("/api/x", { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

describe("appServer", () => {
  it("reads the stored origin, or nothing when the IPC fails", async () => {
    expect(await appServer(fakeInvoke(SERVER).invoke).stored()).toBe(SERVER);
    expect(await appServer(fakeInvoke(new Error("x")).invoke).stored()).toBeNull();
  });

  it("stores a typed address and passes on Rust's refusal as a known error", async () => {
    const stored = fakeInvoke(SERVER);
    expect(await appServer(stored.invoke).store(`${SERVER}/`)).toEqual({ ok: true, value: SERVER });
    expect(stored.calls).toEqual([{ command: "server_set", args: { typed: `${SERVER}/` } }]);
    const insecure = appServer(fakeInvoke(new Error("insecure-server")).invoke);
    expect(await insecure.store("http://x.test")).toEqual({ ok: false, error: "insecure-server" });
    const already = appServer(fakeInvoke(new Error("server-already-set")).invoke);
    expect(await already.store(SERVER)).toEqual({ ok: false, error: "unexpected" });
  });
});

describe("tauriInvoke", () => {
  it("finds Tauri's IPC only inside the shell", () => {
    const invoke = async () => undefined;
    expect(tauriInvoke({ __TAURI_INTERNALS__: { invoke } })).toBe(invoke);
    expect(tauriInvoke({})).toBeUndefined();
  });
});
