// Contract cases for the members-only sync (review): no colleague makes himself a member, and
// whoever is removed hears no more changes on a stream that is still open
import { expect } from "vitest";
import { certificateFingerprint } from "../../membership/certificate.ts";
import { entryHash, signEntry } from "../../membership/log-entry.ts";
import { removeMember } from "../../membership/vault-ops.ts";
import { encodeBytes } from "../bytes.ts";
import { watchVault } from "../http.ts";
import { recordToWire, sealRecord } from "../record.ts";
import { toWire } from "../wire.ts";
import { openBuero } from "./buero.ts";
import type { Target } from "./contract.ts";
import {
  anna,
  bank,
  certificate,
  commitment,
  contextFor,
  id,
  jonas,
  log,
  logEntries,
  max,
  vaultId,
} from "./fixtures.ts";

const vault = encodeBytes(vaultId);
const call = (t: Target, token: string, method: string, path: string, body?: unknown) => {
  const c = t.connect(token);
  return c.fetch(`${c.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

/** Max, no member of Büro, appends an entry he signed himself that makes him its manager */
export const nonMemberCannotJoinHimself = async (t: Target) => {
  await openBuero(t, 2);
  const prev = logEntries[1];
  if (!prev) throw new Error("fixture");
  const selfAdd = signEntry(max.ed.secretKey, {
    vaultId,
    seq: 2,
    prevHash: entryHash(prev),
    epoch: 0,
    action: "add",
    accountId: max.id,
    fingerprint: certificateFingerprint(certificate(max)),
    role: "manage",
    validUntil: 0,
    vkCommitment: commitment,
    time: 1_800_000_002,
    signerId: max.id,
    lastSeen: entryHash(prev),
  });
  const appended = await call(t, "t-max", "POST", `/api/vaults/${vault}/log`, {
    entry: toWire(selfAdd),
    wrappedKey: encodeBytes(new Uint8Array(1194)),
  });
  const records = await call(t, "t-max", "GET", `/api/vaults/${vault}/records`);
  expect([appended.status, records.status]).toEqual([403, 404]);
};

/** Max listens to Büro; Jonas removes him; Anna then stores a version Max must not hear of */
export const removedMemberHearsNothing = async (t: Target) => {
  await openBuero(t);
  const stop = new AbortController();
  const heard: string[] = [];
  let ready = () => {};
  const isReady = new Promise<void>((resolve) => (ready = resolve));
  const ended = watchVault(
    t.connect("t-max"),
    vaultId,
    (event) => {
      heard.push(event.type);
      if (event.type === "ready") ready();
    },
    stop.signal,
  ).then(() => "ended");
  await isReady;
  const removed = removeMember(
    { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
    log,
    vaultId,
    max.id,
    1_800_000_010,
  );
  const answer = await call(t, "t-jonas", "POST", `/api/vaults/${vault}/log`, {
    entry: toWire(removed),
  });
  expect(answer.status).toBe(201);
  const byAnna = sealRecord(
    contextFor(anna).author,
    contextFor(anna).ring,
    id(0xe1),
    1,
    bank,
    new Uint8Array(),
  );
  const stored = await call(
    t,
    "t-anna",
    "PUT",
    `/api/vaults/${vault}/records`,
    recordToWire(byAnna),
  );
  expect(stored.status).toBe(200);
  // the stream ends instead of naming the change
  const outcome = await Promise.race([
    ended,
    new Promise((r) => setTimeout(() => r("open"), 1000)),
  ]);
  // let go by the server itself, before the client stops listening
  expect([outcome, heard, t.listening(vault)]).toEqual(["ended", ["ready"], 0]);
  stop.abort();
};
