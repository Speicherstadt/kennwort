// Contract cases for the key rotation (K-307, P-11): server and stand-in take a rotation only with
// the new key for exactly the vault's members, and records only in the current epoch afterwards
import { expect } from "vitest";
import { encodeBytes } from "../bytes.ts";
import { recordToWire, sealRecord } from "../record.ts";
import { toWire } from "../wire.ts";
import { openBuero } from "./buero.ts";
import type { Target } from "./contract.ts";
import {
  anna,
  bank,
  id,
  jonas,
  logEntries,
  max,
  type Person,
  sandra,
  vaultId,
} from "./fixtures.ts";
import { rotation } from "./log-contract.ts";

const vault = encodeBytes(vaultId);
const WRAPPED = encodeBytes(new Uint8Array(1 + 1120 + 1 + 24 + 32 + 16));
const keysFor = (...people: Person[]) =>
  people.map((p) => ({ accountId: encodeBytes(p.id), wrapped: WRAPPED }));

const send = async (t: Target, method: string, path: string, body: unknown) => {
  const c = t.connect("t-jonas");
  const answer = await c.fetch(`${c.baseUrl}/api/vaults/${vault}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return [answer.status, await answer.json()];
};
const rotate = (t: Target, wrappedKeys?: unknown) =>
  send(t, "POST", "/log", {
    entry: toWire(rotation({})),
    ...(wrappedKeys === undefined ? {} : { wrappedKeys }),
  });

/** Büro (Jonas, Anna, Max) gets epoch 1 with a key for each of them */
export const rotationWithEveryKey = async (t: Target) => {
  await openBuero(t);
  expect(await rotate(t, keysFor(jonas, anna, max))).toEqual([201, { seq: 3 }]);
};

/** No keys, one member short, a stranger, or a member twice: all invalid, nothing stored */
export const rotationWithWrongKeys = async (t: Target) => {
  await openBuero(t);
  const invalid = [400, { error: "invalid" }];
  expect(await rotate(t)).toEqual(invalid);
  expect(await rotate(t, [])).toEqual(invalid);
  expect(await rotate(t, keysFor(jonas, anna))).toEqual(invalid);
  expect(await rotate(t, keysFor(jonas, anna, max, sandra))).toEqual(invalid);
  expect(await rotate(t, keysFor(jonas, anna, sandra))).toEqual(invalid);
  expect(await rotate(t, keysFor(jonas, anna, max, max))).toEqual(invalid);
  expect(
    await rotate(t, [...keysFor(jonas, anna), { accountId: encodeBytes(max.id), wrapped: "AAAA" }]),
  ).toEqual(invalid);
  expect(await rotate(t, keysFor(jonas, anna, max))).toEqual([201, { seq: 3 }]);
};

/** An add carries one wrapped key, never the list of a rotation */
export const keysOnlyWithARotation = async (t: Target) => {
  await openBuero(t, 2);
  const add = logEntries[2];
  if (!add) throw new Error("fixture");
  expect(
    await send(t, "POST", "/log", {
      entry: toWire(add),
      wrappedKey: WRAPPED,
      wrappedKeys: keysFor(max),
    }),
  ).toEqual([400, { error: "invalid" }]);
};

const record = (epoch: number, version = 1) =>
  recordToWire(
    sealRecord(
      { id: jonas.id, edSecretKey: jonas.ed.secretKey },
      { vaultId, epoch, vaultKey: new Uint8Array(32).fill(epoch + 1) },
      id(0xe7),
      version,
      bank,
      new Uint8Array(),
    ),
  );

/** After the rotation, a record of the old epoch (or a future one) is a conflict, not a version */
export const recordsOnlyInTheCurrentEpoch = async (t: Target) => {
  await openBuero(t);
  const current = record(0);
  expect(await send(t, "PUT", "/records", current)).toEqual([200, { stored: true }]);
  expect(await rotate(t, keysFor(jonas, anna, max))).toEqual([201, { seq: 3 }]);
  expect(await send(t, "PUT", "/records", record(0, 2))).toEqual([
    409,
    { error: "epoch", current },
  ]);
  expect(await send(t, "PUT", "/records", record(2, 2))).toEqual([
    409,
    { error: "epoch", current },
  ]);
  expect(await send(t, "PUT", "/records", record(1, 2))).toEqual([200, { stored: true }]);
};
