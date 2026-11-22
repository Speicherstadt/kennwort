// The stand-in's log (K-305): what it takes like the server, and whom it counts as a member
import { describe, expect, it } from "vitest";
import { certificateFingerprint } from "../membership/certificate.ts";
import { entryHash, type LogEntry, type LogFields, signEntry } from "../membership/log-entry.ts";
import { rekeyMember } from "../membership/renewal.ts";
import {
  annaNew,
  RENEWED_AT,
  renewedCertificate,
  renewedTrust,
} from "../membership/test/renewed.ts";
import { type LogState, verifyLog } from "../membership/verify-log.ts";
import { encodeBytes } from "../sync/bytes.ts";
import {
  anna,
  certificate,
  commitment,
  jonas,
  logEntries,
  max,
  type Person,
  standInCompany,
  vaultId,
} from "../sync/test/fixtures.ts";
import { toWire } from "../sync/wire.ts";
import { standIn } from "./stand-in.ts";

const sessions = {
  "t-jonas": { accountId: encodeBytes(jonas.id), companyId: "weber" },
  "t-anna": { accountId: encodeBytes(anna.id), companyId: "weber" },
  "t-max": { accountId: encodeBytes(max.id), companyId: "weber" },
};
const vault = encodeBytes(vaultId);
const key = encodeBytes(new Uint8Array(1194));
const [genesis, addAnna, addMax] = logEntries as [LogEntry, LogEntry, LogEntry];

