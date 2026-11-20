/** The address as a signal: links push a new state, the back button pops it (History API) */
import { createSignal } from "solid-js";
import { parseRoute } from "./routes.ts";

export const createNavigation = (win: Window = window) => {
  const [path, setPath] = createSignal(win.location.pathname);
  const onPop = () => setPath(win.location.pathname);
  win.addEventListener("popstate", onPop);
  return {
    route: () => parseRoute(path()),
    go: (next: string) => {
      if (next === path()) return;
      win.history.pushState(null, "", next);
      setPath(next);
    },
    /** Replaces the current entry, so what it carried (a link's fragment) leaves the history */
    replace: (next: string) => {
      win.history.replaceState(null, "", next);
      setPath(next);
    },
    /** Drops the fragment from the address and the current history entry; the page stays */
    dropFragment: () =>
      win.history.replaceState(null, "", win.location.pathname + win.location.search),
    dispose: () => win.removeEventListener("popstate", onPop),
  };
};

export type Navigation = ReturnType<typeof createNavigation>;

/** A plain click on a link navigates in the app; with a modifier key the browser opens a tab */
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
