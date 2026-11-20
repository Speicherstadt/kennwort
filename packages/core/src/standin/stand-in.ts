/**
 * The server stand-in (K-207): the sync API of apps/server as a fetch that keeps everything in
 * memory, so client code runs without a server, in tests and later in the demo (K-706). A
 * contract suite (sync/test/contract.ts) runs against both, so the stand-in cannot drift from
 * the real server. Like the server it checks only what it can without keys; for the vaults' logs it
 * runs the client's own check (verifyLog) with the company it is given, as the server does.
 */
import { z } from "zod";
import type { Certificate } from "../membership/certificate.ts";
import { entryHash, GENESIS_HASH, type LogEntry } from "../membership/log-entry.ts";
import { type LogError, verifyLog } from "../membership/verify-log.ts";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { EntryRecord, parseJson, recordToWire } from "../sync/record.ts";
import { LogEntryWire } from "../sync/wire.ts";

export type StandInSession = { accountId: string; companyId: string };
/** The company the stand-in serves: its root and certificates for the logs, and its clock (ms) */
export type StandInCompany = {
  rootPublicKey: Uint8Array;
  certificates: ReadonlyMap<string, Certificate>;
  now: () => number;
};
type Change = { entryId: string; version: number };
type Vault = {
  companyId: string;
  /** Only who created the vault writes the genesis of its log, as on the server */
  createdBy: string;
  entries: Map<string, EntryRecord[]>;
  listeners: Set<(change: Change) => void>;
  log: LogEntry[];
};

/** A request body as the schema reads it; a body that is no JSON fails like a wrong one */
const parsedBody = <T extends z.ZodType>(schema: T, body: string) =>
  z.object({ ok: z.literal(true), value: schema }).safeParse(parseJson(body));
/** As the server's body limit on records (apps/server/src/sync/routes.ts) */
const MAX_RECORD_BYTES = 1024 * 1024;
const VaultRequest = z.object({ id: bytes(16) });
const Append = z.object({ entry: LogEntryWire, wrappedKey: bytes(1194).optional() });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ error: "not-found" }, 404);

/** The role of a current member by the vault's log, as the server reads its stored entries */
const roleOf = (vault: Vault, accountId: string, now: number) => {
  let member: { role: string; validUntil: number } | undefined;
  for (const e of vault.log)
    if (encodeBytes(e.accountId) !== accountId) continue;
    else if (e.action === "remove") member = undefined;
    else member = { role: e.role, validUntil: e.validUntil };
  if (!member) return undefined;
  return member.validUntil === 0 || member.validUntil * 1000 > now ? member.role : undefined;
};

const newest = (vault: Vault) =>
  [...vault.entries.keys()]
    .sort()
    .map((entryId) =>
      recordToWire((vault.entries.get(entryId) as EntryRecord[]).at(-1) as EntryRecord),
    );

/**
 * The live stream (SSE): "ready", then "record" for every new version, until either side stops or
 * the listener is no member any more, which it checks before every change (as the server does)
 */