const setup = async (now?: () => number) => {
  const server = standIn(sessions, standInCompany(now));
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const answer = await server.fetch(`https://demo.kennwort.test${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    return [answer.status, await answer.json().catch(() => "stream")];
  };
  await call("t-jonas", "POST", "/api/vaults", { id: vault });
  const append = (token: string, entry: LogEntry, wrappedKey: string | undefined = key) =>
    call(token, "POST", `/api/vaults/${vault}/log`, {
      entry: toWire(entry),
      ...(wrappedKey ? { wrappedKey } : {}),
    });
  const reads = async (token: string) =>
    (await call(token, "GET", `/api/vaults/${vault}/records`))[0];
  return { call, append, reads };
};

/** An entry after `prev`, signed by `signer`, about `subject` */
const next = (
  prev: LogEntry,
  signer: Person,
  subject: Person,
  fields: Partial<LogFields> = {},
): LogEntry =>
  signEntry(signer.ed.secretKey, {
    vaultId,
    seq: prev.seq + 1,
    prevHash: entryHash(prev),
    epoch: 0,
    action: "role",
    accountId: subject.id,
    fingerprint: new Uint8Array(),
    role: "edit",
    validUntil: 0,
    vkCommitment: new Uint8Array(),
    time: prev.time + 1,
    signerId: signer.id,
    lastSeen: entryHash(prev),
    ...fields,
  });

describe("the stand-in's log", () => {
  it("takes the next link of the chain and answers with its number", async () => {
    const s = await setup();
    expect(await s.append("t-jonas", genesis)).toEqual([201, { seq: 0 }]);
    expect(await s.append("t-jonas", addAnna)).toEqual([201, { seq: 1 }]);
  });

  it("refuses a body that is no entry, and a key where none belongs or none where one does", async () => {
    const s = await setup();
    const invalid = [400, { error: "invalid" }];
    expect(await s.call("t-jonas", "POST", `/api/vaults/${vault}/log`, "{")).toEqual(invalid);
    expect(await s.append("t-jonas", genesis, "")).toEqual(invalid);
    await s.append("t-jonas", genesis);
    await s.append("t-jonas", addAnna);
    expect(await s.append("t-jonas", next(addAnna, jonas, anna))).toEqual(invalid);
  });

  it("takes entries only as the session's own, on the last number and hash", async () => {
    const s = await setup();
    expect(await s.append("t-anna", genesis)).toEqual([403, { error: "forbidden" }]);
    await s.append("t-jonas", genesis);
    expect(await s.append("t-jonas", addMax)).toEqual([409, { error: "stale", seq: 1 }]);
    const otherHash = { ...addAnna, prevHash: new Uint8Array(32) };
    expect(await s.append("t-jonas", otherHash)).toEqual([409, { error: "stale", seq: 1 }]);
    // the right hash under the wrong number is no next link either
    const otherNumber = { ...addAnna, seq: 5 };
    expect(await s.append("t-jonas", otherNumber)).toEqual([409, { error: "stale", seq: 1 }]);
  });

  it("takes a genesis only as create by its creator, later entries only from a manager", async () => {
    const s = await setup();
    const jonasAddsAnna = next(genesis, jonas, anna, {
      seq: 0,
      prevHash: genesis.prevHash,
      action: "create",
    });
    expect(await s.append("t-jonas", jonasAddsAnna)).toEqual([400, { error: "invalid" }]);
    const notCreate = { ...genesis, action: "add" as const };
    expect(await s.append("t-jonas", notCreate)).toEqual([400, { error: "invalid" }]);
    await s.append("t-jonas", genesis);
    const secondCreate = next(genesis, jonas, jonas, { action: "create", role: "manage" });
    expect(await s.append("t-jonas", secondCreate)).toEqual([400, { error: "invalid" }]);
    await s.append("t-jonas", addAnna);
    // Anna edits: she manages no one
    const byAnna = next(addAnna, anna, max, {
      action: "add",
      role: "read",
      fingerprint: certificateFingerprint(certificate(max)),
      vkCommitment: commitment,
    });
    expect(await s.append("t-anna", byAnna)).toEqual([403, { error: "forbidden" }]);
  });
});

describe("whom the stand-in counts as a member", () => {
  it("takes no key rotation yet (K-307) and drops a member who is removed", async () => {
    const s = await setup();
    await s.append("t-jonas", genesis);
    await s.append("t-jonas", addAnna);
    const rotate = next(addAnna, jonas, jonas, {
      action: "rotate",
      role: "",
      epoch: 1,
      vkCommitment: commitment,
    });
    expect(await s.append("t-jonas", rotate, "")).toEqual([400, { error: "invalid" }]);
    expect(await s.reads("t-anna")).toBe(200);
    const removeAnna = next(addAnna, jonas, anna, { action: "remove", role: "" });
    expect((await s.append("t-jonas", removeAnna, ""))[0]).toBe(201);
    expect(await s.reads("t-anna")).toBe(404);
    expect(await s.reads("t-jonas")).toBe(200);
  });

  it("follows verifyLog's rules without certificates: time, add, role and remove", async () => {
    const s = await setup();
    await s.append("t-jonas", genesis);
    const invalid = [400, { error: "invalid" }];
    const earlier = next(genesis, jonas, anna, { time: genesis.time - 1 });
    expect(await s.append("t-jonas", earlier, "")).toEqual(invalid);
    expect(await s.append("t-jonas", next(genesis, jonas, anna), "")).toEqual(invalid);
    expect(
      await s.append("t-jonas", next(genesis, jonas, anna, { action: "remove", role: "" }), ""),
    ).toEqual(invalid);
    await s.append("t-jonas", addAnna);
    const again = next(addAnna, jonas, anna, {
      action: "add",
      fingerprint: certificateFingerprint(certificate(anna)),
      vkCommitment: commitment,
    });
    expect(await s.append("t-jonas", again)).toEqual(invalid);
    const roleEarlier = next(addAnna, jonas, anna, { time: addAnna.time - 1 });
    expect(await s.append("t-jonas", roleEarlier, "")).toEqual(invalid);
    const role = next(addAnna, jonas, anna, { time: addAnna.time });
    expect((await s.append("t-jonas", role, ""))[0]).toBe(201);
    // removed, Anna is outside again and may be added anew
    const removed = next(role, jonas, anna, { action: "remove", role: "" });
    expect((await s.append("t-jonas", removed, ""))[0]).toBe(201);
    const back = next(removed, jonas, anna, {
      action: "add",
      fingerprint: certificateFingerprint(certificate(anna)),
      vkCommitment: commitment,
    });
    expect((await s.append("t-jonas", back))[0]).toBe(201);
  });

  it("takes a genesis only for its own vault, as create of a manager at epoch 0", async () => {
    const s = await setup();
    const invalid = [400, { error: "invalid" }];
    expect(await s.append("t-jonas", { ...genesis, vaultId: new Uint8Array(16).fill(9) })).toEqual(
      invalid,
    );
    expect(await s.append("t-jonas", { ...genesis, role: "read" })).toEqual(invalid);
    expect(await s.append("t-jonas", { ...genesis, epoch: 1 })).toEqual(invalid);
    expect(await s.append("t-jonas", { ...genesis, accountId: anna.id })).toEqual(invalid);
    expect(await s.append("t-jonas", genesis)).toEqual([201, { seq: 0 }]);
  });

  it("counts a member until the end of their time, not a millisecond longer", async () => {
    let time = 1_800_000_000_000;
    const s = await setup(() => time);
    await s.append("t-jonas", genesis);
    const until = 1_800_001_000;
    await s.append(
      "t-jonas",
      next(genesis, jonas, anna, {
        action: "add",
        validUntil: until,
        fingerprint: certificateFingerprint(certificate(anna)),
        vkCommitment: commitment,
      }),
    );
    time = until * 1000 - 1;
    expect(await s.reads("t-anna")).toBe(200);
    time = until * 1000;
    expect(await s.reads("t-anna")).toBe(404);
  });
});

describe("rights in the stand-in's log, as the server judges them", () => {
  const annaManagesUntil = (until: number) =>
    next(genesis, jonas, anna, {
      action: "add",
      role: "manage",
      validUntil: until,
      fingerprint: certificateFingerprint(certificate(anna)),
      vkCommitment: commitment,
    });
  const annaAddsMax = (prev: LogEntry, time: number) =>
    next(prev, anna, max, {
      action: "add",
      role: "read",
      time,
      fingerprint: certificateFingerprint(certificate(max)),
      vkCommitment: commitment,
    });

  it("wants a manager by its own clock: one whose time ran out cannot backdate an entry", async () => {
    const until = 1_800_000_100;
    let time = 1_800_000_000_000;
    const s = await setup(() => time);
    await s.append("t-jonas", genesis);
    const added = annaManagesUntil(until);
    await s.append("t-jonas", added);
    time = (until + 10) * 1000;
    expect(await s.append("t-anna", annaAddsMax(added, until - 1))).toEqual([
      403,
      { error: "forbidden" },
    ]);
  });

  it("refuses an entry a manager signs after the end of her own time", async () => {
    const until = 1_800_000_100;
    const s = await setup(() => (until - 1) * 1000);
    await s.append("t-jonas", genesis);
    const added = annaManagesUntil(until);
    await s.append("t-jonas", added);
    expect(await s.append("t-anna", annaAddsMax(added, until + 10))).toEqual([
      403,
      { error: "forbidden" },
    ]);
  });

  it("refuses a genesis whose signer the company did not certify", async () => {
    const company = standInCompany();
    const server = standIn(sessions, { ...company, certificates: new Map() });
    const call = (path: string, body: unknown) =>
      server.fetch(`https://demo.kennwort.test${path}`, {
        method: "POST",
        headers: { authorization: "Bearer t-jonas" },
        body: JSON.stringify(body),
      });
    await call("/api/vaults", { id: vault });
    const answer = await call(`/api/vaults/${vault}/log`, {
      entry: toWire(genesis),
      wrappedKey: key,
    });
    expect([answer.status, await answer.json()]).toEqual([403, { error: "forbidden" }]);
  });
});

