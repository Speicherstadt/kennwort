import { saveState } from "@kennwort/client/session/state-sync.ts";
import { createCompany, emptyState, openState } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { derive } from "./session.test-kit.ts";
import { stateServer } from "./state-server.test-kit.ts";

// K-304: the account state written back, merged with what other devices wrote
const company = createCompany("Heizung Wasser Licht Kupfer", { derive });
const { owner } = company;
const holder = {
  accountKey: owner.accountKey,
  accountId: owner.accountId,
  token: "t",
  state: owner.state,
};
const addInvitation = (state: typeof owner.state) => ({
  ...state,
  invitations: { ...state.invitations, einladung: "anna" },
});

describe("saveState", () => {
  it("writes the changed state under the next counter, sealed under AK", async () => {
    const server = stateServer(owner.upload);
    const saved = await saveState(server.deps, holder, addInvitation);
    expect(saved.ok && saved.value.invitations).toEqual({ einladung: "anna" });
    const stored = server.current();
    expect(stored.stateCounter).toBe(1);
    const opened = openState(owner.accountKey, owner.accountId, 1, stored.state);
    expect(opened.ok && opened.value.invitations).toEqual({ einladung: "anna" });
  });

  it("keeps what another device wrote meanwhile and tries again after a stale answer", async () => {
    const server = stateServer(owner.upload);
    let first = true;
    const racing = {
      ...server.deps,
      writeState: async (token: string, sealed: Uint8Array, counter: number) => {
        if (first) {
          first = false;
          server.otherDeviceWrites(owner.accountKey, { ...owner.state, versions: { bank: 4 } });
        }
        return server.deps.writeState(token, sealed, counter);
      },
    };
    const saved = await saveState(racing, holder, addInvitation);
    expect(server.writes).toEqual([1, 2]);
    expect(saved.ok && saved.value.versions).toEqual({ bank: 4 });
    expect(saved.ok && saved.value.invitations).toEqual({ einladung: "anna" });
    expect(server.current().stateCounter).toBe(2);
  });

  it("gives up after three stale answers", async () => {
    const server = stateServer(owner.upload);
    const alwaysStale = {
      ...server.deps,
      writeState: async () => ({ ok: false as const, stale: true }),
    };
    let calls = 0;
    const counted = {
      ...alwaysStale,
      keys: async (token: string) => {
        calls++;
        return server.deps.keys(token);
      },
    };
    expect(await saveState(counted, holder, addInvitation)).toEqual({
      ok: false,
      error: "conflict",
    });
    expect(calls).toBe(3);
  });

  it("says when the server is not there or refuses otherwise", async () => {
    const server = stateServer(owner.upload);
    expect(
      await saveState({ ...server.deps, keys: async () => undefined }, holder, addInvitation),
    ).toEqual({
      ok: false,
      error: "unreachable",
    });
    const refused = {
      ...server.deps,
      writeState: async () => ({ ok: false as const, stale: false }),
    };
    expect(await saveState(refused, holder, addInvitation)).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("writes nothing when the change refuses the merged state", async () => {
    const server = stateServer(owner.upload);
    const seen: unknown[] = [];
    const refused = await saveState(server.deps, holder, (merged) => {
      seen.push(merged.rootFingerprint);
      return undefined;
    });
    expect(refused).toEqual({ ok: false, error: "refused" });
    expect(seen).toEqual([owner.state.rootFingerprint]);
    expect(server.writes).toEqual([]);
  });

  it("never overwrites a state that does not open or does not merge", async () => {
    const server = stateServer(owner.upload);
    const wrongKey = { ...holder, accountKey: new Uint8Array(32) };
    expect(await saveState(server.deps, wrongKey, addInvitation)).toEqual({
      ok: false,
      error: "damaged",
    });
    const otherRoot = { ...holder, state: emptyState(new Uint8Array(32).fill(9)) };
    expect(await saveState(server.deps, otherRoot, addInvitation)).toEqual({
      ok: false,
      error: "damaged",
    });
    expect(server.writes).toEqual([]);
  });
});
