/** A server's account state in memory for the tests: the next counter only, else stale */
import type { StateWrite } from "@kennwort/client/session/members-api.ts";
import type { StateDeps } from "@kennwort/client/session/state-sync.ts";
import { type Stored, sealState } from "@kennwort/core";

export const stateServer = (upload: Stored) => {
  let stored: Stored = { ...upload };
  const writes: number[] = [];
  const deps: StateDeps = {
    keys: async () => stored,
    writeState: async (_token, sealed, counter): Promise<StateWrite> => {
      writes.push(counter);
      if (counter !== stored.stateCounter + 1) return { ok: false, stale: true };
      stored = { ...stored, state: sealed, stateCounter: counter };
      return { ok: true };
    },
  };
  /** Another device writes first: the server moves on without this one */
  const otherDeviceWrites = (accountKey: Uint8Array, state: Parameters<typeof sealState>[3]) => {
    const counter = stored.stateCounter + 1;
    stored = {
      ...stored,
      state: sealState(accountKey, upload.accountId, counter, state),
      stateCounter: counter,
    };
  };
  return { deps, writes, otherDeviceWrites, current: () => stored };
};
