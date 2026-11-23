/**
 * Web Push on this device (K-602, P-23), with the browser passed in: turned on only by a click, as
 * the browsers ask, with the server's VAPID key; only the push service's address goes to the
 * server. The service worker shows a fixed text for each push (sw/push.ts).
 */
import type { NotificationApi } from "@kennwort/client/session/notifications-api.ts";

type Subscription = Pick<PushSubscription, "endpoint" | "unsubscribe">;
type Manager = {
  getSubscription: () => Promise<Subscription | null>;
  subscribe: (options: PushSubscriptionOptionsInit) => Promise<Subscription>;
};

export type PushDeps = {
  api: Pick<NotificationApi, "pushKey" | "subscribePush" | "unsubscribePush">;
  token: () => string;
  /** The browser's notification permission and the push manager of the service worker, if any */
  permission: () => NotificationPermission | undefined;
  requestPermission: () => Promise<NotificationPermission>;
  manager: () => Promise<Manager | undefined>;
};

export type PushState = "on" | "off" | "denied" | "unsupported";
export type PushOutcome = PushState | "failed";

/** The browser's side, where it has push: a service worker that runs, Notification, PushManager */
export const browserPush = (): Pick<PushDeps, "permission" | "requestPermission" | "manager"> => ({
  permission: () => (typeof Notification === "undefined" ? undefined : Notification.permission),
  requestPermission: () => Notification.requestPermission(),
  manager: async () => {
    if (!("serviceWorker" in navigator) || typeof PushManager === "undefined") return undefined;
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    return registration?.active ? registration.pushManager : undefined;
  },
});

/** Where this device stands; a subscription the server lost is handed to it again */
export const pushState = async (deps: PushDeps): Promise<PushState> => {
  const permission = deps.permission();
  const manager = await deps.manager();
  if (!permission || !manager) return "unsupported";
  if (permission === "denied") return "denied";
  const subscription = await manager.getSubscription();
  if (!subscription || permission !== "granted") return "off";
  return (await deps.api.subscribePush(deps.token(), subscription.endpoint)) ? "on" : "off";
};

/** Only from a click: asks for the permission, subscribes and tells the server the address */
export const enablePush = async (deps: PushDeps): Promise<PushOutcome> => {
  const manager = await deps.manager();
  if (!deps.permission() || !manager) return "unsupported";
  if ((await deps.requestPermission()) !== "granted") return "denied";
  const key = await deps.api.pushKey(deps.token());
  if (!key) return "unsupported";
  try {
    const subscription = await manager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(key),
    });
    if (await deps.api.subscribePush(deps.token(), subscription.endpoint)) return "on";
    await subscription.unsubscribe();
    return "failed";
  } catch {
    return "failed";
  }
};

export const disablePush = async (deps: PushDeps): Promise<PushOutcome> => {
  const subscription = await (await deps.manager())?.getSubscription();
  if (subscription) {
    await deps.api.unsubscribePush(deps.token(), subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "off";
};
