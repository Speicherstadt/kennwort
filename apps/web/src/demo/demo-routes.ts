/**
 * The routes of the demo's stand-in (K-706): the subset of apps/server's API the web app needs to
 * unlock, load its vaults and entries and write them. The shapes follow the real routes
 * (apps/server/src/auth/setup.ts, auth/login-key.ts, account/routes.ts, account/members.ts,
 * sync/log-routes.ts, sync/routes.ts); the client parses every answer with the same schemas.
 */
import { bytes, encodeBytes } from "@kennwort/core";
import { randomBytes, verify } from "@kennwort/crypto";
import { type DemoAccount, type DemoStore, membersOfLog, type WireLogEntry } from "./demo-store.ts";
import { teamRoutes } from "./demo-team-routes.ts";

export type Answer = { status: number; json: unknown };
export type Request = {
  store: DemoStore;
  params: string[];
  body: Record<string, unknown>;
  /** The account the bearer token names, if any */
  caller: string | undefined;
};
export type Handler = (request: Request) => Answer;
export type Route = { method: string; pattern: RegExp; handler: Handler; open?: boolean };

const answer = (status: number, json: unknown = {}): Answer => ({ status, json });
const text = (value: unknown) => (typeof value === "string" ? value : "");
const newId = (length: number) => encodeBytes(randomBytes(length));

const LOGIN_PURPOSE = { passphrase: "login", recovery: "login-recovery" } as const;

const startSession = (store: DemoStore, accountId: string) => {
  const token = newId(32);
  store.sessions.set(token, accountId);
  return token;
};

const setup: Handler = ({ store, body }) => {
  if (store.company) return answer(409, { error: "company-exists" });
  const companyId = text(body.companyId);
  const accountId = text(body.accountId);
  store.company = { id: companyId, rootPublicKey: text(body.rootPublicKey) };
  store.accounts.set(accountId, {
    id: accountId,
    role: "owner",
    name: null,
    accountSalt: text(body.accountSalt),
    loginPublicKey: text(body.loginPublicKey),
    recoveryPublicKey: null,
    keys: undefined,
  });
  return answer(201, { accountId, companyId, token: startSession(store, accountId) });
};

const challenge: Handler = ({ store, body }) => {
  const account = store.accounts.get(text(body.accountId));
  if (!account) return answer(401, { error: "denied" });
  const challengeId = newId(16);
  const value = newId(32);
  const way = body.way === "recovery" ? "recovery" : "passphrase";
  store.challenges.set(challengeId, { accountId: account.id, way, challenge: value });
  return answer(200, { challengeId, challenge: value, accountSalt: account.accountSalt });
};

const signedBy = (account: DemoAccount, way: "passphrase" | "recovery", signature: unknown) => {
  const key = way === "recovery" ? account.recoveryPublicKey : account.loginPublicKey;
  const parsed = bytes(65).safeParse(signature);
  return { key, signature: parsed.success ? parsed.data : undefined };
};

const verifyChallenge: Handler = ({ store, body }) => {
  const id = text(body.challengeId);
  const pending = store.challenges.get(id);
  store.challenges.delete(id);
  const account = pending && store.accounts.get(pending.accountId);
  if (!pending || !account) return answer(401, { error: "unknown-challenge" });
  const { key, signature } = signedBy(account, pending.way, body.signature);
  const signed =
    key !== null &&
    signature !== undefined &&
    verify(
      bytes(32).parse(key),
      signature,
      LOGIN_PURPOSE[pending.way],
      account.id,
      bytes(32).parse(pending.challenge),
    );
  if (!signed) return answer(401, { error: "denied" });
  return answer(200, { token: startSession(store, account.id) });
};

const putKeys: Handler = ({ store, caller, body }) => {
  const account = caller ? store.accounts.get(caller) : undefined;
  if (!account) return answer(401);
  if (account.keys) return answer(409, { error: "keys-exist" });
  const unlock = body.unlock as { passphrase?: unknown; recovery?: unknown } | undefined;
  account.recoveryPublicKey = text(body.recoveryLoginPublicKey);
  account.keys = {
    xwingPublicKey: text(body.xwingPublicKey),
    edPublicKey: text(body.edPublicKey),
    keyBlock: text(body.keyBlock),
    unlock: { passphrase: text(unlock?.passphrase), recovery: text(unlock?.recovery) },
    state: text(body.state),
    stateCounter: Number(body.stateCounter ?? 0),
    certificate: (body.certificate as Record<string, unknown> | undefined) ?? null,
  };
  return answer(201);
};

