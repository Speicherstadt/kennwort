// Two changes to the account state at once (K-707: setting up a passkey while the members page
// remembers a bundle): the open account keeps both, not only the one that finished last
import {
  type AccountState,
  addPasskey,
  emptyState,
  encodeBytes,
  openState,
  type Stored,
  sealState,
} from "@kennwort/core";
import { newAccountKey, newKeyBlock } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { type Opened, stateUpdater } from "./open-account.ts";
import type { StateDeps } from "./state-sync.ts";

const root = new Uint8Array(32).fill(2);
const accountId = new Uint8Array(16).fill(1);

const fakeServer = (accountKey: Uint8Array) => {
  let counter = 0;
  let sealed = sealState(accountKey, accountId, 0, emptyState(root));
  const api: StateDeps = {
    keys: async () =>
      ({
        accountId,
        accountSalt: new Uint8Array(16),
        keyBlock: new Uint8Array(),
        state: sealed,
        stateCounter: counter,
        unlock: { passphrase: new Uint8Array(), recovery: new Uint8Array() },
      }) satisfies Stored,
    writeState: async (_token, next, nextCounter) => {
      await Promise.resolve();
      if (nextCounter !== counter + 1) return { ok: false, stale: true };
      sealed = next;
      counter = nextCounter;
      return { ok: true };
    },
  };
  const state = () => {
    const read = openState(accountKey, accountId, counter, sealed);
    if (!read.ok) throw new Error(read.error);
    return read.value;
  };
  return { api, state };
};

describe("stateUpdater", () => {
  it("keeps a change that finished while another one replaced the open account", async () => {
    const accountKey = newAccountKey();
    const server = fakeServer(accountKey);
    let current: Opened = {
      accountId,
      accountKey,
      keyBlock: newKeyBlock(root),
      state: emptyState(root),
      token: "t",
    };
    const opened = () => current;
    const update = stateUpdater(opened, (value) => {
      current = value;
    });
    const passkey = (state: AccountState) => ({
      ...state,
      passkeys: addPasskey(state.passkeys, new Uint8Array(20).fill(3), new Uint8Array(32), 1) ?? {},
    });
    const bundle = (state: AccountState) => ({
      ...state,
      bundles: { ...state.bundles, anna: new Uint8Array(32).fill(4) },
    });
    const [first, second] = await Promise.all([
      update(server.api, passkey),
      update(server.api, bundle),
    ]);
    expect(first.ok && second.ok).toBe(true);
    const id = encodeBytes(new Uint8Array(20).fill(3));
    expect(Object.keys(server.state().passkeys)).toEqual([id]);
    expect(Object.keys(server.state().bundles)).toEqual(["anna"]);
    expect(Object.keys(current.state.passkeys)).toEqual([id]);
    expect(Object.keys(current.state.bundles)).toEqual(["anna"]);
  });
});
