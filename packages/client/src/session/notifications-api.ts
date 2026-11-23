/**
 * Notifications on the server (K-602, P-24): the account's list, marking read, deleting, which
 * kinds go out as push, and this device's push subscription. Only IDs come back; every answer is
 * parsed before it is used. The live channel only says that something is new (watchNotifications).
 */
import {
  type NotificationList,
  NotificationList as NotificationListSchema,
  NotificationPrefs,
  PushKey,
  parseSse,
} from "@kennwort/core";
import type { Call } from "./api.ts";

const ok = async (answer: Promise<{ status: number }>) => (await answer).status === 200;

export const notificationCalls = (call: Call) => ({
  notifications: async (token: string): Promise<NotificationList | undefined> => {
    const answer = await call("GET", "/api/notifications", undefined, token);
    const parsed = NotificationListSchema.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  markRead: (token: string, id: string) =>
    ok(call("POST", `/api/notifications/${encodeURIComponent(id)}/read`, undefined, token)),
  markAllRead: (token: string) => ok(call("POST", "/api/notifications/read", undefined, token)),
  removeNotification: (token: string, id: string) =>
    ok(call("DELETE", `/api/notifications/${encodeURIComponent(id)}`, undefined, token)),
  notificationPrefs: async (token: string): Promise<NotificationPrefs | undefined> => {
    const answer = await call("GET", "/api/notifications/preferences", undefined, token);
    const parsed = NotificationPrefs.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  setNotificationPrefs: (token: string, prefs: NotificationPrefs) =>
    ok(call("PUT", "/api/notifications/preferences", prefs, token)),
  /** The server's VAPID key; undefined where push is not set up */
  pushKey: async (token: string): Promise<Uint8Array | undefined> => {
    const answer = await call("GET", "/api/push/key", undefined, token);
    const parsed = PushKey.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.publicKey : undefined;
  },
  /** Only the push service's address goes out: the push is empty, its keys are not needed */
  subscribePush: (token: string, endpoint: string) =>
    ok(call("PUT", "/api/push/subscription", { endpoint }, token)),
  unsubscribePush: (token: string, endpoint: string) =>
    ok(call("DELETE", "/api/push/subscription", { endpoint }, token)),
});

export type NotificationApi = ReturnType<typeof notificationCalls>;

/**
 * Listens to the account's live channel until the signal aborts or the stream ends; calls `onEvent`
 * once it listens ("ready", so nothing between the last load and now is missed) and for each new
 * notification. The event carries nothing; the app loads the list over its session.
 */
export type LiveEvent = "ready" | "notification";

export const watchNotifications = async (
  send: typeof fetch,
  token: string,
  onEvent: (event: LiveEvent) => void,
  signal: AbortSignal,
): Promise<void> => {
  try {
    const response = await send("/api/notifications/events", {
      headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
      signal,
    });
    if (!response.ok || !response.body) return;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      const parsed = parseSse(rest + value);
      rest = parsed.rest;
      for (const { event } of parsed.events)
        if (event === "ready" || event === "notification") onEvent(event);
    }
  } catch {
    // Offline or stopped: the app loads the list again when it comes back
  }
};
