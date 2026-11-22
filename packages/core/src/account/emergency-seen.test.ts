import { describe, expect, it } from "vitest";
import {
  type EmergencySeen,
  isReplayed,
  mergeEmergency,
  noteGrant,
  noteObjection,
  noteRevocation,
} from "./emergency-seen.ts";

const seen = (grant: number, revoked = false, objected = 0): EmergencySeen => ({
  grant,
  revoked,
  objected,
});

describe("what a grantee remembers of emergency access (P-14)", () => {
  it("calls a grant replayed when it is older than the newest seen, or that one revoked", () => {
    expect(isReplayed(undefined, 0)).toBe(false);
    expect(isReplayed(seen(10), 9)).toBe(true);
    expect(isReplayed(seen(10), 10)).toBe(false);
    expect(isReplayed(seen(10), 11)).toBe(false);
    expect(isReplayed(seen(10, true), 10)).toBe(true);
    expect(isReplayed(seen(10, true), 11)).toBe(false);
  });

  it("takes a newer grant in place of the remembered one, keeping the objections", () => {
    expect(noteGrant(undefined, 10)).toEqual(seen(10));
    expect(noteGrant(seen(10, true, 4), 11)).toEqual(seen(11, false, 4));
    expect(noteGrant(seen(10, false, 4), 10)).toEqual(seen(10, false, 4));
    expect(noteGrant(seen(10, true, 4), 10)).toEqual(seen(10, true, 4));
    expect(noteGrant(seen(10, false, 4), 9)).toEqual(seen(10, false, 4));
    expect(noteGrant(undefined, 0)).toEqual(seen(0));
  });

  it("marks the grant of a revocation revoked, unless a newer grant is known", () => {
    expect(noteRevocation(undefined, 10)).toEqual(seen(10, true));
    expect(noteRevocation(seen(10, false, 4), 10)).toEqual(seen(10, true, 4));
    expect(noteRevocation(seen(10, false, 4), 12)).toEqual(seen(12, true, 4));
    expect(noteRevocation(seen(10, false, 4), 9)).toEqual(seen(10, false, 4));
  });

  it("remembers the newest objected request", () => {
    expect(noteObjection(undefined, 7)).toEqual(seen(0, false, 7));
    expect(noteObjection(seen(10, true, 9), 7)).toEqual(seen(10, true, 9));
    expect(noteObjection(seen(10, true, 5), 7)).toEqual(seen(10, true, 7));
  });

  it("merges two devices: the newer grant, a revocation of the same one from either side", () => {
    expect(
      mergeEmergency(
        { jonas: seen(10, false, 2), anna: seen(3) },
        { jonas: seen(10, true, 1), max: seen(4) },
      ),
    ).toEqual({ jonas: seen(10, true, 2), anna: seen(3), max: seen(4) });
    expect(mergeEmergency({ jonas: seen(10, true, 1) }, { jonas: seen(10, false, 5) })).toEqual({
      jonas: seen(10, true, 5),
    });
    expect(mergeEmergency({ jonas: seen(10, true, 1) }, { jonas: seen(12, false, 0) })).toEqual({
      jonas: seen(12, false, 1),
    });
    expect(mergeEmergency({ jonas: seen(12, false, 0) }, { jonas: seen(10, true, 3) })).toEqual({
      jonas: seen(12, false, 3),
    });
    expect(mergeEmergency({ jonas: seen(12, true, 0) }, { jonas: seen(10, false, 3) })).toEqual({
      jonas: seen(12, true, 3),
    });
    expect(mergeEmergency({ jonas: seen(10, false, 0) }, { jonas: seen(12, true, 3) })).toEqual({
      jonas: seen(12, true, 3),
    });
    expect(mergeEmergency({ jonas: seen(10, false) }, { jonas: seen(10, false) })).toEqual({
      jonas: seen(10, false),
    });
  });
});
