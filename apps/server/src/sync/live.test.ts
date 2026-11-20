// K-204 "Fertig, wenn": two clients see each other's changes live over a real port, and the
// database holds nothing of the entries but ciphertexts (the test reads every table)
import { afterAll, describe, expect, it } from "bun:test";
import {
  type Connection,
  type Device,
  edit,
  emptyDevice,
  httpServer,
  type LiveEvent,
  pull,
  sync,
  watchVault,
} from "@kennwort/core";
import { anna, bank, contextFor, id, jonas, withField } from "@kennwort/core/testing";
import { sql } from "drizzle-orm";
import { syncSetup } from "../testing/sync-setup.ts";

const setup = syncSetup();
const server = Bun.serve({ port: 0, fetch: setup.app.fetch });
afterAll(() => server.stop(true));
const connect = (token: string): Connection => ({
  fetch,
  baseUrl: `http://localhost:${server.port}`,
  token,
});
const ring = contextFor(jonas).ring;

/** Listens like a client: resolves the next event that matches */
const listen = (token: string, signal: AbortSignal) => {
  const waiting: { match: (event: LiveEvent) => boolean; resolve: () => void }[] = [];
  void watchVault(
    connect(token),
    ring.vaultId,
    (event) => {
      for (const w of waiting.filter((w) => w.match(event))) {
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve();
      }
    },
    signal,
  );
  return (match: (event: LiveEvent) => boolean) =>
    new Promise<void>((resolve) => waiting.push({ match, resolve }));
};

const contents = (device: Device) => [...device.known.values()].map((known) => known.content);

describe("live sync between two clients", () => {
  const stop = new AbortController();
  afterAll(() => stop.abort());

  it("shows Jonas's new entry to Anna and Anna's change to Jonas, as they happen", async () => {
    expect(await setup.openBuero()).toBe(201);
    const jonasHears = listen("t-jonas", stop.signal);
    const annaHears = listen("t-anna", stop.signal);
    await Promise.all([
      jonasHears((e) => e.type === "ready"),
      annaHears((e) => e.type === "ready"),
    ]);

    const entryId = id(0xe1);
    const forAnna = annaHears((e) => e.type === "change" && e.version === 1);
    let phone = (
      await sync(
        edit(emptyDevice(), entryId, bank),
        httpServer(connect("t-jonas"), ring.vaultId),
        contextFor(jonas),
      )
    ).device;
    await forAnna;
    let laptop = await pull(
      emptyDevice(),
      httpServer(connect("t-anna"), ring.vaultId),
      contextFor(anna),
    );
    expect(laptop.refused).toEqual([]);
    expect(contents(laptop.device)).toEqual([bank]);

    const changed = withField(bank, "password", "Neu-2027!");
    const forJonas = jonasHears((e) => e.type === "change" && e.version === 2);
    laptop = await sync(
      edit(laptop.device, entryId, changed),
      httpServer(connect("t-anna"), ring.vaultId),
      contextFor(anna),
    );
    await forJonas;
    phone = (await pull(phone, httpServer(connect("t-jonas"), ring.vaultId), contextFor(jonas)))
      .device;
    expect(contents(phone)).toEqual([changed]);
  });

  it("keeps nothing readable: no title, user name, password, URL or tag, and no vault key", () => {
    const tables = setup.db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table'`,
    );
    const stored = tables.flatMap(({ name }) =>
      setup.db
        .all<Record<string, unknown>>(sql.raw(`select * from "${name}"`))
        .flatMap((row) => Object.values(row)),
    );
    expect(stored.some((value) => value instanceof Uint8Array)).toBe(true);
    const asBytes = (value: unknown) =>
      value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
    const haystack = stored.map(asBytes);
    const secrets = [
      "Sparkasse",
      "weber-haustechnik",
      "Weber-2026!",
      "Neu-2027!",
      "sparkasse.test",
      "Bank",
    ];
    for (const secret of secrets) {
      const needle = new TextEncoder().encode(secret);
      expect(haystack.filter((hay) => Buffer.from(hay).includes(needle)).length).toBe(0);
    }
    expect(
      haystack.filter((hay) => Buffer.from(hay).includes(Buffer.from(ring.vaultKey))).length,
    ).toBe(0);
  });
});
