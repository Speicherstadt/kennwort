/**
 * The server data the app shows through TanStack Query (docs/plan.md, Entscheidungen): one cache
 * per opened account, in memory only, created when it opens and emptied when it locks (app.tsx).
 * No persister: what a query holds may be decrypted (a member's name) and never reaches storage.
 * A query key names the data, never a token, a key or a secret; the token a query sends comes from
 * the session when it runs.
 */
import { QueryClient } from "@tanstack/solid-query";
import { onCleanup } from "solid-js";

export const queryKeys = {
  devices: ["devices"],
  emergency: ["emergency"],
  groups: ["groups"],
  members: ["members"],
  notifications: ["notifications"],
  notificationPrefs: ["notification-prefs"],
  policy: ["policy"],
  recovery: ["recovery"],
} as const;

/**
 * The calls answer with errors as values and never throw, so there is nothing to retry; loads
 * happen when a page opens and after a change, not when the window gets the focus back
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
    },
  });

/** The cache of one opened account: emptied when its owner, the opened frame, goes at the lock */
export const createAccountQueries = () => {
  const client = createQueryClient();
  onCleanup(() => client.clear());
  return client;
};
