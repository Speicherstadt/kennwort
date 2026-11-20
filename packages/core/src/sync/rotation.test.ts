// The device's side of a key rotation (P-11): every entry written again under the new epoch's key,
// the secrets the person who left could read marked "to change"
import { openEntryKey } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { entryHash } from "../membership/log-entry.ts";
import { removeAndRotate } from "../membership/rotation.ts";
import { idKey, verifyLog } from "../membership/verify-log.ts";
import { encodeBytes } from "./bytes.ts";
import { type Device, edit, emptyDevice, pull, rotateEntries, sync } from "./device.ts";
import { memoryServer } from "./memory-server.ts";
import {
  anna,
  bank,
  contextFor,
  id,
  jonas,
  log,
  logEntries,
  max,
  type Person,
  trust,
  vaultId,
  vaultKey,
  withField,
} from "./test/fixtures.ts";

const e1 = id(0xe1);
const e2 = id(0xe2);
const note = { ...bank, title: "Notiz", fields: [bank.fields[0], bank.fields[2]] as never };
const ring0 = { vaultId, epoch: 0, vaultKey };
const ring1 = { vaultId, epoch: 1, vaultKey: new Uint8Array(32).fill(0x66) };
const exposure = { account: encodeBytes(max.id), at: 1_800_000_300, epochs: [0] };
const marked = {
  ...bank,
  toChange: [{ account: exposure.account, at: 1_800_000_300, fields: ["password"] }],
};

const exit = () => {
  const made = removeAndRotate(
    { accountId: jonas.id, edSecretKey: jonas.ed.secretKey },
    log,
    vaultId,
    max.id,
    trust,
    1_800_000_300,
    ring1.vaultKey,
  );
  if (!made.ok) throw new Error(made.error);
  const state = verifyLog(vaultId, [...logEntries, ...made.value.entries], trust);
  if (!state.ok) throw new Error(state.error);
  return state.value;
};
/** A device of p after the rotation: the new key to write, the old one to read what is left */
const after = (p: Person, older = [ring0]) => {
  const rotated = exit();
  return { ...contextFor(p), ring: ring1, older, log: rotated, lastSeen: rotated.hash };
};
const contentOf = (device: Device, entryId: Uint8Array) =>
  device.known.get(idKey(entryId))?.content;

/** Jonas saved the bank login and a note without secrets; then Max leaves */
const before = async () => {
  const server = memoryServer();
  let device = edit(emptyDevice(), e1, bank);
  device = edit(device, e2, note);
  device = (await sync(device, server, contextFor(jonas))).device;
  return { server, device };
};
const rotate = async () => {
  const { server, device } = await before();
  const rotated = await sync(rotateEntries(device, exposure), server, after(jonas));
  return { server, device: rotated.device, refused: rotated.refused };
};

describe("rotateEntries (P-11)", () => {
  it("writes every entry again in the new epoch, under a new entry key", async () => {
    const { server, device } = await rotate();
    expect(device.queue).toEqual([]);
    const records = server.pull();
    expect(records.map((r) => [r.version, r.epoch])).toEqual([
      [2, 1],
      [2, 1],
    ]);
    expect(device.known.get("e1".repeat(16))?.key?.epoch).toBe(1);
  });

  it("marks the secrets Max could read, and leaves an entry without secrets unmarked", async () => {
    const { device } = await rotate();
    expect(contentOf(device, e1)).toEqual(marked);
    expect(contentOf(device, e2)).toEqual(note);
    expect(contentOf(device, e2)).not.toHaveProperty("toChange");
  });

  it("lets Anna read the new versions with her new key, and Max not with his old one", async () => {
    const { server } = await rotate();
    const annas = await pull(emptyDevice(), server, after(anna));
    expect(annas.refused).toEqual([]);
    expect(contentOf(annas.device, e1)).toEqual(marked);
    for (const record of server.pull())
      expect(
        openEntryKey(vaultKey, record.entryKey, { vaultId, entryId: record.entryId, epoch: 1 }).ok,
      ).toBe(false);
  });

  it("writes a new entry still queued in the new epoch, unmarked: it never was on the server", async () => {
    const { server, device } = await before();
    const e3 = id(0xe3);
    const rotated = await sync(
      rotateEntries(edit(device, e3, bank), exposure),
      server,
      after(jonas),
    );
    expect(contentOf(rotated.device, e3)).toEqual(bank);
    expect(rotated.device.known.get(idKey(e3))?.key?.epoch).toBe(1);
  });

  it("marks nothing the person never had the key for", async () => {
    const { server, device } = await before();
    const none = await sync(
      rotateEntries(device, { ...exposure, epochs: [] }),
      server,
      after(jonas),
    );
    expect(contentOf(none.device, e1)).toEqual(bank);
  });

  it("takes a queued change along and marks it too", async () => {
    const { server, device } = await before();
    const changed = edit(device, e1, withField(bank, "user", "buero"));
    expect(rotateEntries(changed, exposure).queue.map((op) => idKey(op.entryId))).toEqual([
      idKey(e1),
      idKey(e2),
    ]);
    const rotated = await sync(rotateEntries(changed, exposure), server, after(jonas));
    expect(contentOf(rotated.device, e1)).toEqual({
      ...withField(bank, "user", "buero"),
      toChange: marked.toChange,
    });
  });

  it("marks what someone else wrote meanwhile in the old epoch: Max could read that too", async () => {
    const { server, device } = await before();
    await sync(
      edit(
        (await pull(emptyDevice(), server, contextFor(anna))).device,
        e1,
        withField(bank, "password", "Anna-2027!"),
      ),
      server,
      contextFor(anna),
    );
    const rotated = await sync(rotateEntries(device, exposure), server, after(jonas));
    const content = contentOf(rotated.device, e1);
    expect(content?.fields.find((f) => f.id === "password")?.value).toBe("Anna-2027!");
    expect(content?.toChange).toEqual(marked.toChange);
  });
});

