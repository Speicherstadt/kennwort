import { passphraseKeysWith } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { Api } from "./api.ts";
import { createSession } from "./session.ts";

// Review of K-303: /setup and /invite stay reachable while an account is unlocked (app.tsx). Opening
// a second account replaces the first without locking it, so the first account key is never
// overwritten (session.ts promises that nothing usable lingers once it is dropped).
const derive = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Heizung Wasser Licht Kupfer";

const api: Api = {
  setup: async () => ({ ok: true, value: "token-1" }),
  accept: async () => ({ ok: true, value: "token-2" }),
  uploadKeys: async () => true,
  keys: async () => undefined,
  signIn: async () => ({ ok: false, error: "denied" }),
  signInWithRecovery: async () => ({ ok: false, error: "denied" }),
  replaceUnlock: async () => false,
};

describe("session replaced by another account", () => {
  it("overwrites the account key of the account it drops", async () => {
    const session = createSession({ api, storage: undefined, derive });
    await session.setUp("code", PASSPHRASE);
    const first = session.opened()?.accountKey as Uint8Array;
    await session.accept("inv-1", "einladung", new Uint8Array(32).fill(7), PASSPHRASE);
    expect(session.opened()?.accountKey).not.toBe(first);
    expect(first.every((byte) => byte === 0)).toBe(true);
  });
});
