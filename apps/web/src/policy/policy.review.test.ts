import { type AccountUpload, bytes, type Policy, signPolicy } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { stateServer } from "../session/state-server.test-kit.ts";
import { applyPolicy, type PolicyDeps } from "./policy.ts";

// Review of K-304 part 4: a server that withholds the policy after a reload must not lengthen the
// lock time (P-07: "Eine Richtlinie, die nicht besteht, ändert nichts: Der Client bleibt bei der
// letzten gültigen")
const COMPANY = "wMDAwMDAwMDAwMDAwMDAwA";

describe("applyPolicy after a reload (review)", () => {
  it("keeps the last valid lock time when the server withholds the policy later", async () => {
    let upload: AccountUpload | undefined;
    const base = fakeApi();
    const api = {
      ...base,
      setup: async (...args: Parameters<typeof base.setup>) => {
        upload = args[2];
        return base.setup(...args);
      },
    };
    const storage = memory();
    const firstScheduled: number[] = [];
    const first = createSession({
      api,
      storage,
      derive,
      schedule: (_run, ms) => firstScheduled.push(ms),
      cancel: () => {},
    });
    await first.setUp("richtiger-code", PASSPHRASE);
    const root = first.opened()?.state.rootSecretKey;
    if (!upload || !root) throw new Error("setup");
    const state = stateServer(upload);
    let served: Policy | null = signPolicy(root, {
      companyId: bytes(16).parse(COMPANY),
      version: 1,
      lockAfterMinutes: 2,
      companyRecovery: { enabled: false },
    });
    const server: PolicyDeps = {
      ...state.deps,
      company: async () => ({
        id: COMPANY,
        rootPublicKey: ed25519KeyPair(root).publicKey,
        policy: served,
      }),
      savePolicy: async () => true,
    };
    await applyPolicy(server, first);
    flush();
    expect(firstScheduled.at(-1)).toBe(2 * 60_000);
    expect(state.current().stateCounter).toBe(1);

    // The page reloads; the server now hands out no policy at all
    served = null;
    const scheduled: number[] = [];
    const reloaded = createSession({
      api: { ...api, keys: state.deps.keys },
      storage,
      derive,
      schedule: (_run, ms) => scheduled.push(ms),
      cancel: () => {},
    });
    expect((await reloaded.unlock(PASSPHRASE)).ok).toBe(true);
    flush();
    expect(reloaded.opened()?.state.policy).toBe(1);
    expect(await applyPolicy(server, reloaded)).toEqual({ ok: false, error: "older" });
    // The next use starts the lock timer: still the company's two minutes, not the ten without policy
    reloaded.touch();
    expect(scheduled.at(-1)).toBe(2 * 60_000);
  });
});
