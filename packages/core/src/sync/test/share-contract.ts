// Contract cases for sharing a single entry (K-305 part 6, P-10): Jonas shares the bank entry of
// Büro with Sandra, a colleague outside the vault; she reads that entry and nothing else of Büro
import { expect } from "vitest";
import { certificateFingerprint } from "../../membership/certificate.ts";
import { idKey } from "../../membership/verify-log.ts";
import { encodeBytes } from "../bytes.ts";
import { edit, emptyDevice, pull, sync } from "../device.ts";
import { httpServer } from "../http.ts";
import { EntryRecord } from "../record.ts";
import { makeShare, openShared, SharesWire, shareToWire } from "../share.ts";
import { openBuero } from "./buero.ts";
import type { Target } from "./contract.ts";
import {
  anna,
  bank,
  certificate,
  contextFor,
  id,
  jonas,
  type Person,
  petra,
  sandra,
  trust,
  vaultId,
  withField,
} from "./fixtures.ts";

const vault = encodeBytes(vaultId);
const [e1, e2] = [id(0xe1), id(0xe2)];
const sharesOf = (entryId: Uint8Array) =>
  `/api/vaults/${vault}/entries/${encodeBytes(entryId)}/shares`;
const sharedEntry = (entryId: Uint8Array) => `/api/shared/${vault}/${encodeBytes(entryId)}`;
const notFound = [404, { error: "not-found" }];

