import { describe, expect, it } from "vitest";
import { encodeBytes } from "./bytes.ts";
import { edit, emptyDevice, pull, sync } from "./device.ts";
import { type Connection, httpServer, type LiveEvent, watchVault } from "./http.ts";
import { memoryServer } from "./memory-server.ts";
import { EntryRecord, recordToWire, sealRecord } from "./record.ts";
import { anna, bank, contextFor, id, jonas } from "./test/fixtures.ts";

const vaultId = contextFor(jonas).ring.vaultId;
const base = "https://kennwort.weber-haustechnik.test";
const recordsUrl = `${base}/api/vaults/${encodeBytes(vaultId)}/records`;
type Seen = { url: string; init: RequestInit | undefined };

/** A fetch that answers like apps/server, backed by the memory stand-in */
const fakeServer = () => {
  const memory = memoryServer();
  const seen: Seen[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    if (url !== recordsUrl) return new Response("{}", { status: 404 });
    if (init?.method !== "PUT") return Response.json(memory.pull().map(recordToWire));
    const result = memory.push(EntryRecord.parse(JSON.parse(String(init.body))));
    return result.ok
      ? Response.json({ stored: true })
      : Response.json(
          { current: result.current ? recordToWire(result.current) : null },
          { status: 409 },
        );
  }) as typeof globalThis.fetch;
  return { memory, seen, connection: { fetch, baseUrl: base, token: "t-jonas" } };
};

const answering = (response: () => Response): Connection => ({
  fetch: (async () => response()) as unknown as typeof fetch,
  baseUrl: base,
  token: "t",
});

const record = () =>
  sealRecord(contextFor(jonas).author, contextFor(jonas).ring, id(0xe1), 1, bank, new Uint8Array());

describe("httpServer", () => {
  it("lets two devices sync through it", async () => {
    const { connection, seen } = fakeServer();
    const server = httpServer(connection, vaultId);
    await sync(edit(emptyDevice(), id(0xe1), bank), server, contextFor(jonas));
    const laptop = await pull(
      emptyDevice(),
      httpServer({ ...connection, token: "t-anna" }, vaultId),
      contextFor(anna),
    );
    expect(laptop.refused).toEqual([]);
    expect([...laptop.device.known.values()].map((known) => known.content)).toEqual([bank]);
    expect(
      seen.map((s) => [
        s.init?.method ?? "GET",
        (s.init?.headers as Record<string, string> | undefined)?.authorization,
      ]),
    ).toEqual([
      ["GET", "Bearer t-jonas"],
      ["PUT", "Bearer t-jonas"],
      ["GET", "Bearer t-anna"],
    ]);
    expect((seen[1]?.init?.headers as Record<string, string> | undefined)?.["content-type"]).toBe(
      "application/json",
    );
  });

  it("answers a conflict with the current record, and without one where the server sent none", async () => {
    const { connection, memory } = fakeServer();
    memory.push(record());
    const conflict = await httpServer(connection, vaultId).push(record());
    expect(conflict).toEqual({ ok: false, current: memory.pull()[0] });
    for (const body of ['{"current":null}', '{"current":{"version":1}}', "not json"])
      expect(
        await httpServer(
          answering(() => new Response(body, { status: 409 })),
          vaultId,
        ).push(record()),
      ).toEqual({
        ok: false,
        current: undefined,
      });
  });

  it("leaves out records that do not parse and reads anything but a list as none", async () => {
    const good = recordToWire(record());
    const list = [good, { ...good, version: 0 }, "junk"];
    expect(
      await httpServer(
        answering(() => Response.json(list)),
        vaultId,
      ).pull(),
    ).toEqual([record()].map(() => EntryRecord.parse(good)));
    expect(
      await httpServer(
        answering(() => Response.json({ records: list })),
        vaultId,
      ).pull(),
    ).toEqual([]);
    expect(
      await httpServer(
        answering(() => new Response("[")),
        vaultId,
      ).pull(),
    ).toEqual([]);
  });

  it("rejects on any other status, so the device keeps its state", async () => {
    const failing = httpServer(
      answering(() => new Response("", { status: 503 })),
      vaultId,
    );
    await expect(failing.pull()).rejects.toEqual(new Error("pull: 503"));
    await expect(failing.push(record())).rejects.toEqual(new Error("push: 503"));
  });
});

const stream = (chunks: string[], fail?: Error) =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      if (fail) controller.error(fail);
      else controller.close();
    },
  });

const watching = async (
  body: ReadableStream<Uint8Array> | null,
  status = 200,
  signal?: AbortSignal,
) => {
  const events: LiveEvent[] = [];
  let request: Seen | undefined;
  const connection: Connection = {
    fetch: (async (url: string, init?: RequestInit) => {
      request = { url, init };
      return new Response(body, { status });
    }) as unknown as typeof fetch,
    baseUrl: base,
    token: "t-anna",
  };
  await watchVault(connection, vaultId, (event) => events.push(event), signal);
  return { events, request };
};

describe("watchVault", () => {
  it("reports ready and each change, across chunk borders; ignores pings and what does not parse", async () => {
    const entryId = encodeBytes(id(0xe1));
    const { events, request } = await watching(
      stream([
        "event: ready\ndata:\n\n: comment\n\nevent: ping\ndata:\n\nevent: rec",
        `ord\ndata: {"entryId":"${entryId}","version":2}\n\n`,
        'event: record\ndata: {"entryId":"short","version":2}\n\nevent: record\ndata: {oops\n\n',
        "event: record\ndata:\n\ndata: plain message\n\n",
        `event: other\ndata: {"entryId":"${entryId}","version":3}\n\n`,
      ]),
    );
    expect(events).toEqual([{ type: "ready" }, { type: "change", entryId: id(0xe1), version: 2 }]);
    expect(request?.url).toBe(`${base}/api/vaults/${encodeBytes(vaultId)}/events`);
    expect(request?.init?.headers).toEqual({
      authorization: "Bearer t-anna",
      accept: "text/event-stream",
    });
    expect(request?.init?.signal).toBeNull();
  });

  it("rejects a refused stream or one without a body", async () => {
    await expect(watching(stream([]), 404)).rejects.toEqual(new Error("watch: 404"));
    await expect(watching(null)).rejects.toEqual(new Error("watch: 200"));
  });

  it("ends quietly when the caller aborts, and rejects when the connection breaks", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = await watching(
      stream(["event: ready\ndata:\n\n"], new Error("reset")),
      200,
      controller.signal,
    );
    expect(aborted.request?.init?.signal).toBe(controller.signal);
    await expect(watching(stream([], new Error("reset")))).rejects.toThrow("reset");
  });
});
