/**
 * The notifications' live channel while the account is open (K-602): each event only says that
 * something is new, and the list loads anew over the session. A stream that ends (server restart,
 * offline) is opened again after a pause; it stops with the frame, at the lock.
 */
import { watchNotifications } from "@kennwort/client/session/notifications-api.ts";
import { useQueryClient } from "@tanstack/solid-query";
import { onSettled } from "solid-js";
import { queryKeys } from "../queries.ts";
import { type NotificationsDeps, tokenOf } from "./notifications-query.ts";

export const RECONNECT_MS = 30_000;

/** A pause that a stop ends early */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

export const NotificationsLive = (props: { deps: NotificationsDeps; send: typeof fetch }) => {
  const client = useQueryClient();
  onSettled(() => {
    const stop = new AbortController();
    const onEvent = () => void client.invalidateQueries({ queryKey: queryKeys.notifications });
    void (async () => {
      while (!stop.signal.aborted) {
        const token = tokenOf(props.deps.session);
        if (token) await watchNotifications(props.send, token, onEvent, stop.signal);
        await pause(RECONNECT_MS, stop.signal);
      }
    })();
    return () => stop.abort();
  });
  return null;
};
