/**
 * What client code may rely on from a sync server, as tests (K-207). The same suite runs against
 * apps/server and the stand-in; a difference between the two fails one of them.
 * Sessions: t-jonas, t-anna, t-max (Weber Haustechnik), t-petra (Müller Elektro).
 */
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../bytes.ts";
import { edit, emptyDevice, pull, sync } from "../device.ts";
import { type Connection, httpServer, type LiveEvent, watchVault } from "../http.ts";
import { EntryRecord, recordToWire, sealRecord } from "../record.ts";
import { openBuero, postLogEntry } from "./buero.ts";
import { wireContract } from "./contract-wire.ts";
import { anna, bank, contextFor, id, jonas, max as maxP, withField } from "./fixtures.ts";
import {
  addAfterAForeignState,
  addAsItShouldBe,
  addFromTheFuture,
  addWithOtherCommitment,
  addWithoutRole,
  genesisAsReader,
  genesisOfAnotherVault,
  rotationNotYet,
  rotationOnAStalePlace,
  rotationSignedAsAnother,
} from "./log-contract.ts";
import {
  nonMemberCannotJoinHimself,
  noOneTakesANewVault,
  removedMemberHearsNothing,
} from "./members-contract.ts";

export type Target = {
  connect: (token: string) => Connection;
  listening: (vaultId: string) => number;
};

const ring = contextFor(jonas).ring;
const vault = encodeBytes(ring.vaultId);

