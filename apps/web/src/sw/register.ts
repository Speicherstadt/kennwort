/**
 * The page's side of the service worker (P-16): registers sw.js and asks it for a later release on
 * load, whenever the page comes back into view and every hour. Only the worker decides whether a
 * release is good; the page learns only that a verified one waits, and offers to reload.
 */
import { CHECK_MESSAGE, type CheckOutcome } from "./worker.ts";

export const CHECK_EVERY_MS = 60 * 60 * 1000;

type Worker = Pick<ServiceWorker, "postMessage">;
export type WatchDeps = {
  container: Pick<ServiceWorkerContainer, "register" | "ready">;
  document: Pick<Document, "addEventListener" | "visibilityState">;
  repeat: (run: () => void, ms: number) => void;
  onReady: () => void;
};

/** Asks the worker for a check; the answer comes on a port of its own */
export const askForCheck = (worker: Worker): Promise<CheckOutcome> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<CheckOutcome>) => {
      channel.port1.close();
      resolve(event.data);
    };
    worker.postMessage({ type: CHECK_MESSAGE }, [channel.port2]);
  });

/** False when the browser refuses the worker; the app then runs as a plain web page */
export const watchForUpdates = async (deps: WatchDeps): Promise<boolean> => {
  try {
    // updateViaCache "none": the browser compares sw.js with the server's, never with a cached copy
    await deps.container.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return false;
  }
  const { active } = await deps.container.ready;
  if (!active) return false;
  const check = async () => {
    if ((await askForCheck(active)).ready) deps.onReady();
  };
  void check();
  deps.document.addEventListener("visibilitychange", () => {
    if (deps.document.visibilityState === "visible") void check();
  });
  deps.repeat(() => void check(), CHECK_EVERY_MS);
  return true;
};