const call = async (t: Target, token: string, method: string, path: string, body?: unknown) => {
  const c = t.connect(token);
  const response = await c.fetch(`${c.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  return [response.status, await response.json()];
};

/** Büro with the entries e1 (bank) and e2, written by Jonas; gives the entry key of each */
const bueroWithEntries = async (t: Target) => {
  await openBuero(t);
  const server = httpServer(t.connect("t-jonas"), vaultId);
  let device = (await sync(edit(emptyDevice(), e1, bank), server, contextFor(jonas))).device;
  device = (await sync(edit(device, e2, bank), server, contextFor(jonas))).device;
  const keyOf = (entryId: Uint8Array) => {
    const key = device.known.get(idKey(entryId))?.key;
    if (!key) throw new Error("no entry key"); // i18n-ignore: for developers
    return key.entryKey;
  };
  return { e1Key: keyOf(e1), e2Key: keyOf(e2) };
};

const shareOf = (
  entryKey: Uint8Array,
  to: Person,
  { entryId = e1, sharer = jonas, validUntil = 0 } = {},
) =>
  makeShare(
    { id: sharer.id, edSecretKey: sharer.ed.secretKey },
    entryKey,
    certificate(to),
    { vaultId, entryId },
    {
      validUntil,
      time: 1_800_000_050,
    },
  );

const asSandra = {
  accountId: sandra.id,
  secretKey: sandra.xwing.secretKey,
  fingerprint: certificateFingerprint(certificate(sandra)),
};

/** What Sandra reads of e1 through her share, after checking share and record herself */
const sandraReads = async (t: Target) => {
  const [, list] = await call(t, "t-sandra", "GET", "/api/shared");
  const [share] = SharesWire.parse(list).shares;
  const [status, record] = await call(t, "t-sandra", "GET", sharedEntry(e1));
  if (!share || status !== 200) return status;
  return openShared(share, EntryRecord.parse(record), asSandra, trust);
};

export const recipientReadsOnlyThisEntry = async (t: Target) => {
  const { e1Key } = await bueroWithEntries(t);
  const share = shareOf(e1Key, sandra);
  expect(await call(t, "t-jonas", "PUT", sharesOf(e1), shareToWire(share))).toEqual([
    200,
    { stored: true },
  ]);
  const listed = [200, { shares: [shareToWire(share)] }];
  expect(await call(t, "t-sandra", "GET", "/api/shared")).toEqual(listed);
  expect(await call(t, "t-jonas", "GET", sharesOf(e1))).toEqual(listed);
  expect(await call(t, "t-max", "GET", sharesOf(e1))).toEqual(listed);
  expect(await sandraReads(t)).toEqual({ ok: true, value: bank });
  for (const [method, path] of [
    ["GET", sharedEntry(e2)],
    ["GET", `/api/vaults/${vault}/records`],
    ["GET", `/api/vaults/${vault}/entries/${encodeBytes(e1)}/versions`],
    ["GET", `/api/vaults/${vault}/events`],
    ["GET", `/api/vaults/${vault}/log`],
    ["GET", `/api/vaults/${vault}/keys`],
    ["GET", sharesOf(e1)],
    ["PUT", sharesOf(e1)],
    ["DELETE", `${sharesOf(e1)}/${encodeBytes(sandra.id)}`],
  ] as const)
    expect([method, path, ...(await call(t, "t-sandra", method, path))]).toEqual([
      method,
      path,
      ...notFound,
    ]);
  // Anna writes the next version with the same entry key: the share covers it
  const annaServer = httpServer(t.connect("t-anna"), vaultId);
  const laptop = (await pull(emptyDevice(), annaServer, contextFor(anna))).device;
  const changed = withField(bank, "password", "Neu-2027!");
  await sync(edit(laptop, e1, changed), annaServer, contextFor(anna));
  expect(await sandraReads(t)).toEqual({ ok: true, value: changed });
  const unshare = `${sharesOf(e1)}/${encodeBytes(sandra.id)}`;
  expect(await call(t, "t-anna", "DELETE", unshare)).toEqual([200, { ok: true }]);
  expect(await call(t, "t-sandra", "GET", "/api/shared")).toEqual([200, { shares: [] }]);
  expect(await call(t, "t-sandra", "GET", sharedEntry(e1))).toEqual(notFound);
};

export const onlyEditorsShareTheirOwnEntries = async (t: Target) => {
  const { e1Key } = await bueroWithEntries(t);
  const put = (token: string, body: unknown, path = sharesOf(e1)) =>
    call(t, token, "PUT", path, typeof body === "string" ? body : shareToWire(body as never));
  const toSandra = shareOf(e1Key, sandra);
  const forbidden = [403, { error: "forbidden" }];
  const invalid = [400, { error: "invalid" }];
  expect(await put("t-max", toSandra)).toEqual(forbidden);
  expect(await put("t-petra", toSandra)).toEqual(notFound);
  expect(await put("t-jonas", "{")).toEqual(invalid);
  expect(await put("t-jonas", shareOf(e1Key, sandra, { sharer: anna }))).toEqual(forbidden);
  for (const to of [petra, jonas, { ...sandra, id: id(0x99) }])
    expect(await put("t-jonas", shareOf(e1Key, to))).toEqual(invalid);
  expect(await put("t-jonas", toSandra, sharesOf(e2))).toEqual(invalid);
  const elsewhere = { ...shareToWire(toSandra), vaultId: encodeBytes(id(0xb1)) };
  expect(await call(t, "t-jonas", "PUT", sharesOf(e1), elsewhere)).toEqual(invalid);
  const e9 = id(0xe9);
  expect(await put("t-jonas", shareOf(e1Key, sandra, { entryId: e9 }), sharesOf(e9))).toEqual(
    notFound,
  );
  expect(await call(t, "t-jonas", "GET", sharesOf(e1))).toEqual([200, { shares: [] }]);
  expect(await put("t-jonas", toSandra)).toEqual([200, { stored: true }]);
  expect(await call(t, "t-max", "DELETE", `${sharesOf(e1)}/${encodeBytes(sandra.id)}`)).toEqual(
    forbidden,
  );
  expect(await call(t, "t-petra", "GET", "/api/shared")).toEqual([200, { shares: [] }]);
  expect(await call(t, "t-petra", "GET", sharedEntry(e1))).toEqual(notFound);
  // Routes neither server has, asked by a manager and by the recipient of a valid share
  const unshare = `${sharesOf(e1)}/${encodeBytes(sandra.id)}`;
  for (const [token, method, path] of [
    ["t-jonas", "PUT", unshare],
    ["t-jonas", "GET", unshare],
    ["t-jonas", "DELETE", sharesOf(e1)],
    ["t-jonas", "DELETE", `${unshare}/more`],
    ["t-jonas", "GET", `/api/vaults/${vault}/more/entries/${encodeBytes(e1)}/shares`],
    ["t-sandra", "POST", sharedEntry(e1)],
    ["t-sandra", "GET", `/api/shared/${vault}`],
    ["t-sandra", "GET", `${sharedEntry(e1)}/more`],
    ["t-sandra", "GET", `/x${sharedEntry(e1)}`],
  ] as const)
    expect([token, method, path, ...(await call(t, token, method, path))]).toEqual([
      token,
      method,
      path,
      ...notFound,
    ]);
  expect((await call(t, "t-sandra", "GET", sharedEntry(e1)))[0]).toBe(200);
};

export const expiredSharesAreGone = async (t: Target) => {
  const { e1Key, e2Key } = await bueroWithEntries(t);
  const second = shareOf(e2Key, sandra, { entryId: e2 });
  await call(t, "t-jonas", "PUT", sharesOf(e2), shareToWire(second));
  // Both servers' clocks stand at 1_800_000_000 s: a share valid until then has just expired
  const expired = shareOf(e1Key, sandra, { validUntil: 1_800_000_000 });
  expect(await call(t, "t-jonas", "PUT", sharesOf(e1), shareToWire(expired))).toEqual([
    200,
    { stored: true },
  ]);
  expect(await call(t, "t-sandra", "GET", "/api/shared")).toEqual([
    200,
    { shares: [shareToWire(second)] },
  ]);
  expect(await call(t, "t-sandra", "GET", sharedEntry(e1))).toEqual(notFound);
  const renewed = shareOf(e1Key, sandra, { validUntil: 1_900_000_000 });
  const toAnna = shareOf(e2Key, anna, { entryId: e2 });
  for (const [entryId, share] of [
    [e1, renewed],
    [e2, toAnna],
  ] as const)
    await call(t, "t-jonas", "PUT", sharesOf(entryId), shareToWire(share));
  expect(await call(t, "t-jonas", "GET", sharesOf(e1))).toEqual([
    200,
    { shares: [shareToWire(renewed)] },
  ]);
  expect(await call(t, "t-sandra", "GET", "/api/shared")).toEqual([
    200,
    { shares: [shareToWire(renewed), shareToWire(second)] },
  ]);
  expect((await call(t, "t-sandra", "GET", sharedEntry(e1)))[0]).toBe(200);
};
