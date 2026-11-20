/**
 * What the opened app does with the offline copy (K-308 part b): it reads from it while the server
 * does not answer or the account was opened without it, then offers no change, and tries the
 * server again until it answers (reconnect.ts). Called in the frame's body, so watching stops with
 * the frame.
 */
import { onSettled } from "solid-js";
import type { Session } from "../session/session.ts";
import type { LocalCopy } from "./local-copy.ts";
import { watchConnection } from "./reconnect.ts";

export const createOfflineView = (
  copy: () => LocalCopy | undefined,
  session: Session,
  reload: () => Promise<void>,
) => {
  const offline = () => {
    const kept = copy();
    return kept !== undefined && (!kept.reachable() || !session.opened()?.token);
  };
  onSettled(() =>
    watchConnection({
      offline,
      reconnect: () => session.reconnect(),
      reload,
      window,
      repeat: (run, ms) => setInterval(run, ms),
      stop: (timer) => clearInterval(timer as number),
    }),
  );
  return {
    offline,
    /** A change only with the server: offline the handler is left out, so its button is disabled */
    online: <T>(handler: T) => (offline() ? undefined : handler),
  };
};
