import { type EntryRecord, encodeBytes, recordToWire, type Stored } from "@kennwort/core";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { memoryKeyValue } from "./key-value.ts";
import { createLocalCopy } from "./local-copy.ts";

// K-308 part b: what the device keeps to read without the server – the server's answers it reads
// from, member names left out, and nothing that is not already on the server

const ANNA = "AAAAAAAAAAAAAAAAAAAAAA";
const MAX = "BBBBBBBBBBBBBBBBBBBBBB";
const VAULT = "CCCCCCCCCCCCCCCCCCCCCC";

/** A server that answers from a table and can go away; every request is counted */
const network = (answers: Record<string, unknown>) => {
  const state = { up: true };
  const asked: string[] = [];
  const send: typeof fetch = async (input, init) => {
    asked.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (!state.up) throw new TypeError("Failed to fetch");
    const answer = answers[String(input)];
    return answer === undefined
      ? Response.json({ error: "not-found" }, { status: 404 })
      : Response.json(answer);
  };
  const down = () => {
    state.up = false;
  };
  const back = () => {
    state.up = true;
  };
  return { send, asked, down, back };
};

const copyFor = async (account = ANNA) => {
  const store = memoryKeyValue();
  const copy = createLocalCopy(store, () => 1_700_000_000_000);
  await copy.useAccount(account);
  return { store, copy };
};

const vaults = { vaults: [{ id: VAULT, name: null, nameEpoch: null }] };

describe("the local copy of the server's answers", () => {
  it("serves a read the server answered before when it cannot be reached, and says so", async () => {
    const { copy } = await copyFor();
    const net = network({ "/api/vaults": vaults });
    const send = copy.fetch(net.send);
    expect(await (await send("/api/vaults")).json()).toEqual(vaults);
    flush();
    expect(copy.reachable()).toBe(true);
    net.down();
    const offline = await send("/api/vaults", { headers: { authorization: "Bearer " } });
    expect(offline.status).toBe(200);
    expect(await offline.json()).toEqual(vaults);
    flush();
    expect(copy.reachable()).toBe(false);
    net.back();
    await send("/api/vaults");
    flush();
    expect(copy.reachable()).toBe(true);
  });

  it("keeps the time of the last vault list from the server as the last sync", async () => {
    const { store, copy } = await copyFor();
    flush();
    expect(copy.syncedAt()).toBeUndefined();
    await copy.fetch(network({ "/api/vaults": vaults }).send)("/api/vaults");
    flush();
    expect(copy.syncedAt()).toBe(1_700_000_000_000);
    const again = createLocalCopy(store, () => 0);
    await again.useAccount(ANNA);
    flush();
    expect(again.syncedAt()).toBe(1_700_000_000_000);
  });

  it("keeps only the reads the app needs offline, never a write, a sign-in or the records", async () => {
    const { store, copy } = await copyFor();
    const net = network({
      "/api/account/keys": { secret: true },
      "/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/records": [],
      "/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/log": { entries: [] },
      "/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/keys": { keys: [] },
      "/api/company": { id: "weber", rootPublicKey: null, policy: null },
      "/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/requests": { requests: [] },
    });
    const send = copy.fetch(net.send);
    await send("/api/account/keys");
    await send("/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/records");
    await send("/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/requests");
    await send("/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/log");
    await send("/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/keys");
    await send("/api/company");
    await send("/api/company", { method: "PUT", body: "{}" });
    expect([...store.data.keys()].sort()).toEqual([
      "account",
      "read:/api/company",
      "read:/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/keys",
      "read:/api/vaults/CCCCCCCCCCCCCCCCCCCCCC/log",
    ]);
    net.down();
    await expect(send("/api/account/keys")).rejects.toThrow();
    await expect(send("/api/company", { method: "PUT", body: "{}" })).rejects.toThrow();
    await expect(send("/auth/login-key/challenge", { method: "POST" })).rejects.toThrow();
    flush();
    expect(copy.reachable()).toBe(false);
  });

  it("keeps no answer that is not a 200, and no read the server never answered", async () => {
    const { store, copy } = await copyFor();
    const net = network({});
    const send = copy.fetch(net.send);
    expect((await send("/api/members")).status).toBe(404);
    expect(store.data.has("read:/api/members")).toBe(false);
    net.down();
    await expect(send("/api/members")).rejects.toThrow();
  });

  it("leaves the members' names out: they are no ciphertext", async () => {
    const { store, copy } = await copyFor();
    const members = {
      members: [
        { id: ANNA, role: "owner", name: "Anna Weber", certificate: null },
        { id: MAX, role: "member", name: "Max", certificate: null },
      ],
    };
    await copy.fetch(network({ "/api/members": members }).send)("/api/members");
    const kept = store.data.get("read:/api/members") ?? "";
    expect(kept).not.toContain("Anna Weber");
    expect(JSON.parse(kept)).toEqual({
      members: [
        { id: ANNA, role: "owner", name: null, certificate: null },
        { id: MAX, role: "member", name: null, certificate: null },
      ],
    });
  });

  it("keeps the answers of one account only: another account or logout starts empty", async () => {
    const { store, copy } = await copyFor();
    await copy.fetch(network({ "/api/vaults": vaults }).send)("/api/vaults");
    await copy.useAccount(ANNA);
    expect(store.data.has("read:/api/vaults")).toBe(true);
    await copy.useAccount(MAX);
    expect([...store.data.keys()]).toEqual(["account"]);
    flush();
    expect(copy.syncedAt()).toBeUndefined();
    await copy.fetch(network({ "/api/vaults": vaults }).send)("/api/vaults");
    await copy.forget();
    expect(store.data.size).toBe(0);
    // Without an account nothing is kept
    await copy.fetch(network({ "/api/vaults": vaults }).send)("/api/vaults");
    expect(store.data.size).toBe(0);
  });
});

