/**
 * The app's navigation over TanStack Router: links push a new state, the back button pops it, and
 * the page is read from the router's location. Passed to the pages instead of read from a context,
 * so a test hands them a router over its own window.
 */
import { createBrowserHistory } from "@tanstack/solid-router";
import { type AppRouter, createAppRouter } from "./router.ts";
import type { Route } from "./routes.ts";

type Page = Route["page"];

/**
 * The pages whose link carries a secret in its fragment: the kit's (unlock, P-12), the pairing
 * link (link, P-04) and the invitation (invite, P-08)
 */
const secretPages: ReadonlySet<Page> = new Set(["unlock", "link", "invite"]);

/** A secret fragment taken from the address, and the page it was meant for */
export type TakenFragment = { page: Page; hash: string };

export const createNavigation = (
  win: Window = window,
  app: AppRouter = createAppRouter(createBrowserHistory({ window: win })),
) => {
  const { router, routeAt } = app;
  const history = router.history;
  const listeners = new Set<(taken: TakenFragment) => void>();
  /** Drops the fragment from the address and the current history entry; the page stays */
  const dropFragment = () => {
    const { pathname, search, state } = history.location;
    history.replace(pathname + search, state);
    history.flush();
  };
  /**
   * A secret fragment that reaches the address while the app is open: a link to the page the tab
   * is on changes only the fragment, so the page does not load anew and takeStartFragment does not
   * run. Taken and dropped the same way, then handed to whoever listens (the open page).
   */
  const takeArrived = ({ pathname, hash }: { pathname: string; hash: string }) => {
    const page = routeAt(pathname).page;
    if (!hash || !secretPages.has(page)) return;
    dropFragment();
    for (const listener of listeners) listener({ page, hash });
  };
  // Subscribed before the router loads a change: the popstate of a fragment navigation reaches the
  // history first, so the router only ever loads the address without the secret
  const unwatch = history.subscribe(() => takeArrived(history.location));
  // Browsers fire popstate before hashchange on a fragment navigation; this catches one without
  const onHashChange = () => takeArrived(win.location);
  win.addEventListener("hashchange", onHashChange);
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
    dropFragment,
    /** Calls `listener` with every secret fragment taken while the app is open; returns the stop */
    onFragment: (listener: (taken: TakenFragment) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: () => {
      stop();
      unwatch();
      win.removeEventListener("hashchange", onHashChange);
      listeners.clear();
      history.destroy();
    },
  };
};

export type Navigation = ReturnType<typeof createNavigation>;

/**
 * The fragment of the address the app was opened on, read once before it renders. On a page whose
 * link carries a secret in it (secretPages) it is dropped from the address, the history entry and
 * the router's location at once, whether or not unlocking or accepting follows. One that arrives
 * later is taken by the navigation itself (onFragment).
 */
export const takeStartFragment = (nav: Navigation, win: Window = window): string => {
  const hash = win.location.hash;
  if (hash && secretPages.has(nav.route().page)) nav.dropFragment();
  return hash;
};

/** A plain click on a link navigates in the app; with a modifier key the browser opens a tab */
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
