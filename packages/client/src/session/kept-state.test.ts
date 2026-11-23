import { emptyState, openState, sealState } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { mergedState, withKeptState } from "./kept-state.ts";

const accountKey = new Uint8Array(32).fill(5);
const accountId = new Uint8Array(16).fill(7);
const root = new Uint8Array(32).fill(1);
const base = emptyState(root);
const opened = { accountKey, accountId, state: base };

describe("the account state a device kept", () => {
  it("merges the higher of each into the served one", () => {
    expect(mergedState({ ...base, policy: 4 }, { ...base, policy: 2 }).policy).toBe(4);
    expect(mergedState({ ...base, policy: 1 }, { ...base, policy: 3 }).policy).toBe(3);
  });

  it("keeps its own when the served one does not merge (another root)", () => {
    const mine = { ...base, policy: 4 };
    expect(mergedState(mine, emptyState(new Uint8Array(32).fill(2)))).toBe(mine);
  });

  it("is merged into what the server serves, and sealed again under the higher counter", () => {
    const kept = {
      counter: 9,
      sealed: sealState(accountKey, accountId, 9, { ...base, policy: 5 }),
    };
    const result = withKeptState({ ...opened, state: { ...base, policy: 2 } }, kept, 3);
    expect(result.state.policy).toBe(5);
    expect(result.kept.counter).toBe(9);
    const reopened = openState(accountKey, accountId, 9, result.kept.sealed);
    expect(reopened.ok && reopened.value.policy).toBe(5);
  });

  it("takes the served counter when it is higher than the kept one", () => {
    const kept = { counter: 1, sealed: sealState(accountKey, accountId, 1, base) };
    expect(withKeptState(opened, kept, 6).kept.counter).toBe(6);
  });

  it("ignores a kept state of another account or a damaged one, and keeps the served one", () => {
    const other = new Uint8Array(16).fill(8);
    const foreign = { counter: 2, sealed: sealState(accountKey, other, 2, { ...base, policy: 9 }) };
    const served = { ...opened, state: { ...base, policy: 1 } };
    const result = withKeptState(served, foreign, 2);
    expect(result.state.policy).toBe(1);
    const reopened = openState(accountKey, accountId, 2, result.kept.sealed);
    expect(reopened.ok && reopened.value.policy).toBe(1);
    expect(withKeptState(served, undefined, 0).state.policy).toBe(1);
  });
});
