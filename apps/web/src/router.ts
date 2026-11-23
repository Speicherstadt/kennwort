/**
 * The pages of the web app as a TanStack Router route tree (docs/plan.md, Entscheidungen): every
 * address the app knows is a route here, and the page a route stands for is read from its match.
 * The router keeps the address and the history; what a page shows still decides the app, which
 * opens most of them only with an unlocked account (app.tsx). Code-based routes, no codegen.
 */

import type { RouterHistory } from "@tanstack/solid-router";
import { createRootRoute, createRoute, createRouter } from "@tanstack/solid-router";
import type { ListFilter, Route } from "./routes.ts";

type Params = Record<string, string>;
type Page = { path: string; route: (params: Params) => Route };

const lists: [string, ListFilter][] = [
  ["entries", { kind: "all" }],
  ["favorites", { kind: "favorites" }],
  ["to-change", { kind: "to-change" }],
  ["shared", { kind: "shared" }],
];
const simplePages = [
  "generator",
  "groups",
  "settings",
  "members",
  "vaults",
  "import",
  "export",
  "emergency",
  "links",
  "notifications",
  "security",
  "renew",
  "setup",
  "unlock",
  "recover",
  "recover-company",
  "pair",
  "link",
] as const;

const entriesOf = (filter: ListFilter, entry?: string): Route =>
  entry === undefined ? { page: "entries", filter } : { page: "entries", filter, entry };

const pages: Page[] = [
  // The start page is all entries
  { path: "/", route: () => entriesOf({ kind: "all" }) },
  ...lists.flatMap(([name, filter]): Page[] => [
    { path: `/${name}`, route: () => entriesOf(filter) },
    { path: `/${name}/$entry`, route: (p) => entriesOf(filter, p.entry) },
  ]),
  ...simplePages.map((page): Page => ({ path: `/${page}`, route: () => ({ page }) })),
  { path: "/vaults/$vault", route: (p) => entriesOf({ kind: "vault", id: p.vault ?? "" }) },
  {
    path: "/vaults/$vault/$entry",
    route: (p) => entriesOf({ kind: "vault", id: p.vault ?? "" }, p.entry),
  },
  { path: "/invite/$id", route: (p) => ({ page: "invite", id: p.id ?? "" }) },
  { path: "/s/$id", route: (p) => ({ page: "secret", id: p.id ?? "" }) },
];

const buildRouteTree = () => {
  const root = createRootRoute();
  // Keyed by the route itself: its id exists only once the router has built the tree
  const pageOf = new Map<unknown, Page>();
  const children = pages.map((page) => {
    const route = createRoute({ getParentRoute: () => root, path: page.path });
    pageOf.set(route, page);
    return route;
  });
  return { tree: root.addChildren(children), pageOf };
};

/**
 * The router over the given history (the browser's in the app), case-sensitive like the paths it
 * replaced. Scroll restoration stays off, as by default: it would keep addresses in the session
 * storage.
 */
export const createAppRouter = (history: RouterHistory) => {
  const { tree, pageOf } = buildRouteTree();
  const router = createRouter({ routeTree: tree, history, caseSensitive: true });
  /** The page at a path, `not-found` when no route matches or a part does not decode */
  const routeAt = (pathname: string): Route => {
    try {
      const [, params, found] = router.getMatchedRoutes(pathname);
      // The matcher also returns the closest route for a longer path and puts what is left over
      // under "**"; router-core counts that as not found too (matchRoutesInternal)
      const page = "**" in params ? undefined : pageOf.get(found);
      return page ? page.route(params as Params) : { page: "not-found" };
    } catch {
      // A malformed escape such as %E0 cannot be decoded: no page has that address
      return { page: "not-found" };
    }
  };
  return { router, routeAt };
};

export type AppRouter = ReturnType<typeof createAppRouter>;