describe("the stand-in's log after a member renewed her keys (P-12)", () => {
  const renewedSetup = async () => {
    const trust = renewedTrust();
    const server = standIn(sessions, {
      rootPublicKey: trust.rootPublicKey,
      certificates: trust.certificates,
      history: trust.history ?? new Map(),
      now: () => trust.now * 1000,
    });
    const call = async (token: string, body: unknown, path = `/api/vaults/${vault}/log`) => {
      const answer = await server.fetch(`https://demo.kennwort.test${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return [answer.status, await answer.json()];
    };
    await call("t-jonas", { id: vault }, "/api/vaults");
    await call("t-jonas", { entry: toWire(genesis), wrappedKey: key });
    await call("t-jonas", { entry: toWire(addAnna), wrappedKey: key });
    const state = verifyLog(vaultId, [genesis, addAnna], trust);
    if (!state.ok) throw new Error(state.error);
    return { call, state: state.value };
  };
  const rekey = (state: LogState, signer: Person) => {
    const made = rekeyMember(
      { accountId: signer.id, edSecretKey: signer.ed.secretKey },
      state,
      vaultId,
      renewedCertificate,
      RENEWED_AT + 100,
    );
    if (!made.ok) throw new Error(made.error);
    return made.value;
  };

  it("takes her own rekey from an editor, signed with her new keys", async () => {
    const { call, state } = await renewedSetup();
    expect(await call("t-anna", { entry: toWire(rekey(state, annaNew)) })).toEqual([
      201,
      { seq: 2 },
    ]);
  });

  it("takes no rekey from an editor for someone else, nor one signed with the old keys", async () => {
    const { call, state } = await renewedSetup();
    const byOld = { ...rekey(state, annaNew), signature: rekey(state, anna).signature };
    expect(await call("t-anna", { entry: toWire(byOld) })).toEqual([400, { error: "invalid" }]);
    const forAnna = { ...rekey(state, max), signerId: max.id };
    expect(await call("t-max", { entry: toWire(forAnna) })).toEqual([403, { error: "forbidden" }]);
  });
});
