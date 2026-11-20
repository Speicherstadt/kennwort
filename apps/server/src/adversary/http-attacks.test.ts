// K-206 on the wire: the real server behind a fetch that lies, and the client code that talks to it.
// The attacks that concern the sync run here end to end; the full catalog is in packages/core.
import { afterAll, describe, expect, it } from "bun:test";
import {
  type Connection,
  edit,
  emptyDevice,
  encodeBytes,
  httpServer,
  pull,
  type Refused,
  sync,
} from "@kennwort/core";
import { lyingFetch, type Rewrite } from "@kennwort/core/adversary";
import { anna, bank, contextFor, id, jonas, withField } from "@kennwort/core/testing";
import { syncSetup, vaultId } from "../testing/sync-setup.ts";

const setup = syncSetup();
const server = Bun.serve({ port: 0, fetch: setup.app.fetch });
afterAll(() => server.stop(true));
const base = `http://localhost:${server.port}`;
const connect = (token: string, rewrite?: Rewrite): Connection => ({
  fetch: rewrite ? lyingFetch(fetch, rewrite) : fetch,
  baseUrl: base,
  token,
});
const ring = contextFor(jonas).ring;
const errors = (refused: Refused[]) => refused.map((r) => r.error);
type Wire = Record<string, unknown>;
const onRecords =
  (change: (records: Wire[]) => Wire[]): Rewrite =>
  (url, method, body) =>
    url.endsWith("/records") && method === "GET" ? change(body as Wire[]) : body;

describe("attacks over HTTP", async () => {
  await fetch(`${base}/api/vaults`, {
    method: "POST",
    headers: { authorization: "Bearer t-jonas", "content-type": "application/json" },
    body: JSON.stringify({ id: vaultId }),
  });
  let device = edit(emptyDevice(), id(0xe1), bank);
  device = edit(device, id(0xe2), withField(bank, "password", "Zweites-2026!"));
  await sync(device, httpServer(connect("t-jonas"), ring.vaultId), contextFor(jonas));
  const honestLaptop = (
    await pull(emptyDevice(), httpServer(connect("t-anna"), ring.vaultId), contextFor(anna))
  ).device;

  it("E-12: contents swapped between two entries are refused", async () => {
    const swap = onRecords(([a, b]) => [
      { ...a, content: b?.content },
      { ...b, content: a?.content },
    ]);
    const { refused } = await pull(
      emptyDevice(),
      httpServer(connect("t-anna", swap), ring.vaultId),
      contextFor(anna),
    );
    expect(errors(refused)).toEqual(["bad-signature", "bad-signature"]);
  });

  it("E-13: an old version served as the newest is a rollback", async () => {
    await sync(
      edit(honestLaptop, id(0xe1), withField(bank, "password", "Neu-2027!")),
      httpServer(connect("t-anna"), ring.vaultId),
      contextFor(anna),
    );
    const laptop = (
      await pull(honestLaptop, httpServer(connect("t-anna"), ring.vaultId), contextFor(anna))
    ).device;
    const versions = (await (
      await fetch(`${base}/api/vaults/${vaultId}/entries/${encodeBytes(id(0xe1))}/versions`, {
        headers: { authorization: "Bearer t-anna" },
      })
    ).json()) as Wire[];
    const replay = onRecords((records) =>
      records.map((r) => (r.entryId === versions[0]?.entryId ? (versions[0] as Wire) : r)),
    );
    const { refused } = await pull(
      laptop,
      httpServer(connect("t-anna", replay), ring.vaultId),
      contextFor(anna),
    );
    expect(errors(refused)).toEqual(["rollback"]);
  });

  it("E-15: an entry the device knew and the server hides is reported", async () => {
    const hide = onRecords((records) => records.slice(1));
    const { refused } = await pull(
      honestLaptop,
      httpServer(connect("t-anna", hide), ring.vaultId),
      contextFor(anna),
    );
    expect(errors(refused)).toEqual(["missing"]);
  });
});