describe("change marks after the rotation", () => {
  it("leave a secret once it gets a new value, and stay over other changes", async () => {
    const { server } = await rotate();
    const annas = (await pull(emptyDevice(), server, after(anna))).device;
    const user = await sync(edit(annas, e1, withField(bank, "user", "anna")), server, after(anna));
    expect(contentOf(user.device, e1)?.toChange).toEqual(marked.toChange);
    const changed = await sync(
      edit(user.device, e1, withField(withField(bank, "user", "anna"), "password", "Neu-2027!")),
      server,
      after(anna),
    );
    expect(contentOf(changed.device, e1)).not.toHaveProperty("toChange");
  });

  it("cannot be dropped by a dialog that knows nothing of them", async () => {
    const { device } = await rotate();
    const { toChange: _, ...plain } = marked;
    const edited = edit(device, e1, withField(plain, "user", "x"));
    expect(edited.queue[0]?.content.toChange).toEqual(marked.toChange);
    const twice = edit(edited, e1, withField(plain, "user", "y"));
    expect(twice.queue[0]?.content.toChange).toEqual(marked.toChange);
  });

  it("are no part of a new entry", () => {
    expect(edit(emptyDevice(), e1, marked).queue[0]?.content).toEqual(bank);
  });
});

describe("reading and writing around a rotation (E-26)", () => {
  it("reads versions not yet re-encrypted with the older key, and refuses them without it", async () => {
    const { server } = await before();
    expect((await pull(emptyDevice(), server, after(anna))).refused).toEqual([]);
    expect(
      (await pull(emptyDevice(), server, after(anna, []))).refused.map((r) => r.error),
    ).toEqual(["wrong-vault", "wrong-vault"]);
  });

  it("refuses a record of an epoch its log does not reach: a withheld rotation", async () => {
    const { server } = await rotate();
    const pulled = await pull(emptyDevice(), server, contextFor(anna));
    expect(pulled.refused).toEqual([
      { entryId: e1, version: 2, error: "newer-epoch" },
      { entryId: e2, version: 2, error: "newer-epoch" },
    ]);
  });

  it("writes nothing under a key the log has moved on from", async () => {
    const { server, device } = await before();
    const stale = { ...after(jonas), ring: ring0 };
    const synced = await sync(edit(device, e1, withField(bank, "password", "x")), server, stale);
    expect(synced.blocked).toBe("stale-key");
    expect(synced.device.queue).toHaveLength(1);
    expect(server.pull().map((r) => r.version)).toEqual([1, 1]);
    const ahead = { ...contextFor(jonas), ring: ring1 };
    expect((await sync(synced.device, server, ahead)).blocked).toBe("stale-key");
  });

  it("writes in the current epoch with lastSeen after the rotation", async () => {
    const { server } = await rotate();
    expect(server.pull().every((r) => encodeBytes(r.lastSeen) === encodeBytes(exit().hash))).toBe(
      true,
    );
    expect(encodeBytes(exit().hash)).not.toBe(encodeBytes(entryHash(logEntries[2] as never)));
  });
});
