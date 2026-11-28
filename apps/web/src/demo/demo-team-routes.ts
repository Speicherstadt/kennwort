/**
 * The demo stand-in's routes for the team pages (K-706): vault access requests and the empty
 * lists the other rail pages load (notifications, devices, one-time links, emergency access).
 */
import type { Handler, Route } from "./demo-routes.ts";
import { type DemoRequest, type DemoStore, membersOfLog } from "./demo-store.ts";

const reply = (status: number, json: unknown = { ok: true }) => ({ status, json });
const notFound = () => reply(404, { error: "not-found" });

const vaultMembers = (store: DemoStore, vaultId: string) =>
  membersOfLog(store.vaults.get(vaultId)?.log ?? []);

const inVault = (store: DemoStore, caller: string | undefined, vaultId: string) =>
  store.vaults.has(vaultId) && caller !== undefined && vaultMembers(store, vaultId).has(caller);

/** Open requests; whoever a manager added meanwhile is no longer asking */
const vaultRequests: Handler = ({ store, caller, params }) => {
  const vaultId = params[0] ?? "";
  if (!inVault(store, caller, vaultId)) return notFound();
  const members = vaultMembers(store, vaultId);
  const open = [...(store.requests.get(vaultId) ?? new Map<string, DemoRequest>())].filter(
    ([id]) => !members.has(id),
  );
  return reply(200, {
    requests: open.map(([accountId, r]) => ({
      accountId,
      requestedAt: r.requestedAt,
    })),
  });
};

const requestAccess: Handler = ({ store, caller, params }) => {
  const vaultId = params[0] ?? "";
  if (!caller || !store.vaults.has(vaultId)) return notFound();
  const open = store.requests.get(vaultId) ?? new Map<string, DemoRequest>();
  if (!open.has(caller)) open.set(caller, { requestedAt: Date.now() });
  store.requests.set(vaultId, open);
  return reply(201);
};

const dropRequest: Handler = ({ store, caller, params }) => {
  const [vaultId = "", accountId = ""] = params;
  if (!inVault(store, caller, vaultId)) return notFound();
  store.requests.get(vaultId)?.delete(accountId);
  return reply(200);
};

/** The lists of the other pages: one tab is the only device, and nothing was sent or granted */
const fixed =
  (json: unknown): Handler =>
  () =>
    reply(200, json);
const thisDevice: Handler = ({ caller }) =>
  reply(200, {
    devices: [
      {
        id: caller ?? "demo",
        name: "Demo",
        signedInAt: Date.now(),
        lastSeenAt: Date.now(),
        current: true,
      },
    ],
  });

const ID = "([A-Za-z0-9_-]+)";
const at = (path: string) => new RegExp(`^${path}$`);

export const teamRoutes: Route[] = [
  { method: "GET", pattern: at(`/api/vaults/${ID}/requests`), handler: vaultRequests },
  { method: "POST", pattern: at(`/api/vaults/${ID}/requests`), handler: requestAccess },
  { method: "DELETE", pattern: at(`/api/vaults/${ID}/requests/${ID}`), handler: dropRequest },
  {
    method: "GET",
    pattern: at("/api/notifications"),
    handler: fixed({ notifications: [], unread: 0 }),
  },
  { method: "GET", pattern: at("/api/notifications/preferences"), handler: fixed({ push: [] }) },
  { method: "GET", pattern: at("/api/devices"), handler: thisDevice },
  { method: "GET", pattern: at("/api/links"), handler: fixed({ links: [] }) },
  {
    method: "GET",
    pattern: at("/api/emergency"),
    handler: fixed({ given: [], received: [], revocations: [] }),
  },
];
