/**
 * The pages of the web app and the address each one has (DESIGN.md, Aufbau: on a phone one screen
 * at a time, chosen by the URL). router.ts reads them from the address with TanStack Router; this
 * writes the address of a page for links.
 */
export type ListFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "to-change" }
  | { kind: "shared" }
  | { kind: "vault"; id: string };

export type Route =
  | { page: "entries"; filter: ListFilter; entry?: string }
  | { page: "generator" }
  | { page: "groups" }
  | { page: "settings" }
  | { page: "members" }
  | { page: "vaults" }
  | { page: "setup" }
  | { page: "unlock" }
  | { page: "recover" }
  | { page: "pair" }
  | { page: "link" }
  | { page: "invite"; id: string }
  | { page: "not-found" };

const filterPath = (filter: ListFilter) =>
  filter.kind === "all"
    ? "/entries"
    : filter.kind === "vault"
      ? `/vaults/${encodeURIComponent(filter.id)}`
      : `/${filter.kind}`;

export const routePath = (route: Route): string => {
  if (route.page === "invite") return `/invite/${encodeURIComponent(route.id)}`;
  if (route.page !== "entries") return route.page === "not-found" ? "/" : `/${route.page}`;
  const base = filterPath(route.filter);
  return route.entry ? `${base}/${encodeURIComponent(route.entry)}` : base;
};
