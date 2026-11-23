import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { notificationCalls, watchNotifications } from "./notifications-api.ts";

// K-602: the calls the app makes for notifications, against a recorded server
const note = {
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "access-requested",
  subject: "vault",
  actor: "anna",
  createdAt: 1,
  read: false,
};

const recorder = (answer: { status: number; json?: unknown }) => {
  const calls: unknown[][] = [];
  const call: Call = async (...args) => {
    calls.push(args);
    return { json: undefined, ...answer };
  };
  return { calls, api: notificationCalls(call) };
};

describe("notificationCalls", () => {
  it("lists the account's notifications and takes no answer it cannot parse", async () => {
    const list = { notifications: [note], unread: 1 };
    const listed = recorder({ status: 200, json: list });
    expect(await listed.api.notifications("t")).toEqual(list);
    expect(listed.calls).toEqual([["GET", "/api/notifications", undefined, "t"]]);
    const named = { notifications: [{ ...note, kind: "secret" }], unread: 1 };
    expect(await recorder({ status: 200, json: named }).api.notifications("t")).toBeUndefined();
    expect(await recorder({ status: 500, json: list }).api.notifications("t")).toBeUndefined();
  });

  it("marks read one or all and deletes one, true only on 200", async () => {
    const done = recorder({ status: 200 });
    expect(await done.api.markRead("t", "a/b")).toBe(true);
    expect(await done.api.markAllRead("t")).toBe(true);
    expect(await done.api.removeNotification("t", "x")).toBe(true);
    expect(done.calls).toEqual([
      ["POST", "/api/notifications/a%2Fb/read", undefined, "t"],
      ["POST", "/api/notifications/read", undefined, "t"],
      ["DELETE", "/api/notifications/x", undefined, "t"],
    ]);
    expect(await recorder({ status: 404 }).api.markRead("t", "x")).toBe(false);
  });

  it("reads and writes which kinds go out as push", async () => {
    const read = recorder({ status: 200, json: { push: ["root-changed"] } });
    expect(await read.api.notificationPrefs("t")).toEqual({ push: ["root-changed"] });
    expect(await recorder({ status: 200, json: { push: ["x"] } }).api.notificationPrefs("t")).toBe(
      undefined,
    );
    expect(await recorder({ status: 401 }).api.notificationPrefs("t")).toBeUndefined();
    const write = recorder({ status: 200 });
    expect(await write.api.setNotificationPrefs("t", { push: [] })).toBe(true);
    expect(write.calls).toEqual([["PUT", "/api/notifications/preferences", { push: [] }, "t"]]);
  });

  it("fetches the VAPID key and sends only the push address", async () => {
    const key = new Uint8Array(65).fill(4);
    expect(
      await recorder({ status: 200, json: { publicKey: encodeBytes(key) } }).api.pushKey("t"),
    ).toEqual(key);
    expect(await recorder({ status: 404 }).api.pushKey("t")).toBeUndefined();
    expect(
      await recorder({ status: 200, json: { publicKey: "AA" } }).api.pushKey("t"),
    ).toBeUndefined();
    const sub = recorder({ status: 200 });
    expect(await sub.api.subscribePush("t", "https://push.example/1")).toBe(true);
    expect(await sub.api.unsubscribePush("t", "https://push.example/1")).toBe(true);
    expect(sub.calls).toEqual([
      ["PUT", "/api/push/subscription", { endpoint: "https://push.example/1" }, "t"],
      ["DELETE", "/api/push/subscription", { endpoint: "https://push.example/1" }, "t"],
    ]);
  });
});

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

describe("watchNotifications", () => {
  it("calls back once listening and for each new notification, not for pings", async () => {
    const asked: [string, RequestInit | undefined][] = [];
    const send = (async (url: string, init?: RequestInit) => {
      asked.push([url, init]);
      return new Response(
        stream([
          "event: ready\ndata: \n\n",
          "event: ping\ndata: \n\nevent: notifi",
          "cation\ndata: \n\n",
        ]),
      );
    }) as typeof fetch;
    const heard: string[] = [];
    await watchNotifications(
      send,
      "tok",
      (event) => heard.push(event),
      new AbortController().signal,
    );
    expect(heard).toEqual(["ready", "notification"]);
    expect(asked[0]?.[0]).toBe("/api/notifications/events");
    expect(new Headers(asked[0]?.[1]?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("ends quietly on a refusal, a missing server or a stop", async () => {
    let heard = 0;
    const onNew = () => (heard += 1);
    const signal = new AbortController().signal;
    const refused = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    await watchNotifications(refused, "t", onNew, signal);
    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await watchNotifications(offline, "t", onNew, signal);
    expect(heard).toBe(0);
  });
});
