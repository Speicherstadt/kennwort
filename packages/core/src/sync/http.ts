/**
 * The sync over HTTP (K-204): the SyncServer a device talks to, and the live stream that says when
 * to pull. Every answer is parsed against the schemas before the device checks signatures; a
 * record that does not parse is left out, and if the device knew it, pull reports it as missing.
 */
import { z } from "zod";
import { bytes, encodeBytes } from "./bytes.ts";
import type { SyncServer } from "./memory-server.ts";
import { EntryRecord, parseJson, recordToWire } from "./record.ts";
import { parseSse } from "./sse.ts";

export type Connection = { fetch: typeof fetch; baseUrl: string; token: string };

const Conflict = z.object({ current: z.unknown() });
const Change = z.object({ entryId: bytes(16), version: z.number().int().positive() });
const ParsedChange = z.object({ ok: z.literal(true), value: Change });
export type LiveEvent = { type: "ready" } | ({ type: "change" } & z.infer<typeof Change>);

const vaultUrl = (connection: Connection, vaultId: Uint8Array) =>
  `${connection.baseUrl}/api/vaults/${encodeBytes(vaultId)}`;
const authorization = (connection: Connection) => ({
  authorization: `Bearer ${connection.token}`,
});

/** Network failures and unexpected statuses reject: the device's state stays as it was */
const unexpected = (what: string, status: number) => new Error(`${what}: ${status}`); // i18n-ignore

const parsedRecords = (body: unknown) =>
  Array.isArray(body)
    ? body.flatMap((item) => {
        const record = EntryRecord.safeParse(item);
        return record.success ? [record.data] : [];
      })
    : [];

export const httpServer = (connection: Connection, vaultId: Uint8Array): SyncServer => ({
  pull: async () => {
    const response = await connection.fetch(`${vaultUrl(connection, vaultId)}/records`, {
      headers: authorization(connection),
    });
    if (!response.ok) throw unexpected("pull", response.status);
    return parsedRecords(await response.json().catch(() => undefined));
  },
  push: async (record) => {
    const response = await connection.fetch(`${vaultUrl(connection, vaultId)}/records`, {
      method: "PUT",
      headers: { ...authorization(connection), "content-type": "application/json" },
      body: JSON.stringify(recordToWire(record)),
    });
    if (response.ok) return { ok: true };
    if (response.status !== 409) throw unexpected("push", response.status);
    const conflict = Conflict.safeParse(await response.json().catch(() => undefined));
    const current = EntryRecord.safeParse(conflict.success ? conflict.data.current : undefined);
    return { ok: false, current: current.success ? current.data : undefined };
  },
});

const toLiveEvent = (event: string, data: string): LiveEvent | undefined => {
  if (event === "ready") return { type: "ready" };
  if (event !== "record") return undefined;
  // Broken JSON in an event gets the event ignored, not the stream broken
  const change = ParsedChange.safeParse(parseJson(data));
  return change.success ? { type: "change", ...change.data.value } : undefined;
};

/**
 * Listens to a vault until the signal aborts or the server ends the stream. A change only says
 * that something is new; the device pulls and checks the record as always (P-09).
 */
export const watchVault = async (
  connection: Connection,
  vaultId: Uint8Array,
  onEvent: (event: LiveEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  // Stopping counts as ending quietly whenever it happens, before or after the stream opened
  try {
    const response = await connection.fetch(`${vaultUrl(connection, vaultId)}/events`, {
      headers: { ...authorization(connection), accept: "text/event-stream" },
      signal: signal ?? null,
    });
    if (!response.ok || !response.body) throw unexpected("watch", response.status);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      const parsed = parseSse(rest + value);
      rest = parsed.rest;
      for (const { event, data } of parsed.events) {
        const live = toLiveEvent(event, data);
        if (live) onEvent(live);
      }
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  }
};
