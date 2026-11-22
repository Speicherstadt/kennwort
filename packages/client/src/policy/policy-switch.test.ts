import { describe, expect, it } from "vitest";
import type { Opened } from "../session/open-account.ts";
import { applyPolicy, type PolicyAccount, type PolicyDeps } from "./policy.ts";

// Only what applyPolicy reads of an account: its ID, token and the lock time its state remembers
const account = (id: number, token: string, policyLock: number) =>
  ({
    accountId: new Uint8Array(16).fill(id),
    token,
    state: { policyLock, policy: 0 },
  }) as unknown as Opened;

const switching = (first: Opened, next: Opened) => {
  let current: Opened | undefined = first;
  const set: number[] = [];
  const session = {
    opened: () => current,
    setLockAfter: (ms: number) => set.push(ms),
  } as unknown as PolicyAccount;
  const api = {
    company: async () => {
      current = next;
      return null;
    },
  } as unknown as PolicyDeps;
  return { set, run: () => applyPolicy(api, session) };
};

// Review of the lock-time fix (#80): the policy loads while another account opens on this device;
// what was loaded for the first account must not set the second one's lock time
describe("applyPolicy across an account switch", () => {
  it("leaves the lock time alone when another account opened while it loaded", async () => {
    const { set, run } = switching(account(1, "token-a", 60), account(2, "token-b", 2));
    await run();
    expect(set).toEqual([]);
  });

  it("still applies it to the same account under a newer state", async () => {
    const { set, run } = switching(account(1, "token-a", 60), account(1, "token-a2", 60));
    await run();
    expect(set).toEqual([60 * 60_000]);
  });
});
