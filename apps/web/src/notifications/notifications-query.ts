/**
 * The account's notifications as the app loads them (K-602): one query shared by the bell and the
 * page, loaded anew when the live channel says something is new and every few minutes besides.
 */
import type { NotificationApi } from "@kennwort/client/session/notifications-api.ts";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";

/** Should the live channel be down (a proxy that cuts streams), the list still comes */
export const REFRESH_MS = 5 * 60_000;

export type NotificationsDeps = { api: NotificationApi; session: Session };

export const tokenOf = (session: Session) => session.opened()?.token ?? "";

/** null for a list that did not load: a query holds a value, never undefined */
export const notificationsQuery = (deps: NotificationsDeps) => () => {
  const token = tokenOf(deps.session);
  return {
    queryKey: queryKeys.notifications,
    queryFn: async () => (token ? await deps.api.notifications(token) : undefined) ?? null,
    refetchInterval: REFRESH_MS,
  };
};

export const prefsQuery = (deps: NotificationsDeps) => () => {
  const token = tokenOf(deps.session);
  return {
    queryKey: queryKeys.notificationPrefs,
    queryFn: async () => (token ? await deps.api.notificationPrefs(token) : undefined) ?? null,
  };
};