const events = (vault: Vault, signal: AbortSignal | null | undefined, isMember: () => boolean) => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const send = (event: string, data: string) =>
    controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`));
  const stop = () => {
    vault.listeners.delete(listener);
  };
  const listener = (change: Change) => {
    if (isMember()) return send("record", JSON.stringify(change));
    stop();
    controller.close();
  };
  const source: UnderlyingDefaultSource<Uint8Array> = {
    start: (started) => {
      controller = started;
      vault.listeners.add(listener);
      send("ready", "");
    },
    cancel: stop,
  };
  const stream = new ReadableStream(source);
  signal?.addEventListener("abort", () => {
    stop();
    controller.error(signal.reason);
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
};

/**
 * The next link of the chain, as the server takes it: well formed for this vault, signed as the
 * session, the next number on the last hash, after the genesis only from a current manager, no key
 * rotation before K-307, and accepted by verifyLog under the company's root and certificates
 */
const appendLog = (
  company: StandInCompany,
  session: StandInSession,
  vaultId: string,
  vault: Vault,
  body: string,
) => {
  const parsed = parsedBody(Append, body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { entry, wrappedKey } = parsed.data.value;
  const takesKey = entry.action === "create" || entry.action === "add";
  const wellFormed =
    takesKey === (wrappedKey !== undefined) && encodeBytes(entry.vaultId) === vaultId;
  if (!wellFormed) return json({ error: "invalid" }, 400);
  if (encodeBytes(entry.signerId) !== session.accountId) return json({ error: "forbidden" }, 403);
  const last = vault.log.at(-1);
  const prev = encodeBytes(last ? entryHash(last) : GENESIS_HASH);
  if (entry.seq !== vault.log.length || encodeBytes(entry.prevHash) !== prev)
    return json({ error: "stale", seq: vault.log.length }, 409);
  // The key rotation comes with K-307; refused where the server refuses it, after the stale check
  if (entry.action === "rotate") return json({ error: "invalid" }, 400);
  const now = company.now();
  const allowed = last
    ? roleOf(vault, session.accountId, now) === "manage"
    : vault.createdBy === session.accountId;
  if (!allowed) return json({ error: "forbidden" }, 403);
  const trust = {
    ...company,
    certificates: new Map(company.certificates),
    now: Math.floor(now / 1000),
  };
  const checked = verifyLog(entry.vaultId, [...vault.log, entry], trust);
  if (!checked.ok) return refused(checked.error);
  vault.log.push(entry);
  return json({ seq: entry.seq }, 201);
};

/** As the server answers what verifyLog refuses: a signer without rights is forbidden */
const refused = (error: LogError) =>
  error === "not-manager" || error === "uncertified-signer"
    ? json({ error: "forbidden" }, 403)
    : json({ error: "invalid" }, 400);

const pushRecord = (
  company: StandInCompany,
  session: StandInSession,
  vaultId: string,
  vault: Vault,
  body: string,
) => {
  const role = roleOf(vault, session.accountId, company.now());
  if (role !== "edit" && role !== "manage") return json({ error: "forbidden" }, 403);
  const parsed = parsedBody(EntryRecord, body);
  if (!parsed.success || encodeBytes(parsed.data.value.vaultId) !== vaultId)
    return json({ error: "invalid" }, 400);
  const record = parsed.data.value;
  if (encodeBytes(record.author) !== session.accountId) return json({ error: "forbidden" }, 403);
  const entryId = encodeBytes(record.entryId);
  const versions = vault.entries.get(entryId) ?? [];
  const current = versions.at(-1);
  if ((current?.version ?? 0) + 1 !== record.version)
    return json({ current: current ? recordToWire(current) : null }, 409);
  vault.entries.set(entryId, [...versions, record]);
  for (const listener of vault.listeners) listener({ entryId, version: record.version });
  return json({ stored: true });
};

export const standIn = (
  sessions: Readonly<Record<string, StandInSession>>,
  company: StandInCompany,
) => {
  const vaults = new Map<string, Vault>();

  const createVault = (session: StandInSession, body: string) => {
    const parsed = parsedBody(VaultRequest, body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    const id = encodeBytes(parsed.data.value.id);
    if (vaults.has(id)) return json({ error: "taken" }, 409);
    vaults.set(id, {
      companyId: session.companyId,
      createdBy: session.accountId,
      entries: new Map(),
      listeners: new Set(),
      log: [],
    });
    return json({ id }, 201);
  };

  const inVault = (
    session: StandInSession,
    method: string,
    path: string,
    body: string,
    signal: AbortSignal | null | undefined,
  ) => {
    const match = path.match(/^\/api\/vaults\/([^/]+)(\/.+)/);
    if (!match) return notFound();
    const [, vaultId, rest] = match as unknown as [string, string, string];
    // The server's body limit is middleware: it answers before any vault is looked up
    const tooLarge =
      method === "PUT" &&
      rest === "/records" &&
      new TextEncoder().encode(body).length > MAX_RECORD_BYTES;
    if (tooLarge) return json({ error: "too-large" }, 413);
    const vault = vaults.get(vaultId);
    if (vault?.companyId !== session.companyId) return notFound();
    if (`${method} ${rest}` === "POST /log")
      return appendLog(company, session, vaultId, vault, body);
    // Records and changes only for the vault's current members (K-305)
    const isMember = () => roleOf(vault, session.accountId, company.now()) !== undefined;
    if (!isMember()) return notFound();
    const versions = rest.match(/^\/entries\/([^/]+)\/versions$/);
    const call = `${method} ${versions ? "/versions" : rest}`;
    if (call === "GET /records") return json(newest(vault));
    if (call === "GET /versions")
      return json((vault.entries.get(versions?.[1] as string) ?? []).map(recordToWire));
    if (call === "PUT /records") return pushRecord(company, session, vaultId, vault, body);
    if (call === "GET /events") return events(vault, signal, isMember);
    return notFound();
  };

  /** Called the way the client calls fetch: a URL and the request's options */
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    // Like fetch: an aborted signal rejects at once, methods are upper case, any body type reads
    // as text (review of K-207)
    init.signal?.throwIfAborted();
    const method = (init.method ?? "GET").toUpperCase();
    if ((method === "GET" || method === "HEAD") && init.body != null)
      throw new TypeError("Request with GET/HEAD method cannot have body"); // i18n-ignore: as fetch says it
    const url = new URL(input);
    const token = new Headers(init.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    // Own sessions only: "constructor" and the like are keys of every object, not tokens
    const session = Object.hasOwn(sessions, token) ? sessions[token] : undefined;
    if (!session) return json({ error: "unauthenticated" }, 401);
    const body = init.body == null ? "" : await new Response(init.body).text();
    if (`${method} ${url.pathname}` === "POST /api/vaults") return createVault(session, body);
    return inVault(session, method, url.pathname, body, init.signal);
  }) as typeof globalThis.fetch;

  return { fetch, listening: (vaultId: string) => vaults.get(vaultId)?.listeners.size ?? 0 };
};
