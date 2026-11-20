import { describe, expect, it } from "vitest";
import { newRelease } from "./release.ts";
import {
  EMPTY_STATE,
  installed,
  isNewer,
  isOlder,
  keptCaches,
  promoted,
  readState,
} from "./state.ts";

const release = (sequence: number) =>
  newRelease(new Map([["/index.html", new TextEncoder().encode(`v${sequence}`)]]), sequence);

describe("worker state", () => {
  it("reads anything unexpected as nothing held", () => {
    expect(readState(null)).toEqual(EMPTY_STATE);
    expect(readState("x")).toEqual(EMPTY_STATE);
    expect(readState({ current: { version: 1, sequence: 1 }, ready: { version: "a" } })).toEqual(
      EMPTY_STATE,
    );
    const current = { version: "a", sequence: 1 };
    expect(readState({ current })).toEqual({ ...EMPTY_STATE, current, highest: 1 });
  });

  it("remembers the highest sequence, even beyond the versions it still holds", () => {
    const current = { version: "a", sequence: 1 };
    expect(readState({ current, highest: 7 }).highest).toBe(7);
    expect(readState({ current, highest: "7" }).highest).toBe(1);
    const state = installed(EMPTY_STATE, release(3));
    expect(isOlder(state, release(2))).toBe(true);
    expect(isOlder(state, release(3))).toBe(false);
    expect(isNewer(promoted(state), release(3))).toBe(false);
  });

  it("keeps the version before when a new worker installs another release", () => {
    const first = installed(EMPTY_STATE, release(1));
    const again = installed(first, release(1));
    expect(again.previous).toBeNull();
    const second = installed(again, release(2));
    expect(second.previous).toEqual(first.current);
    expect(keptCaches(second)).toHaveLength(2);
  });

  it("promotes nothing without a ready version", () => {
    const state = installed(EMPTY_STATE, release(1));
    expect(promoted(state)).toBe(state);
  });
});
