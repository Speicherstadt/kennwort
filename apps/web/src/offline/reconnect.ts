/**
 * Back to the server (K-308 part b): while the app reads from the offline copy it tries the server
 * again whenever the browser reports a connection and every half minute, one try at a time. A try
 * signs in with the sign-in key kept in memory if the account was opened offline; once that
 * worked, the vaults load anew from the server and pass every check again (P-06, P-09, P-21).
 */
export const RETRY_EVERY_MS = 30 * 1000;

export type ConnectionDeps = {
  offline: () => boolean;
  /** True once the open account has a token again (Session.reconnect) */
  reconnect: () => Promise<boolean>;
  reload: () => Promise<void>;
  window: {
    addEventListener: (type: "online", run: () => void) => void;
    removeEventListener: (type: "online", run: () => void) => void;
  };
  repeat: (run: () => void, ms: number) => unknown;
  stop: (timer: unknown) => void;
};

/** Starts watching; gives the function that stops it */
export const watchConnection = (deps: ConnectionDeps) => {
  let trying = false;
  const retry = async () => {
    if (trying || !deps.offline()) return;
    trying = true;
    try {
      if (await deps.reconnect()) await deps.reload();
    } finally {
      trying = false;
    }
  };
  const onOnline = () => void retry();
  deps.window.addEventListener("online", onOnline);
  const timer = deps.repeat(onOnline, RETRY_EVERY_MS);
  return () => {
    deps.window.removeEventListener("online", onOnline);
    deps.stop(timer);
  };
};
