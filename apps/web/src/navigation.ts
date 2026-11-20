/**
 * The app's navigation over TanStack Router: links push a new state, the back button pops it, and
 * the page is read from the router's location. Passed to the pages instead of read from a context,
 * so a test hands them a router over its own window.
 */
import { createBrowserHistory } from "@tanstack/solid-router";
import { type AppRouter, createAppRouter } from "./router.ts";

export const createNavigation = (
  win: Window = window,
  app: AppRouter = createAppRouter(createBrowserHistory({ window: win })),
) => {
  const { router, routeAt } = app;
  const history = router.history;
  // Without a RouterProvider nothing else loads a change of the history into the router; the
  // location it then holds is what route() reads
  const stop = history.subscribe(() => void router.load().catch(() => {}));
  /** The history writes the address in a microtask; a link's fragment must leave it at once */
  const commit = (done: Promise<void>) => {
    history.flush();
    void done.catch(() => {});
  };
  return {
    route: () => routeAt(router.stores.location.get().pathname),
    go: (next: string) => {
      if (next === history.location.pathname) return;
      commit(router.navigate({ href: next }));
    },
    /** Replaces the current entry, so what it carried (a link's fragment) leaves the history */
    replace: (next: string) => commit(router.navigate({ href: next, replace: true })),
    /** Drops the fragment from the address and the current history entry; the page stays */
    dropFragment: () => {
      const { pathname, search, state } = history.location;
      history.replace(pathname + search, state);
      history.flush();
    },
    dispose: () => {
      stop();
      history.destroy();
    },
  };
};

export type Navigation = ReturnType<typeof createNavigation>;

/**
 * The fragment of the address the app was opened on, read once before it renders. The kit's link
 * (unlock, P-12) and the pairing link (link, P-04) carry a secret in it: dropped from the address,
 * the history entry and the router's location at once, whether or not unlocking follows. An
 * invitation reads its own (invite-page.tsx).
 */
export const takeStartFragment = (nav: Navigation, win: Window = window): string => {
  const hash = win.location.hash;
  const page = nav.route().page;
  if (hash && (page === "unlock" || page === "link")) nav.dropFragment();
  return hash;
};

/** A plain click on a link navigates in the app; with a modifier key the browser opens a tab */
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
