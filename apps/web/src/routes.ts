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
  | { page: "import" }
  | { page: "export" }
  | { page: "emergency" }
  | { page: "links" }
  | { page: "notifications" }
  /** The security overview (K-603) */
  | { page: "security" }
  | { page: "renew" }
  /** Einstellungen → „Firmen“ (K-605): the companies of the account, joining and switching */
  | { page: "companies" }
  /** Einstellungen → „Datenschutz“ (K-607): what the server keeps, the download, deleting */
  | { page: "privacy" }
  | { page: "setup" }
  | { page: "unlock" }
  | { page: "recover" }
  | { page: "recover-company" }
  | { page: "pair" }
  | { page: "link" }
  /** Back from the identity provider (K-604): a one-time ticket in the fragment */
  | { page: "oidc" }
  /** A deep link of another app (K-604): /open?link=web+kennwort://vault/<id>/entry/<id> */
  | { page: "open" }
  | { page: "invite"; id: string }
  /** A one-time link's page (K-601): reachable without an account, its secret in the fragment */
  | { page: "secret"; id: string }
  | { page: "not-found" };

const filterPath = (filter: ListFilter) =>
  filter.kind === "all"
    ? "/entries"
    : filter.kind === "vault"
      ? `/vaults/${encodeURIComponent(filter.id)}`
      : `/${filter.kind}`;

export const routePath = (route: Route): string => {
  if (route.page === "invite") return `/invite/${encodeURIComponent(route.id)}`;
  if (route.page === "secret") return `/s/${encodeURIComponent(route.id)}`;
  if (route.page !== "entries") return route.page === "not-found" ? "/" : `/${route.page}`;
  const base = filterPath(route.filter);
  return route.entry ? `${base}/${encodeURIComponent(route.entry)}` : base;
};
