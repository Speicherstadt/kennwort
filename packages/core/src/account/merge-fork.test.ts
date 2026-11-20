// Regression (review of K-303): mergeStates silently keeps the own log head when the other device remembers a different
// hash at the same seq. docs/sicherheitsdesign.md P-06: "ein anderer Hash an bekannter Stelle ist ein
// Angriff, kein Update"; the account state exists so every device of an account knows what the
// others checked. A server that forks a vault's log between two devices of one account (E-08) is
// caught exactly here, yet the merge drops the evidence instead of refusing like other-root/-bundle.
import { describe, expect, it } from "vitest";
import { type AccountState, emptyState, mergeStates } from "./state.ts";

describe("merging account states after a forked log", () => {
  it("refuses a different hash at a known seq instead of silently keeping the own one", () => {
    const root = new Uint8Array(32).fill(1);
    const laptop: AccountState = {
      ...emptyState(root),
      logs: { buero: { seq: 3, hash: new Uint8Array(32).fill(3) } },
    };
    const phone: AccountState = {
      ...emptyState(root),
      logs: { buero: { seq: 3, hash: new Uint8Array(32).fill(9) } },
    };
    expect(mergeStates(laptop, phone).ok).toBe(false);
  });
});