const getKeys: Handler = ({ store, caller }) => {
  const account = caller ? store.accounts.get(caller) : undefined;
  if (!account?.keys) return answer(404, { error: "not-found" });
  const { keyBlock, state, stateCounter, unlock } = account.keys;
  return answer(200, {
    accountId: account.id,
    accountSalt: account.accountSalt,
    keyBlock,
    state,
    stateCounter,
    unlock,
  });
};

const putState: Handler = ({ store, caller, body }) => {
  const keys = caller ? store.accounts.get(caller)?.keys : undefined;
  if (!keys) return answer(404, { error: "not-found" });
  if (body.stateCounter !== keys.stateCounter + 1)
    return answer(409, { error: "stale", stateCounter: keys.stateCounter });
  keys.state = text(body.state);
  keys.stateCounter += 1;
  return answer(200);
};

const company: Handler = ({ store }) =>
  store.company
    ? answer(200, { ...store.company, policy: null, recoveryPublicKey: null, rootChanges: [] })
    : answer(404, { error: "not-found" });

const members: Handler = ({ store }) =>
  answer(200, {
    members: [...store.accounts.values()].map((account) => ({
      id: account.id,
      role: account.role,
      name: account.name,
      xwingPublicKey: account.keys?.xwingPublicKey ?? null,
      edPublicKey: account.keys?.edPublicKey ?? null,
      certificate: account.keys?.certificate ?? null,
      invitation: null,
      leftAt: null,
      previous: [],
      oidc: false,
    })),
  });

/** A vault of the company the caller is a member of now; undefined for anyone else */
const vaultFor = (store: DemoStore, caller: string | undefined, vaultId: string | undefined) => {
  const vault = vaultId ? store.vaults.get(vaultId) : undefined;
  return vault && caller && membersOfLog(vault.log).has(caller) ? vault : undefined;
};

const newVault: Handler = ({ store, body }) => {
  const id = text(body.id);
  if (store.vaults.has(id)) return answer(409, { error: "exists" });
  store.vaults.set(id, {
    id,
    log: [],
    keys: new Map(),
    name: null,
    nameEpoch: null,
    records: new Map(),
  });
  return answer(201);
};

const listVaults: Handler = ({ store, caller }) =>
  answer(200, {
    vaults: [...store.vaults.values()]
      .filter((vault) => caller && membersOfLog(vault.log).has(caller))
      .map((vault) => ({ id: vault.id, name: vault.name, nameEpoch: vault.nameEpoch })),
  });

const vaultLog: Handler = ({ store, caller, params }) => {
  const vault = vaultFor(store, caller, params[0]);
  return vault ? answer(200, { entries: vault.log }) : answer(404, { error: "not-found" });
};

const vaultKeys: Handler = ({ store, caller, params }) => {
  const vault = vaultFor(store, caller, params[0]);
  if (!vault || !caller) return answer(404, { error: "not-found" });
  const mine = vault.keys.get(caller) ?? new Map<number, string>();
  return answer(200, { keys: [...mine].map(([epoch, wrapped]) => ({ epoch, wrapped })) });
};

const keepKey = (vault: { keys: Map<string, Map<number, string>> }, account: string) => {
  const kept = vault.keys.get(account) ?? new Map<number, string>();
  vault.keys.set(account, kept);
  return kept;
};