const stored = (counter: number): Stored => ({
  accountId: new Uint8Array(16).fill(1),
  accountSalt: new Uint8Array(16).fill(2),
  keyBlock: new Uint8Array([3, 3]),
  state: new Uint8Array([counter]),
  stateCounter: counter,
  unlock: { passphrase: new Uint8Array([4]), recovery: new Uint8Array([5]) },
});

describe("the kept account", () => {
  it("gives back the wrapped account key with the state this device kept last", async () => {
    const { copy } = await copyFor();
    expect(await copy.keys(ANNA)).toBeUndefined();
    await copy.keepKeys(ANNA, stored(4));
    expect(await copy.keys(ANNA)).toEqual(stored(4));
    await copy.keepState(ANNA, { counter: 9, sealed: new Uint8Array([9, 9]) });
    expect(await copy.state(ANNA)).toEqual({ counter: 9, sealed: new Uint8Array([9, 9]) });
    expect(await copy.keys(ANNA)).toEqual({
      ...stored(4),
      state: new Uint8Array([9, 9]),
      stateCounter: 9,
    });
    // An older answer of the server does not take back the state this device kept
    await copy.keepKeys(ANNA, stored(2));
    expect((await copy.keys(ANNA))?.stateCounter).toBe(9);
  });

  it("is only for the account it belongs to", async () => {
    const { copy } = await copyFor();
    await copy.keepKeys(MAX, stored(4));
    await copy.keepState(MAX, { counter: 1, sealed: new Uint8Array([1]) });
    expect(await copy.keys(MAX)).toBeUndefined();
    await copy.keepKeys(ANNA, stored(4));
    expect(await copy.keys(MAX)).toBeUndefined();
    expect(await copy.state(MAX)).toBeUndefined();
  });

  it("gives nothing for a kept value that does not parse", async () => {
    const { store, copy } = await copyFor();
    store.data.set("keys", "{broken");
    store.data.set("state", JSON.stringify({ counter: "x" }));
    expect(await copy.keys(ANNA)).toBeUndefined();
    expect(await copy.state(ANNA)).toBeUndefined();
  });
});

const record = (entry: number, version: number, mark = 0): EntryRecord => ({
  vaultId: new Uint8Array(16).fill(7),
  entryId: new Uint8Array(16).fill(entry),
  version,
  epoch: 0,
  entryKey: new Uint8Array([mark]),
  content: new Uint8Array([version]),
  author: new Uint8Array(16).fill(1),
  lastSeen: new Uint8Array(32),
  signature: new Uint8Array(65),
});

describe("the kept records", () => {
  it("keeps the highest version of each entry that passes the check, and nothing else", async () => {
    const { store, copy } = await copyFor();
    const checked: number[] = [];
    const check = (r: EntryRecord) => {
      checked.push(r.version);
      return r.entryKey[0] !== 9;
    };
    await copy.keepRecords(VAULT, [record(1, 2), record(2, 1)], check);
    await copy.keepRecords(
      VAULT,
      [record(1, 1), record(1, 2, 5), record(2, 3, 9), record(3, 1)],
      check,
    );
    const kept = await copy.records(VAULT);
    expect(kept.map((r) => [r.entryId[0], r.version, r.entryKey[0]])).toEqual([
      [1, 2, 0],
      [2, 1, 0],
      [3, 1, 0],
    ]);
    // Only what would be newer is checked: an older or equal version is no news
    expect(checked).toEqual([2, 1, 3, 1]);
    expect(store.data.get(`records:${VAULT}`)).toContain(encodeBytes(new Uint8Array(16).fill(3)));
    expect(await copy.records("other")).toEqual([]);
  });

  it("keeps the wire form, which reads back to the same records", async () => {
    const { store, copy } = await copyFor();
    await copy.keepRecords(VAULT, [record(1, 2)], () => true);
    expect(JSON.parse(store.data.get(`records:${VAULT}`) ?? "")).toEqual([
      recordToWire(record(1, 2)),
    ]);
    expect(await copy.records(VAULT)).toEqual([record(1, 2)]);
  });

  it("keeps no records without an account", async () => {
    const store = memoryKeyValue();
    const copy = createLocalCopy(store);
    await copy.keepRecords(VAULT, [record(1, 2)], () => true);
    expect(store.data.size).toBe(0);
    expect(await copy.records(VAULT)).toEqual([]);
  });
});
