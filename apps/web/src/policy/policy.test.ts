import {
  applyPolicy,
  loadPolicy,
  type PolicyDeps,
  saveLockTime,
} from "@kennwort/client/policy/policy.ts";
import { type AccountUpload, bytes, encodeBytes, type Policy, signPolicy } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { stateServer } from "../session/state-server.test-kit.ts";

// K-304 part 4: Jonas sets the lock time for Weber Haustechnik; every device checks and applies it
const COMPANY = "wMDAwMDAwMDAwMDAwMDAwA";

const jonas = async (lockAfterMs?: number) => {
  let upload: AccountUpload | undefined;
  const scheduled: number[] = [];
  const api = fakeApi({
    setup: async (_c, _id, u) => {
      upload = u;
      return { ok: true, value: "token-1" };
    },
  });
  const session = createSession({
    api,
    storage: memory(),
    derive,
    ...(lockAfterMs ? { lockAfterMs } : {}),
    schedule: (_run, ms) => scheduled.push(ms),
    // No time passes here; the lock time counts from the last use (session.ts)
    now: () => 0,
    cancel: () => {},
  });
  await session.setUp("richtiger-code", PASSPHRASE);
  const opened = session.opened();
  const root = opened?.state.rootSecretKey;
  if (!opened || !upload || !root) throw new Error("setup");
  return {
    session,
    opened,
    upload,
    root,
    scheduled,
    rootPublicKey: ed25519KeyPair(root).publicKey,
  };
};

const companyServer = (j: Awaited<ReturnType<typeof jonas>>, initial: Policy | null = null) => {
  let policy = initial;
  const state = stateServer(j.upload);
  const saved: Policy[] = [];
  const api: PolicyDeps = {
    ...state.deps,
    company: async () => ({
      id: COMPANY,
      rootPublicKey: j.rootPublicKey,
      policy,
      recoveryPublicKey: null,
    }),
    savePolicy: async (_token, next) => {
      saved.push(next);
      policy = next;
      return true;
    },
  };
  return { api, saved, state, serve: (next: Policy | null) => (policy = next) };
};

const signed = (root: Uint8Array, version: number, lockAfterMinutes: number) =>
  signPolicy(root, {
    companyId: bytes(16).parse(COMPANY),
    version,
    lockAfterMinutes,
    companyRecovery: { enabled: false },
  });

describe("applyPolicy", () => {
  it("locks after the company's time and remembers the version for every device", async () => {
    const j = await jonas();
    const s = companyServer(j, signed(j.root, 2, 3));
    const applied = await applyPolicy(s.api, j.session);
    expect(applied.ok && applied.value.lockAfterMinutes).toBe(3);
    expect(j.scheduled.at(-1)).toBe(3 * 60_000);
    flush();
    expect(j.session.opened()?.state.policy).toBe(2);
    expect(s.state.current().stateCounter).toBe(1);
    // The same version again writes nothing
    await applyPolicy(s.api, j.session);
    expect(s.state.current().stateCounter).toBe(1);
  });

  it("keeps ten minutes while the company has no policy", async () => {
    const j = await jonas();
    const applied = await applyPolicy(companyServer(j).api, j.session);
    expect(applied.ok && applied.value.version).toBe(0);
    expect(j.scheduled.at(-1)).toBe(10 * 60_000);
  });

  it("stays with the last valid lock time for a policy that is older, unsigned or missing", async () => {
    const j = await jonas(7 * 60_000);
    const s = companyServer(j, signed(j.root, 3, 5));
    await applyPolicy(s.api, j.session);
    flush();
    expect(j.session.opened()?.state.policyLock).toBe(5);
    s.serve(signed(j.root, 2, 60));
    expect(await applyPolicy(s.api, j.session)).toEqual({ ok: false, error: "older" });
    s.serve(signed(ed25519KeyPair().secretKey, 9, 60));
    expect(await applyPolicy(s.api, j.session)).toEqual({ ok: false, error: "not-signed" });
    s.serve(null);
    expect(await applyPolicy(s.api, j.session)).toEqual({ ok: false, error: "older" });
    expect(j.scheduled.at(-1)).toBe(5 * 60_000);
  });

  it("says when the server is not there or its root key is not the pinned one", async () => {
    const j = await jonas();
    const s = companyServer(j);
    expect(await applyPolicy({ ...s.api, company: async () => undefined }, j.session)).toEqual({
      ok: false,
      error: "unreachable",
    });
    const lying = {
      ...s.api,
      company: async () => ({
        id: COMPANY,
        rootPublicKey: ed25519KeyPair().publicKey,
        policy: null,
        recoveryPublicKey: null,
      }),
    };
    expect(await loadPolicy(lying, j.opened)).toEqual({ ok: false, error: "root-mismatch" });
    j.session.lock();
    flush();
    expect(await applyPolicy(s.api, j.session)).toEqual({ ok: false, error: "unreachable" });
  });
});

describe("saveLockTime", () => {
  it("signs the next version with the root key and applies it", async () => {
    const j = await jonas();
    const s = companyServer(j, signed(j.root, 4, 10));
    expect(await saveLockTime(s.api, j.session, 2)).toBe(true);
    expect(s.saved.map((p) => [p.version, p.lockAfterMinutes])).toEqual([[5, 2]]);
    expect(encodeBytes(s.saved[0]?.companyId ?? new Uint8Array())).toBe(COMPANY);
    expect(j.scheduled.at(-1)).toBe(2 * 60_000);
  });

  it("saves nothing without a valid current policy or when the server refuses", async () => {
    const j = await jonas();
    const s = companyServer(j, signed(ed25519KeyPair().secretKey, 1, 10));
    expect(await saveLockTime(s.api, j.session, 2)).toBe(false);
    s.serve(null);
    expect(await saveLockTime({ ...s.api, savePolicy: async () => false }, j.session, 2)).toBe(
      false,
    );
    expect(s.saved).toHaveLength(0);
  });
});

// Review of #82: a load that left before the owner saved a new lock time answers with the old one
describe("applyPolicy that loaded before a newer policy was applied", () => {
  it("keeps the newer lock time instead of the one the slower load brought back", async () => {
    const j = await jonas();
    const s = companyServer(j, signed(j.root, 4, 10));
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: PolicyDeps = {
      ...s.api,
      company: async (token) => {
        const answer = await s.api.company(token);
        await gate;
        return answer;
      },
    };
    const late = applyPolicy(slow, j.session);
    expect(await saveLockTime(s.api, j.session, 2)).toBe(true);
    flush();
    expect(j.session.opened()?.state.policy).toBe(5);
    release();
    await late;
    expect(j.scheduled.at(-1)).toBe(2 * 60_000);
  });

  it("falls back to the newer lock time when the slower load finds no server", async () => {
    const j = await jonas();
    const s = companyServer(j, signed(j.root, 4, 10));
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const away: PolicyDeps = {
      ...s.api,
      company: async () => {
        await gate;
        return undefined;
      },
    };
    await applyPolicy(s.api, j.session);
    flush();
    const late = applyPolicy(away, j.session);
    expect(await saveLockTime(s.api, j.session, 2)).toBe(true);
    flush();
    release();
    expect(await late).toEqual({ ok: false, error: "unreachable" });
    expect(j.scheduled.at(-1)).toBe(2 * 60_000);
  });
});
