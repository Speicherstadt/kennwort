import { ed25519KeyPair, rootFingerprint } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import {
  LeakCheckChoice,
  laterChoice,
  laterMonth,
  leakCheckOn,
  mergeSecurityPrefs,
  monthOf,
  ReportMonth,
  reportDue,
} from "./security-prefs.ts";
import { emptyState, mergeStates, openState, sealState } from "./state.ts";

const on = (at: number) => ({ on: true, at });
const off = (at: number) => ({ on: false, at });

// K-603: the leak check's opt-in and the report month, in the sealed account state
describe("security settings in the account state", () => {
  it("takes the later choice between two devices; at the same moment off wins", () => {
    expect(laterChoice(undefined, undefined)).toBeUndefined();
    expect(laterChoice(on(5), undefined)).toEqual(on(5));
    expect(laterChoice(undefined, off(5))).toEqual(off(5));
    expect(laterChoice(on(5), off(6))).toEqual(off(6));
    expect(laterChoice(off(6), on(5))).toEqual(off(6));
    expect(laterChoice(on(7), off(6))).toEqual(on(7));
    expect(laterChoice(off(6), on(7))).toEqual(on(7));
    expect(laterChoice(on(6), off(6))).toEqual(off(6));
    expect(laterChoice(off(6), on(6))).toEqual(off(6));
    expect(laterChoice(on(6), on(6))).toEqual(on(6));
  });

  it("takes the later month", () => {
    expect(laterMonth(undefined, undefined)).toBeUndefined();
    expect(laterMonth("2026-10", undefined)).toBe("2026-10");
    expect(laterMonth(undefined, "2026-10")).toBe("2026-10");
    expect(laterMonth("2026-10", "2026-11")).toBe("2026-11");
    expect(laterMonth("2026-11", "2026-10")).toBe("2026-11");
    expect(laterMonth("2026-12", "2027-01")).toBe("2027-01");
  });

  it("merges only what is set", () => {
    expect(mergeSecurityPrefs({}, {})).toEqual({});
    expect(mergeSecurityPrefs({ leakCheck: on(1) }, { reportSeen: "2026-11" })).toEqual({
      leakCheck: on(1),
      reportSeen: "2026-11",
    });
  });

  it("counts the check as on only once switched on", () => {
    expect(leakCheckOn({})).toBe(false);
    expect(leakCheckOn({ leakCheck: off(3) })).toBe(false);
    expect(leakCheckOn({ leakCheck: on(3) })).toBe(true);
  });

  it("names a moment's month in UTC", () => {
    expect(monthOf(Date.UTC(2026, 10, 30, 23, 59))).toBe("2026-11");
    expect(monthOf(Date.UTC(2026, 11, 1, 0, 0))).toBe("2026-12");
  });

  it("makes a report due when none was seen or the one seen is from an earlier month", () => {
    const now = Date.UTC(2026, 10, 22);
    expect(reportDue(undefined, now)).toBe(true);
    expect(reportDue("2026-10", now)).toBe(true);
    expect(reportDue("2026-11", now)).toBe(false);
    expect(reportDue("2026-12", now)).toBe(false);
  });

  it("reads only well-formed choices and months", () => {
    expect(ReportMonth.safeParse("2026-11").success).toBe(true);
    for (const month of ["2026-13", "2026-00", "2026-1", "26-11", "2026-11-01", "x2026-11"])
      expect(ReportMonth.safeParse(month).success).toBe(false);
    expect(LeakCheckChoice.safeParse({ on: true, at: 1 }).success).toBe(true);
    expect(LeakCheckChoice.safeParse({ on: "yes", at: 1 }).success).toBe(false);
    expect(LeakCheckChoice.safeParse({ on: true, at: -1 }).success).toBe(false);
    expect(LeakCheckChoice.safeParse({ on: true, at: 1.5 }).success).toBe(false);
  });

  it("travels sealed in the account state and merges there; a state without them reads as off", () => {
    const root = rootFingerprint(ed25519KeyPair(new Uint8Array(32).fill(7)).publicKey);
    const key = new Uint8Array(32).fill(9);
    const account = new Uint8Array(16).fill(4);
    const mine = { ...emptyState(root), leakCheck: on(10), reportSeen: "2026-10" };
    expect(openState(key, account, 1, sealState(key, account, 1, mine))).toEqual({
      ok: true,
      value: mine,
    });
    const theirs = { ...emptyState(root), leakCheck: off(12), reportSeen: "2026-11" };
    const merged = mergeStates(mine, theirs);
    expect(merged.ok && merged.value.leakCheck).toEqual(off(12));
    expect(merged.ok && merged.value.reportSeen).toBe("2026-11");
    const plain = mergeStates(emptyState(root), emptyState(root));
    expect(plain.ok && "leakCheck" in plain.value).toBe(false);
    expect(plain.ok && leakCheckOn(plain.value)).toBe(false);
  });
});
