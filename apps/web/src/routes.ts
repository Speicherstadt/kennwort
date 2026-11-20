/**
 * The pages of the web app, read from and written to the URL (DESIGN.md, Aufbau: on a phone one
 * screen at a time, chosen by the URL). Pure functions; navigation.ts keeps the address in sync.
 */
export type ListFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "to-change" }
  | { kind: "vault"; id: string };

export type Route =
  | { page: "entries"; filter: ListFilter; entry?: string }
  | { page: "generator" }
  | { page: "groups" }
  | { page: "settings" }
  | { page: "not-found" };

const lists: Record<string, ListFilter> = {
  entries: { kind: "all" },
  favorites: { kind: "favorites" },
  "to-change": { kind: "to-change" },
};

const filterPath = (filter: ListFilter) =>
  filter.kind === "all"
    ? "/entries"
    : filter.kind === "vault"
      ? `/vaults/${encodeURIComponent(filter.id)}`
      : `/${filter.kind}`;

export const routePath = (route: Route): string => {
  if (route.page !== "entries") return route.page === "not-found" ? "/" : `/${route.page}`;
  const base = filterPath(route.filter);
  return route.entry ? `${base}/${encodeURIComponent(route.entry)}` : base;
};

const decoded = (part: string | undefined) => {
  try {
    return part === undefined ? undefined : decodeURIComponent(part);
  } catch {
    return undefined;
  }
};

const entriesRoute = (filter: ListFilter, entry: string | undefined, extra: number): Route => {
  if (extra > 0) return { page: "not-found" };
  if (entry === undefined) return { page: "entries", filter };
  const id = decoded(entry);
  return id ? { page: "entries", filter, entry: id } : { page: "not-found" };
};

export const parseRoute = (path: string): Route => {
  const parts = path.split("/").filter(Boolean);
  const [first = "entries", ...rest] = parts;
  if (first === "vaults") {
    const id = decoded(rest[0]);
    return id
      ? entriesRoute({ kind: "vault", id }, rest[1], rest.length - 2)
      : { page: "not-found" };
  }
  const filter = lists[first];
  if (filter) return entriesRoute(filter, rest[0], rest.length - 1);
  if (rest.length === 0 && (first === "generator" || first === "groups" || first === "settings"))
    return { page: first };
  return { page: "not-found" };
};
