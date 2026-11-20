/**
 * The server stand-in (K-207): the sync API of apps/server as a fetch that keeps everything in
 * memory, so client code runs without a server, in tests and later in the demo (K-706). A
 * contract suite (sync/test/contract.ts) runs against both, so the stand-in cannot drift from
 * the real server. Like the server it checks only what it can without keys.
 */
import { z } from "zod";
import { bytes, encodeBytes } from "../sync/bytes.ts";
import { EntryRecord, parseJson, recordToWire } from "../sync/record.ts";

export type StandInSession = { accountId: string; companyId: string };
type Change = { entryId: string; version: number };
type Vault = {
  companyId: string;
  entries: Map<string, EntryRecord[]>;
  listeners: Set<(change: Change) => void>;
};

/** A request body as the schema reads it; a body that is no JSON fails like a wrong one */
const parsedBody = <T extends z.ZodType>(schema: T, body: string) =>
  z.object({ ok: z.literal(true), value: schema }).safeParse(parseJson(body));
/** As the server's body limit on records (apps/server/src/sync/routes.ts) */
const MAX_RECORD_BYTES = 1024 * 1024;
const VaultRequest = z.object({ id: bytes(16) });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ error: "not-found" }, 404);

const newest = (vault: Vault) =>
  [...vault.entries.keys()]
    .sort()
    .map((entryId) =>
      recordToWire((vault.entries.get(entryId) as EntryRecord[]).at(-1) as EntryRecord),
    );

/** The live stream (SSE): "ready", then "record" for every new version, until either side stops */
const events = (vault: Vault, signal: AbortSignal | null | undefined) => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const send = (event: string, data: string) =>
    controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`));
  const listener = (change: Change) => send("record", JSON.stringify(change));
  const stop = () => {
    vault.listeners.delete(listener);
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

export const standIn = (sessions: Readonly<Record<string, StandInSession>>) => {
  const vaults = new Map<string, Vault>();

  const createVault = (session: StandInSession, body: string) => {
    const parsed = parsedBody(VaultRequest, body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    const id = encodeBytes(parsed.data.value.id);
    if (vaults.has(id)) return json({ error: "taken" }, 409);
    vaults.set(id, { companyId: session.companyId, entries: new Map(), listeners: new Set() });
    return json({ id }, 201);
  };

  const pushRecord = (session: StandInSession, vaultId: string, vault: Vault, body: string) => {
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
    const versions = rest.match(/^\/entries\/([^/]+)\/versions$/);
    const call = `${method} ${versions ? "/versions" : rest}`;
    if (call === "GET /records") return json(newest(vault));
    if (call === "GET /versions")
      return json((vault.entries.get(versions?.[1] as string) ?? []).map(recordToWire));
    if (call === "PUT /records") return pushRecord(session, vaultId, vault, body);
    if (call === "GET /events") return events(vault, signal);
    return notFound();
  };

  /** Called the way the client calls fetch: a URL and the request's options */
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    // Like fetch: an aborted signal rejects at once, methods are upper case, any body type reads
    // as text (review of K-207)
    init.signal?.throwIfAborted();
    const url = new URL(input);
    const token = new Headers(init.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    // Own sessions only: "constructor" and the like are keys of every object, not tokens
    const session = Object.hasOwn(sessions, token) ? sessions[token] : undefined;
    if (!session) return json({ error: "unauthenticated" }, 401);
    const method = (init.method ?? "GET").toUpperCase();
    if ((method === "GET" || method === "HEAD") && init.body != null)
      throw new TypeError("Request with GET/HEAD method cannot have body"); // i18n-ignore: as fetch says it
    const body = init.body == null ? "" : await new Response(init.body).text();
    if (`${method} ${url.pathname}` === "POST /api/vaults") return createVault(session, body);
    return inVault(session, method, url.pathname, body, init.signal);
  }) as typeof globalThis.fetch;

  return { fetch, listening: (vaultId: string) => vaults.get(vaultId)?.listeners.size ?? 0 };
};
