/**
 * The demo stand-in's routes for the team pages (K-706): groups, their links to vaults and the
 * access requests they file (apps/server/src/sync/group-routes.ts, group-links.ts), and the empty
 * lists the other rail pages load (notifications, devices, one-time links, emergency access). As on
 * the real server a group only asks: a manager's signed add in the vault's log gives the access.
 */
import { encodeBytes } from "@kennwort/core";
import { randomBytes } from "@kennwort/crypto";
import type { Handler, Route } from "./demo-routes.ts";
import { type DemoRequest, type DemoStore, membersOfLog, type VaultRole } from "./demo-store.ts";

const reply = (status: number, json: unknown = { ok: true }) => ({ status, json });
const notFound = () => reply(404, { error: "not-found" });
const ROLES: readonly VaultRole[] = ["read", "edit", "manage"];
const RANK = { read: 0, edit: 1, manage: 2 } as const;

const isAdmin = (store: DemoStore, caller: string | undefined) => {
  const role = caller ? store.accounts.get(caller)?.role : undefined;
  return role === "owner" || role === "admin";
};

const vaultMembers = (store: DemoStore, vaultId: string) =>
  membersOfLog(store.vaults.get(vaultId)?.log ?? []);

/** Requests, filed by a group, for those of `accounts` who are not in the vault yet */
const ask = (store: DemoStore, vaultId: string, accounts: Iterable<string>, role: VaultRole) => {
  const members = vaultMembers(store, vaultId);
  const open = store.requests.get(vaultId) ?? new Map<string, DemoRequest>();
  store.requests.set(vaultId, open);
  for (const account of accounts) {
    if (members.has(account)) continue;
    const before = open.get(account);
    const higher = before?.role && RANK[before.role] > RANK[role] ? before.role : role;
    open.set(account, { requestedAt: before?.requestedAt ?? Date.now(), role: higher });
  }
};

/** Linked vaults asked anew from what their groups say now, so a removed person's request goes */
const reask = (store: DemoStore) => {
  // A person's own request (no role) stays; what groups filed is filed anew
  for (const open of store.requests.values())
    for (const [account, request] of open) if (request.role !== null) open.delete(account);
  for (const [vaultId, links] of store.vaultGroups)
    for (const [groupId, role] of links)
      ask(store, vaultId, store.groups.get(groupId)?.members ?? [], role);
};

export const listGroups: Handler = ({ store }) =>
  reply(200, {
    groups: [...store.groups.values()].map((g) => ({
      id: g.id,
      name: g.name,
      members: [...g.members],
    })),
  });

const newGroup: Handler = ({ store, caller, body }) => {
  if (!isAdmin(store, caller)) return reply(403, { error: "forbidden" });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return reply(400, { error: "invalid" });
  const id = encodeBytes(randomBytes(16));
  store.groups.set(id, { id, name, members: new Set() });
  return reply(201, { id });
};

const deleteGroup: Handler = ({ store, caller, params }) => {
  if (!isAdmin(store, caller)) return reply(403, { error: "forbidden" });
  if (!store.groups.delete(params[0] ?? "")) return notFound();
  for (const links of store.vaultGroups.values()) links.delete(params[0] ?? "");
  reask(store);
  return reply(200);
};

const joinGroup: Handler = ({ store, caller, params }) => {
  if (!isAdmin(store, caller)) return reply(403, { error: "forbidden" });
  const group = store.groups.get(params[0] ?? "");
  const account = params[1] ?? "";
  if (!group || !store.accounts.has(account)) return notFound();
  group.members.add(account);
  reask(store);
  return reply(200);
};

const leaveGroup: Handler = ({ store, caller, params }) => {
  if (!isAdmin(store, caller)) return reply(403, { error: "forbidden" });
  const group = store.groups.get(params[0] ?? "");
  if (!group) return notFound();
  group.members.delete(params[1] ?? "");
  reask(store);
  return reply(200);
};

const inVault = (store: DemoStore, caller: string | undefined, vaultId: string) =>
  store.vaults.has(vaultId) && caller !== undefined && vaultMembers(store, vaultId).has(caller);

const vaultGroups: Handler = ({ store, caller, params }) => {
  const vaultId = params[0] ?? "";
  if (!inVault(store, caller, vaultId)) return notFound();
  const links = store.vaultGroups.get(vaultId) ?? new Map<string, VaultRole>();
  return reply(200, { groups: [...links].map(([groupId, role]) => ({ groupId, role })) });
};

const linkGroup: Handler = ({ store, caller, params, body }) => {
  const [vaultId = "", groupId = ""] = params;
  if (!inVault(store, caller, vaultId) || !store.groups.has(groupId)) return notFound();
  const role = ROLES.find((r) => r === body.role);
  if (!role) return reply(400, { error: "invalid" });
  const links = store.vaultGroups.get(vaultId) ?? new Map<string, VaultRole>();
  store.vaultGroups.set(vaultId, links.set(groupId, role));
  reask(store);
  return reply(200);
};

const unlinkGroup: Handler = ({ store, caller, params }) => {
  const [vaultId = "", groupId = ""] = params;
  if (!inVault(store, caller, vaultId)) return notFound();
  store.vaultGroups.get(vaultId)?.delete(groupId);
  reask(store);
  return reply(200);
};

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
      role: r.role,
    })),
  });
};

const requestAccess: Handler = ({ store, caller, params }) => {
  const vaultId = params[0] ?? "";
  if (!caller || !store.vaults.has(vaultId)) return notFound();
  const open = store.requests.get(vaultId) ?? new Map<string, DemoRequest>();
  store.requests.set(vaultId, open.set(caller, { requestedAt: Date.now(), role: null }));
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
const GROUP = "([A-Za-z0-9_%-]+)";
const at = (path: string) => new RegExp(`^${path}$`);

export const teamRoutes: Route[] = [
  { method: "GET", pattern: at("/api/groups"), handler: listGroups },
  { method: "POST", pattern: at("/api/groups"), handler: newGroup },
  { method: "DELETE", pattern: at(`/api/groups/${GROUP}`), handler: deleteGroup },
  { method: "PUT", pattern: at(`/api/groups/${GROUP}/members/${ID}`), handler: joinGroup },
  { method: "DELETE", pattern: at(`/api/groups/${GROUP}/members/${ID}`), handler: leaveGroup },
  { method: "GET", pattern: at(`/api/vaults/${ID}/groups`), handler: vaultGroups },
  { method: "PUT", pattern: at(`/api/vaults/${ID}/groups/${GROUP}`), handler: linkGroup },
  { method: "DELETE", pattern: at(`/api/vaults/${ID}/groups/${GROUP}`), handler: unlinkGroup },
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