const call = (c: Connection, method: string, path: string, body?: unknown) =>
  c.fetch(`${c.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

/** Status and JSON body of an answer, so both servers must also say the same */
const answer = async (response: Response) => [response.status, await response.json()];
const notFound = [404, { error: "not-found" }];

const vaultsStayInTheirCompany = async (t: Target) => {
  const jonasC = t.connect("t-jonas");
  const petra = t.connect("t-petra");
  expect(await answer(await call(jonasC, "POST", "/api/vaults", { id: vault }))).toEqual([
    201,
    { id: vault },
  ]);
  expect(await answer(await call(jonasC, "POST", "/api/vaults", { id: vault }))).toEqual([
    409,
    { error: "taken" },
  ]);
  expect(await answer(await call(petra, "POST", "/api/vaults", { id: vault }))).toEqual([
    409,
    { error: "taken" },
  ]);
  for (const body of [{ id: "short" }, "{"])
    expect(await answer(await call(jonasC, "POST", "/api/vaults", body))).toEqual([
      400,
      { error: "invalid" },
    ]);
  for (const [method, path] of [
    ["GET", `/api/vaults/${vault}/records`],
    ["GET", `/api/vaults/${vault}/entries/x/versions`],
    ["PUT", `/api/vaults/${vault}/records`],
    ["GET", `/api/vaults/${vault}/events`],
  ] as const)
    expect(
      await answer(await call(petra, method, path, method === "PUT" ? {} : undefined)),
    ).toEqual(notFound);
  expect(
    await answer(await call(t.connect("nobody"), "GET", `/api/vaults/${vault}/records`)),
  ).toEqual([401, { error: "unauthenticated" }]);
};

const unknownRoutesAreNotFound = async (t: Target) => {
  const jonasC = t.connect("t-jonas");
  // as a member, so the routes themselves answer, not the membership check
  await openBuero(t);
  for (const [method, path] of [
    ["POST", `/api/vaults/${vault}/records`],
    ["DELETE", `/api/vaults/${vault}/records`],
    ["PUT", `/api/vaults/${vault}/entries/x/versions`],
    ["POST", `/api/vaults/${vault}/events`],
    ["GET", `/api/vaults/${vault}/records/more`],
    ["GET", `/api/vaults/${vault}/entries/x/versions/more`],
    ["GET", `/api/vaults/${vault}/xentries/x/versions`],
    ["GET", `/api/vaults/${vault}/more/entries/x/versions`],
    ["GET", `/api/vaults/${vault}`],
    ["GET", `/api/vaults/${encodeBytes(id(0xb9))}/records`],
    ["GET", `/x/api/vaults/${vault}/records`],
    // GET /api/vaults lists the vaults of the session since K-305 (log-routes); no route deletes one
    ["DELETE", "/api/vaults"],
  ] as const)
    expect([method, path, ...(await answer(await call(jonasC, method, path)))]).toEqual([
      method,
      path,
      ...notFound,
    ]);
};

const devicesSyncWithVersions = async (t: Target) => {
  await openBuero(t);
  const jonasServer = httpServer(t.connect("t-jonas"), ring.vaultId);
  const annaServer = httpServer(t.connect("t-anna"), ring.vaultId);
  let phone = (await sync(edit(emptyDevice(), id(0xe2), bank), jonasServer, contextFor(jonas)))
    .device;
  phone = (await sync(edit(phone, id(0xe1), bank), jonasServer, contextFor(jonas))).device;
  let laptop = (await pull(emptyDevice(), annaServer, contextFor(anna))).device;
  const changed = withField(bank, "password", "Neu-2027!");
  laptop = (await sync(edit(laptop, id(0xe1), changed), annaServer, contextFor(anna))).device;
  const pulled = await pull(phone, jonasServer, contextFor(jonas));
  expect(pulled.refused).toEqual([]);
  expect(pulled.device.known.get(encodeHex(id(0xe1)))?.content).toEqual(changed);
  expect((await jonasServer.pull()).map((r) => [r.entryId[0], r.version])).toEqual([
    [0xe1, 2],
    [0xe2, 1],
  ]);
  const versions = (await (
    await call(
      t.connect("t-anna"),
      "GET",
      `/api/vaults/${vault}/entries/${encodeBytes(id(0xe1))}/versions`,
    )
  ).json()) as unknown[];
  expect(versions.map((v) => EntryRecord.parse(v).version)).toEqual([1, 2]);
  const stale = sealRecord(contextFor(jonas).author, ring, id(0xe1), 2, bank, new Uint8Array());
  const conflict = await jonasServer.push(stale);
  expect(conflict.ok).toBe(false);
  expect(conflict.ok ? undefined : conflict.current?.version).toBe(2);
};

const onlyOwnSignedRecords = async (t: Target) => {
  const jonasC = t.connect("t-jonas");
  await openBuero(t);
  const byAnna = sealRecord(contextFor(anna).author, ring, id(0xe1), 1, bank, new Uint8Array());
  const put = async (body: unknown) =>
    answer(await call(jonasC, "PUT", `/api/vaults/${vault}/records`, body));
  expect(await put(recordToWire(byAnna))).toEqual([403, { error: "forbidden" }]);
  const own = recordToWire(
    sealRecord(contextFor(jonas).author, ring, id(0xe1), 1, bank, new Uint8Array()),
  );
  const elsewhere = { ...own, vaultId: encodeBytes(id(0xb1)) };
  for (const body of [elsewhere, "{", { ...own, version: 0 }])
    expect(await put(body)).toEqual([400, { error: "invalid" }]);
  expect(await answer(await call(jonasC, "GET", `/api/vaults/${vault}/records`))).toEqual([
    200,
    [],
  ]);
  expect(await put(own)).toEqual([200, { stored: true }]);
  const unknown = `/api/vaults/${vault}/entries/${encodeBytes(id(0xe9))}/versions`;
  expect(await answer(await call(jonasC, "GET", unknown))).toEqual([200, []]);
  expect(await put(own)).toEqual([409, { current: own }]);
  expect(await put({ ...own, version: 3 })).toEqual([409, { current: own }]);
};

const listenersHearChanges = async (t: Target) => {
  await openBuero(t);
  const stop = new AbortController();
  const events: LiveEvent[] = [];
  let notify = () => {};
  const next = () => new Promise<void>((resolve) => (notify = resolve));
  expect(t.listening(vault)).toBe(0);
  expect(t.listening(encodeBytes(id(0xb9)))).toBe(0);
  const raw = new AbortController();
  const max = t.connect("t-max");
  const stream = await max.fetch(`${max.baseUrl}/api/vaults/${vault}/events`, {
    headers: { authorization: "Bearer t-max" },
    signal: raw.signal,
  });
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  raw.abort();
  await stream.body?.cancel().catch(() => undefined);
  let arrived = next();
  void watchVault(
    t.connect("t-anna"),
    ring.vaultId,
    (event) => {
      events.push(event);
      notify();
    },
    stop.signal,
  );
  await arrived;
  expect(t.listening(vault)).toBe(1);
  arrived = next();
  await sync(
    edit(emptyDevice(), id(0xe1), bank),
    httpServer(t.connect("t-jonas"), ring.vaultId),
    contextFor(jonas),
  );
  await arrived;
  expect(events).toEqual([{ type: "ready" }, { type: "change", entryId: id(0xe1), version: 1 }]);
  stop.abort();
  for (let i = 0; i < 100 && t.listening(vault) > 0; i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(t.listening(vault)).toBe(0);
};

/** Records and the stream go to the vault's members only; only editors and managers write */
const membersOnly = async (t: Target) => {
  await openBuero(t, 2);
  const max = t.connect("t-max");
  const records = `/api/vaults/${vault}/records`;
  const byMax = recordToWire(
    sealRecord(contextFor(maxP).author, ring, id(0xe1), 1, bank, new Uint8Array()),
  );
  // Max works at Weber Haustechnik but is no member of Büro yet
  for (const [method, path, body] of [
    ["GET", records, undefined],
    ["GET", `/api/vaults/${vault}/entries/${encodeBytes(id(0xe1))}/versions`, undefined],
    ["GET", `/api/vaults/${vault}/events`, undefined],
    ["PUT", records, byMax],
  ] as const)
    expect([method, path, ...(await answer(await call(max, method, path, body)))]).toEqual([
      method,
      path,
      ...notFound,
    ]);
  await postLogEntry(t, 2);
  // as a reader Max reads, but writes nothing
  expect(await answer(await call(max, "GET", records))).toEqual([200, []]);
  expect(await answer(await call(max, "PUT", records, byMax))).toEqual([
    403,
    { error: "forbidden" },
  ]);
};

export const syncContract = (name: string, target: () => Promise<Target>) =>
  describe(`sync contract: ${name}`, () => {
    it("creates a vault once and keeps it from other companies", async () =>
      vaultsStayInTheirCompany(await target()));
    it("syncs two devices, keeps every version and answers a conflict with the current record", async () =>
      devicesSyncWithVersions(await target()));
    it("answers routes it does not have with not-found", async () =>
      unknownRoutesAreNotFound(await target()));
    it("stores only records the session signed itself, for the vault in the path", async () =>
      onlyOwnSignedRecords(await target()));
    it("tells a listener when it is ready and about each new version, and lets it go", async () =>
      listenersHearChanges(await target()));
    it("gives records and changes only to the vault's members, and lets only editors write", async () =>
      membersOnly(await target()));
    it("lets no colleague make himself a member of a vault", async () =>
      nonMemberCannotJoinHimself(await target()));
    it("takes a vault's genesis only from who created the vault", async () =>
      noOneTakesANewVault(await target()));
    it("ends a member's stream once the member is removed, before naming another change", async () =>
      removedMemberHearsNothing(await target()));
    it("refuses a genesis for another vault", async () => genesisOfAnotherVault(await target()));
    it("refuses a genesis that makes its creator only a reader", async () =>
      genesisAsReader(await target()));
    it("refuses a key rotation until K-307", async () => rotationNotYet(await target()));
    it("takes an add of Anna right after the genesis", async () => addAsItShouldBe(await target()));
    it("refuses an add without a role", async () => addWithoutRole(await target()));
    it("refuses an add that commits to another vault key", async () =>
      addWithOtherCommitment(await target()));
    it("refuses an add after a state not in the chain (fork)", async () =>
      addAfterAForeignState(await target()));
    it("refuses an add signed years ahead", async () => addFromTheFuture(await target()));
    it("answers a rotation signed as another as forbidden", async () =>
      rotationSignedAsAnother(await target()));
    it("answers a rotation on an old place as stale", async () =>
      rotationOnAStalePlace(await target()));
    wireContract(target);
  });

const encodeHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
