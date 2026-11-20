// Contract cases for the log (review of the members-only sync): entries server and stand-in refuse alike
import { expect } from "vitest";
import { certificateFingerprint } from "../../membership/certificate.ts";
import { entryHash, GENESIS_HASH, type LogFields, signEntry } from "../../membership/log-entry.ts";
import { encodeBytes } from "../bytes.ts";
import { toWire } from "../wire.ts";
import { openBuero } from "./buero.ts";
import type { Target } from "./contract.ts";
import { anna, certificate, commitment, id, jonas, logEntries, vaultId } from "./fixtures.ts";

const vault = encodeBytes(vaultId);
const KEY = encodeBytes(new Uint8Array(1194));
const post = async (t: Target, body: unknown) => {
  const c = t.connect("t-jonas");
  const answer = await c.fetch(`${c.baseUrl}/api/vaults/${vault}/log`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return answer.status;
};
const genesisFields = (over: Partial<LogFields> = {}): LogFields => ({
  vaultId,
  seq: 0,
  prevHash: GENESIS_HASH,
  epoch: 0,
  action: "create",
  accountId: jonas.id,
  fingerprint: certificateFingerprint(certificate(jonas)),
  role: "manage",
  validUntil: 0,
  vkCommitment: commitment,
  time: 1_800_000_000,
  signerId: jonas.id,
  lastSeen: new Uint8Array(),
  ...over,
});

/** A genesis for another vault, posted to Büro's log */
export const genesisOfAnotherVault = async (t: Target) => {
  await openBuero(t, 0);
  const entry = signEntry(jonas.ed.secretKey, genesisFields({ vaultId: id(0xb1) }));
  expect(await post(t, { entry: toWire(entry), wrappedKey: KEY })).toBe(400);
};

/** A genesis that makes its creator only a reader */
export const genesisAsReader = async (t: Target) => {
  await openBuero(t, 0);
  const entry = signEntry(jonas.ed.secretKey, genesisFields({ role: "read" }));
  expect(await post(t, { entry: toWire(entry), wrappedKey: KEY })).toBe(400);
};

/** A key rotation, which the server takes only with K-307 */
export const rotationNotYet = async (t: Target) => {
  await openBuero(t);
  const prev = logEntries[2];
  if (!prev) throw new Error("fixture");
  const entry = signEntry(jonas.ed.secretKey, {
    ...genesisFields(),
    seq: 3,
    prevHash: entryHash(prev),
    epoch: 1,
    action: "rotate",
    accountId: jonas.id,
    fingerprint: new Uint8Array(),
    role: "",
    vkCommitment: new Uint8Array(32).fill(9),
    time: 1_800_000_010,
    lastSeen: entryHash(prev),
  });
  expect(await post(t, { entry: toWire(entry) })).toBe(400);
};

/** Jonas adds Anna right after the genesis, with one field changed */
const addAnnaWith = async (t: Target, over: Partial<LogFields>) => {
  await openBuero(t, 1);
  const genesis = logEntries[0];
  if (!genesis) throw new Error("fixture");
  const entry = signEntry(jonas.ed.secretKey, {
    vaultId,
    seq: 1,
    prevHash: entryHash(genesis),
    epoch: 0,
    action: "add",
    accountId: anna.id,
    fingerprint: certificateFingerprint(certificate(anna)),
    role: "edit",
    validUntil: 0,
    vkCommitment: commitment,
    time: 1_800_000_001,
    signerId: jonas.id,
    lastSeen: entryHash(genesis),
    ...over,
  });
  return post(t, { entry: toWire(entry), wrappedKey: KEY });
};

/** The unchanged add goes in on both: the cases below differ from it in one field only */
export const addAsItShouldBe = async (t: Target) => expect(await addAnnaWith(t, {})).toBe(201);

/** An add without a role (verifyLog: bad-action) */
export const addWithoutRole = async (t: Target) =>
  expect(await addAnnaWith(t, { role: "" })).toBe(400);

/** An add that commits to another vault key than the epoch's (verifyLog: bad-epoch) */
export const addWithOtherCommitment = async (t: Target) =>
  expect(await addAnnaWith(t, { vkCommitment: new Uint8Array(32).fill(7) })).toBe(400);

/** An add whose signer claims to have last seen a state that is not in this chain (fork, E-08) */
export const addAfterAForeignState = async (t: Target) =>
  expect(await addAnnaWith(t, { lastSeen: new Uint8Array(32).fill(3) })).toBe(400);

/** An add signed years ahead, which would block every later entry (verifyLog: bad-time) */
export const addFromTheFuture = async (t: Target) =>
  expect(await addAnnaWith(t, { time: 1_900_000_000 })).toBe(400);

const rotation = (over: Partial<LogFields>) => {
  const prev = logEntries[2];
  if (!prev) throw new Error("fixture");
  return signEntry(jonas.ed.secretKey, {
    vaultId,
    seq: 3,
    prevHash: entryHash(prev),
    epoch: 1,
    action: "rotate",
    accountId: jonas.id,
    fingerprint: new Uint8Array(),
    role: "",
    validUntil: 0,
    vkCommitment: new Uint8Array(32).fill(9),
    time: 1_800_000_010,
    signerId: jonas.id,
    lastSeen: entryHash(prev),
    ...over,
  });
};

/** A rotation Jonas posts but Anna's ID claims to sign: someone else's entry, 403 */
export const rotationSignedAsAnother = async (t: Target) => {
  await openBuero(t);
  expect(await post(t, { entry: toWire(rotation({ signerId: anna.id })) })).toBe(403);
};

/** A rotation on an old place of the chain: stale, 409 with the next place */
export const rotationOnAStalePlace = async (t: Target) => {
  await openBuero(t);
  expect(await post(t, { entry: toWire(rotation({ seq: 1 })) })).toBe(409);
};
