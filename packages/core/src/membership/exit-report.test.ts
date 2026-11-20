import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { markForChange } from "../sync/change-marks.ts";
import {
  anna,
  bank,
  certificate,
  id,
  jonas,
  log,
  logEntries,
  max,
  sandra,
  trust,
  vaultId,
} from "../sync/test/fixtures.ts";
import { exitReport, exposureOf } from "./exit-report.ts";
import type { LogEntry } from "./log-entry.ts";
import { removeAndRotate } from "./rotation.ts";
import { addMember, changeAccess } from "./vault-ops.ts";
import { verifyLog } from "./verify-log.ts";

const signer = { accountId: jonas.id, edSecretKey: jonas.ed.secretKey };
const newKey = new Uint8Array(32).fill(0x66);
const ring1 = { vaultId, epoch: 1, vaultKey: newKey };
const checked = (entries: LogEntry[]) => {
  const state = verifyLog(vaultId, entries, trust);
  if (!state.ok) throw new Error(state.error);
  return state.value;
};
/** Max (reader since the fixtures) leaves at 1_800_000_300; then Sandra joins in epoch 1 */
const afterExit = () => {
  const exit = removeAndRotate(signer, log, vaultId, max.id, trust, 1_800_000_300, newKey);
  if (!exit.ok) throw new Error(exit.error);
  const entries = [...logEntries, ...exit.value.entries];
  const sandraIn = addMember(
    signer,
    checked(entries),
    ring1,
    certificate(sandra),
    { role: "edit", validUntil: 0 },
    1_800_000_400,
  );
  return [...entries, sandraIn.entry];
};

describe("exposureOf", () => {
  it("names the epochs, last role and time of someone who left", () => {
    expect(exposureOf(afterExit(), max.id)).toEqual({
      epochs: [0],
      role: "read",
      from: 1_800_000_002,
      until: 1_800_000_300,
    });
  });

  it("counts every epoch of a current member, from the creator's genesis on", () => {
    expect(exposureOf(afterExit(), jonas.id)).toEqual({
      epochs: [0, 1],
      role: "manage",
      from: 1_800_000_000,
      until: 0,
    });
    expect(exposureOf(afterExit(), sandra.id)).toEqual({
      epochs: [1],
      role: "edit",
      from: 1_800_000_400,
      until: 0,
    });
  });

  it("follows a role change, and a second add after leaving keeps the first time", () => {
    const entries = afterExit();
    const role = changeAccess(
      signer,
      checked(entries),
      vaultId,
      sandra.id,
      {
        role: "read",
        validUntil: 0,
      },
      1_800_000_500,
    );
    expect(exposureOf([...entries, role], sandra.id)?.role).toBe("read");
    // Sandra's role change is not Jonas's
    expect(exposureOf([...entries, role], jonas.id)?.role).toBe("manage");
    const back = addMember(
      signer,
      checked(entries),
      ring1,
      certificate(max),
      { role: "edit", validUntil: 0 },
      1_800_000_600,
    );
    expect(exposureOf([...entries, back.entry], max.id)).toEqual({
      epochs: [0, 1],
      role: "edit",
      from: 1_800_000_002,
      until: 0,
    });
  });

  it("knows nothing of someone never in the vault", () => {
    expect(exposureOf(afterExit(), id(0x77))).toBeUndefined();
  });
});

describe("exitReport (P-11)", () => {
  const pin = { id: "pin", name: "PIN", value: "4711", kind: "secret" as const };
  const entries = [
    { entryId: id(0xe1), content: bank, key: { epoch: 0 } },
    {
      entryId: id(0xe2),
      content: markForChange({ ...bank, title: "WLAN" }, encodeBytes(max.id), 1_800_000_300),
      key: { epoch: 1 },
    },
    { entryId: id(0xe3), content: { ...bank, title: "Neu" }, key: { epoch: 1 } },
    { entryId: id(0xe4), content: { ...bank, title: "Ohne Schlüssel" } },
    {
      entryId: id(0xe5),
      content: { ...bank, title: "Fremde Markierung", fields: [...bank.fields, pin] },
      key: { epoch: 2 },
    },
  ];
  const report = (accountId: Uint8Array) =>
    exitReport(accountId, [
      { vaultId, log: afterExit(), entries },
      { vaultId: id(0xb1), log: [], entries },
    ]);

  it("lists per vault the access and every entry the person could read, with its secrets", () => {
    expect(report(max.id)).toEqual([
      {
        vaultId,
        role: "read",
        from: 1_800_000_002,
        until: 1_800_000_300,
        entries: [
          { entryId: id(0xe1), title: "Sparkasse", type: "login", secrets: ["Passwort"] },
          { entryId: id(0xe2), title: "WLAN", type: "login", secrets: ["Passwort"] },
        ],
      },
    ]);
  });

  it("names every secret field, and leaves out an entry marked for someone else", () => {
    const marked = markForChange(entries[4]?.content ?? bank, encodeBytes(anna.id), 1);
    const own = exitReport(sandra.id, [
      {
        vaultId,
        log: afterExit(),
        entries: [{ entryId: id(0xe6), content: marked, key: { epoch: 1 } }],
      },
    ]);
    expect(own[0]?.entries[0]?.secrets).toEqual(["Passwort", "PIN"]);
    const both = markForChange(marked, encodeBytes(max.id), 2);
    const second = exitReport(max.id, [
      {
        vaultId,
        log: afterExit(),
        entries: [{ entryId: id(0xe6), content: both, key: { epoch: 2 } }],
      },
    ]);
    expect(second[0]?.entries.map((e) => e.title)).toEqual(["Fremde Markierung"]);
    const other = exitReport(max.id, [
      {
        vaultId,
        log: afterExit(),
        entries: [{ entryId: id(0xe6), content: marked, key: { epoch: 2 } }],
      },
    ]);
    expect(other[0]?.entries).toEqual([]);
  });

  it("says nothing about vaults the person was never in", () => {
    expect(report(id(0x77))).toEqual([]);
  });
});