/** The next link only; the genesis by anyone, every later entry by a member (log-routes.ts) */
const appendLog: Handler = ({ store, caller, params, body }) => {
  const vault = params[0] ? store.vaults.get(params[0]) : undefined;
  const entry = body.entry as WireLogEntry | undefined;
  if (!vault || !entry || !caller) return answer(404, { error: "not-found" });
  if (entry.signerId !== caller) return answer(403, { error: "forbidden" });
  if (vault.log.length > 0 && !membersOfLog(vault.log).has(caller))
    return answer(403, { error: "forbidden" });
  if (entry.seq !== vault.log.length) return answer(409, { error: "stale" });
  vault.log.push(entry);
  if (typeof body.wrappedKey === "string")
    keepKey(vault, entry.accountId).set(entry.epoch, body.wrappedKey);
  const rotated = body.wrappedKeys as { accountId: string; wrapped: string }[] | undefined;
  for (const key of rotated ?? []) keepKey(vault, key.accountId).set(entry.epoch, key.wrapped);
  return answer(201);
};

const renameVault: Handler = ({ store, caller, params, body }) => {
  const vault = vaultFor(store, caller, params[0]);
  if (!vault) return answer(404, { error: "not-found" });
  vault.name = text(body.name);
  vault.nameEpoch = Number(body.epoch ?? 0);
  return answer(200);
};

const pullRecords: Handler = ({ store, caller, params }) => {
  const vault = vaultFor(store, caller, params[0]);
  return vault ? answer(200, [...vault.records.values()]) : answer(404, { error: "not-found" });
};

/** A record only as the next version of its entry; a conflict answers with the current one */
const pushRecord: Handler = ({ store, caller, params, body }) => {
  const vault = vaultFor(store, caller, params[0]);
  if (!vault) return answer(404, { error: "not-found" });
  const entryId = text(body.entryId);
  const current = vault.records.get(entryId);
  if ((current?.version ?? 0) + 1 !== body.version)
    return answer(409, { current: current ?? null });
  vault.records.set(entryId, { ...body, version: Number(body.version) });
  return answer(200);
};

const ID = "([A-Za-z0-9_-]+)";
const routes: Route[] = [
  { method: "POST", pattern: /^\/auth\/setup$/, handler: setup, open: true },
  { method: "POST", pattern: /^\/auth\/login-key\/challenge$/, handler: challenge, open: true },
  { method: "POST", pattern: /^\/auth\/login-key\/verify$/, handler: verifyChallenge, open: true },
  { method: "PUT", pattern: /^\/api\/account\/keys$/, handler: putKeys },
  { method: "GET", pattern: /^\/api\/account\/keys$/, handler: getKeys },
  { method: "PUT", pattern: /^\/api\/account\/state$/, handler: putState },
  { method: "GET", pattern: /^\/api\/company$/, handler: company },
  { method: "GET", pattern: /^\/api\/members$/, handler: members },
  { method: "POST", pattern: /^\/api\/vaults$/, handler: newVault },
  { method: "GET", pattern: /^\/api\/vaults$/, handler: listVaults },
  { method: "GET", pattern: new RegExp(`^/api/vaults/${ID}/log$`), handler: vaultLog },
  { method: "POST", pattern: new RegExp(`^/api/vaults/${ID}/log$`), handler: appendLog },
  { method: "GET", pattern: new RegExp(`^/api/vaults/${ID}/keys$`), handler: vaultKeys },
  { method: "PUT", pattern: new RegExp(`^/api/vaults/${ID}/name$`), handler: renameVault },
  { method: "GET", pattern: new RegExp(`^/api/vaults/${ID}/records$`), handler: pullRecords },
  { method: "PUT", pattern: new RegExp(`^/api/vaults/${ID}/records$`), handler: pushRecord },
  ...teamRoutes,
];

/**
 * The answer of the stand-in. A write the demo does not offer answers 501 "demo-unavailable", so
 * the demo can say so instead of failing silently (demo-fetch.ts)
 */
export const route = (
  store: DemoStore,
  method: string,
  path: string,
  body: Record<string, unknown>,
  token: string | undefined,
): Answer => {
  const caller = token ? store.sessions.get(token) : undefined;
  for (const { method: m, pattern, handler, open } of routes) {
    const match = m === method ? pattern.exec(path) : null;
    if (!match) continue;
    if (!open && !caller) return answer(401, { error: "unauthorized" });
    return handler({ store, params: match.slice(1), body, caller });
  }
  // A read stays "not-found" as on a real server: some clients take that for "none yet"
  return method === "GET"
    ? answer(404, { error: "not-found" })
    : answer(501, { error: "demo-unavailable" });
};
