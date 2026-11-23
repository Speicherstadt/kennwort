import { describe, expect, it } from "vitest";
import { disablePush, enablePush, type PushDeps, pushState } from "./push.ts";

// K-602: turning push on and off on this device, with a browser and a server recorded
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/anna";
const KEY = new Uint8Array(65).fill(4);

const setup = (over: Partial<PushDeps> & { granted?: NotificationPermission } = {}) => {
  const calls: string[] = [];
  let subscribed: { endpoint: string; unsubscribe: () => Promise<boolean> } | null = null;
  const subscription = {
    endpoint: ENDPOINT,
    unsubscribe: async () => {
      calls.push("unsubscribe");
      subscribed = null;
      return true;
    },
  };
  let permission: NotificationPermission = "default";
  const deps: PushDeps = {
    api: {
      pushKey: async () => KEY,
      subscribePush: async (token, endpoint) => {
        calls.push(`server+ ${token} ${endpoint}`);
        return true;
      },
      unsubscribePush: async (token, endpoint) => {
        calls.push(`server- ${token} ${endpoint}`);
        return true;
      },
    },
    token: () => "tok",
    permission: () => permission,
    requestPermission: async () => {
      calls.push("ask");
      permission = over.granted ?? "granted";
      return permission;
    },
    manager: async () => ({
      getSubscription: async () => subscribed,
      subscribe: async (options) => {
        calls.push(
          `subscribe ${options.userVisibleOnly} ${(options.applicationServerKey as Uint8Array).length}`,
        );
        subscribed = subscription;
        return subscription;
      },
    }),
    ...over,
  };
  return { deps, calls };
};

describe("enablePush", () => {
  it("asks, subscribes with the server's key for visible notifications and sends only the address", async () => {
    const { deps, calls } = setup();
    expect(await pushState(deps)).toBe("off");
    expect(await enablePush(deps)).toBe("on");
    expect(calls).toEqual(["ask", "subscribe true 65", `server+ tok ${ENDPOINT}`]);
    expect(await pushState(deps)).toBe("on");
  });

  it("stops when the person or the browser says no", async () => {
    const { deps, calls } = setup({ granted: "denied" });
    expect(await enablePush(deps)).toBe("denied");
    expect(calls).toEqual(["ask"]);
    expect(await pushState(deps)).toBe("denied");
  });

  it("is unsupported without a service worker, without Notification or without a key on the server", async () => {
    expect(await enablePush(setup({ manager: async () => undefined }).deps)).toBe("unsupported");
    expect(await pushState(setup({ manager: async () => undefined }).deps)).toBe("unsupported");
    const noNotification = setup({ permission: () => undefined });
    expect(await enablePush(noNotification.deps)).toBe("unsupported");
    expect(noNotification.calls).toEqual([]);
    const { deps } = setup();
    const noKey = { ...deps, api: { ...deps.api, pushKey: async () => undefined } };
    expect(await enablePush(noKey)).toBe("unsupported");
  });

  it("takes the subscription back when the server refuses it, and fails when the browser does", async () => {
    const { deps, calls } = setup();
    const refusing = { ...deps, api: { ...deps.api, subscribePush: async () => false } };
    expect(await enablePush(refusing)).toBe("failed");
    expect(calls).toContain("unsubscribe");
    const broken = setup({
      manager: async () => ({
        getSubscription: async () => null,
        subscribe: () => Promise.reject(new Error("push service unreachable")),
      }),
    });
    expect(await enablePush(broken.deps)).toBe("failed");
  });
});

describe("disablePush", () => {
  it("tells the server and unsubscribes; nothing to do without a subscription", async () => {
    const { deps, calls } = setup();
    expect(await disablePush(deps)).toBe("off");
    expect(calls).toEqual([]);
    await enablePush(deps);
    expect(await disablePush(deps)).toBe("off");
    expect(calls.slice(-2)).toEqual([`server- tok ${ENDPOINT}`, "unsubscribe"]);
    expect(await pushState(deps)).toBe("off");
  });
});
