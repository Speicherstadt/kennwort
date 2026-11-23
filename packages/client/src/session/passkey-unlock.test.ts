// K-707 (P-03): Anna sets up a passkey to unlock and unlocks with it; the server sees only the
// sealed AK, never the PRF output, and a server that tampers with the sealed AK opens nothing
import {
  type AccountState,
  bytes,
  createAccount,
  emptyState,
  encodeBytes,
  openState,
  type Stored,
  StoredWire,
  unlockWithPassphrase,
} from "@kennwort/core";
import { passphraseKeysWith } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { memberCalls } from "./members-api.ts";
import { type Opened, stateUpdater } from "./open-account.ts";
import {
  type PasskeyDeps,
  type PasskeyDevice,
  removePasskeyUnlock,
  setUpPasskeyUnlock,
  unlockWithPasskeyOnline,
  type WebAuthn,
} from "./passkey-unlock.ts";
import type { StateDeps } from "./state-sync.ts";
import { fromBase64Url } from "./webauthn-json.ts";

const quick = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Anna Heizung Bad Fliese";
const rawId = new Uint8Array(20).fill(3);
const credentialId = encodeBytes(rawId);
const prfOutput = () => new Uint8Array(32).fill(6);

type Sent = { method: string; path: string; body?: unknown; token?: string | undefined };

/** Anna's account as the server holds it, the calls it answers, and what it was sent */
const server = (options: { tamper?: boolean; failPut?: boolean; failState?: boolean } = {}) => {
  const account = createAccount(PASSPHRASE, emptyState(new Uint8Array(32).fill(2)), {
    derive: quick,
  });
  const u = account.upload;
  let state = u.state;
  let stateCounter = u.stateCounter;
  let sealed: Uint8Array | undefined;
  const sent: Sent[] = [];
  const stored = (): Stored => ({
    accountId: account.accountId,
    accountSalt: u.accountSalt,
    keyBlock: u.keyBlock,
    state,
    stateCounter,
    unlock: {
      passphrase: u.unlock.passphrase,
      recovery: u.unlock.recovery,
      passkeys: sealed ? [{ credentialId: rawId, sealed: tampered(sealed) }] : [],
    },
  });
  const tampered = (bytes: Uint8Array) => {
    if (!options.tamper) return bytes;
    const copy = Uint8Array.from(bytes);
    copy[30] = (copy[30] ?? 0) ^ 1;
    return copy;
  };
  const wire = () => {
    const s = stored();
    return {
      accountId: encodeBytes(s.accountId),
      accountSalt: encodeBytes(s.accountSalt),
      keyBlock: encodeBytes(s.keyBlock),
      state: encodeBytes(s.state),
      stateCounter: s.stateCounter,
      unlock: {
        passphrase: encodeBytes(s.unlock.passphrase),
        recovery: encodeBytes(s.unlock.recovery),
        passkeys: (s.unlock.passkeys ?? []).map((p) => ({
          credentialId: encodeBytes(p.credentialId),
          sealed: encodeBytes(p.sealed),
        })),
      },
    };
  };
  const call: Call = async (method, path, body, token) => {
    sent.push({ method, path, body, token });
    if (path.startsWith("/auth/passkey/generate-register-options"))
      return {
        status: 200,
        json: {
          challenge: "Y2hhbGxlbmdl",
          rp: { id: "localhost", name: "Kennwort" },
          user: { id: "dXNlcg", name: "anna", displayName: "anna" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          excludeCredentials: [{ id: "b2xk", type: "public-key" }],
          authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        },
      };
    if (path === "/auth/passkey/verify-registration") return { status: 200, json: { id: "pk" } };
    if (path === "/auth/passkey/generate-authenticate-options")
      return { status: 200, json: { challenge: "Y2hhbGxlbmdl", rpId: "localhost" } };
    if (path === "/auth/passkey/verify-authentication")
      return {
        status: 200,
        json: { session: { token: "passkey-token" }, user: { id: encodeBytes(account.accountId) } },
      };
    if (path === "/api/account/unlock-passkeys" && method === "PUT") {
      if (options.failPut) return { status: 500, json: undefined };
      sealed = bytes().parse((body as { sealed: string }).sealed);
      return { status: 201, json: { stored: true } };
    }
    if (path.startsWith("/api/account/unlock-passkeys/") && method === "DELETE") {
      sealed = undefined;
      return { status: 200, json: { removed: true } };
    }
    if (path === "/api/account/keys") return { status: 200, json: wire() };
    if (path === "/api/account/state") {
      if (options.failState) return { status: 500, json: undefined };
      const next = body as { state: string; stateCounter: number };
      state = bytes().parse(next.state);
      stateCounter = next.stateCounter;
      return { status: 200, json: { stored: true } };
    }
    return { status: 404, json: undefined };
  };
  const opened = (): Opened => {
    const unlocked = unlockWithPassphrase(stored(), PASSPHRASE, account.secretKey, quick);
    if (!unlocked.ok) throw new Error(unlocked.error);
    return { ...unlocked.value, accountId: account.accountId, token: "anna-token" };
  };
  const stateNow = (accountKey: Uint8Array) => {
    const read = openState(accountKey, account.accountId, stateCounter, state);
    if (!read.ok) throw new Error(read.error);
    return read.value;
  };
  return { account, call, sent, opened, stateNow, stored };
};

/** An authenticator with PRF, or without, as a CDP virtual one behaves */
const authenticator = (
  prf: "results" | "enabled" | "none" | "cancel" = "results",
): WebAuthn & {
  calls: { kind: string; options: unknown }[];
} => {
  const calls: { kind: string; options: unknown }[] = [];
  const credential = (results: Record<string, unknown>, response: Record<string, ArrayBuffer>) => ({
    id: credentialId,
    rawId: rawId.buffer.slice(0) as ArrayBuffer,
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: new Uint8Array([1]).buffer,
      ...response,
      getTransports: () => ["internal"],
    },
    getClientExtensionResults: () => results,
  });
  return {
    calls,
    create: async (options) => {
      calls.push({ kind: "create", options });
      if (prf === "cancel") throw new DOMException("cancelled", "NotAllowedError");
      return credential(
        prf === "none"
          ? {}
          : prf === "results"
            ? { prf: { enabled: true, results: { first: prfOutput().buffer } } }
            : { prf: { enabled: true } },
        { attestationObject: new Uint8Array([2]).buffer },
      );
    },
    get: async (options) => {
      calls.push({ kind: "get", options });
      if (prf === "cancel") throw new DOMException("cancelled", "NotAllowedError");
      return credential(prf === "none" ? {} : { prf: { results: { first: prfOutput().buffer } } }, {
        authenticatorData: new Uint8Array([3]).buffer,
        signature: new Uint8Array([4]).buffer,
        userHandle: new Uint8Array([5]).buffer,
      });
    },
  };
};

const stateApi = (call: Call): StateDeps => ({
  keys: async (token) => {
    const parsed = StoredWire.safeParse(
      (await call("GET", "/api/account/keys", undefined, token)).json,
    );
    return parsed.success ? parsed.data : undefined;
  },
  writeState: memberCalls(call).writeState,
});

const deps = (s: ReturnType<typeof server>, webAuthn: WebAuthn): PasskeyDeps => ({
  call: s.call,
  api: stateApi(s.call),
  webAuthn,
  random: (length) => new Uint8Array(length).fill(5),
  now: () => 1000,
});

const setUp = async (s: ReturnType<typeof server>, webAuthn = authenticator()) => {
  let current = s.opened();
  const opened = () => current;
  const updateState = stateUpdater(opened, (value) => {
    current = value;
  });
  const result = await setUpPasskeyUnlock(deps(s, webAuthn), { opened, updateState });
  return { result, current: opened, updateState };
};

describe("setting up a passkey to unlock (K-707)", () => {
  it("registers with PRF, seals AK under its output and names it in the state", async () => {
    const s = server();
    const webAuthn = authenticator();
    const { result, current } = await setUp(s, webAuthn);
    expect(result).toEqual({
      ok: true,
      value: {
        accountId: encodeBytes(s.account.accountId),
        credentialId,
        salt: encodeBytes(new Uint8Array(32).fill(5)),
      },
    });
    const create = webAuthn.calls[0]?.options as CredentialCreationOptions;
    const salt = create.publicKey?.extensions?.prf?.eval?.first as Uint8Array;
    expect(salt).toEqual(new Uint8Array(32).fill(5));
    expect(new Uint8Array(create.publicKey?.challenge as ArrayBuffer)).toEqual(
      fromBase64Url("Y2hhbGxlbmdl"),
    );
    const state: AccountState = s.stateNow(current().accountKey);
    expect(Object.keys(state.passkeys)).toEqual([credentialId]);
    expect(current().state.passkeys[credentialId]?.salt).toEqual(new Uint8Array(32).fill(5));
  });

  it("sends neither the PRF output nor AK nor anything derived to the server", async () => {
    const s = server();
    const { current } = await setUp(s);
    const sentText = JSON.stringify(s.sent);
    for (const secret of [prfOutput(), current().accountKey])
      expect(sentText).not.toContain(encodeBytes(secret));
    const verify = s.sent.find((c) => c.path === "/auth/passkey/verify-registration");
    expect(verify?.body).toMatchObject({ response: { clientExtensionResults: {} } });
    expect(verify?.token).toBe("anna-token");
  });

  it("refuses an authenticator without PRF before the server registers anything", async () => {
    const s = server();
    const { result } = await setUp(s, authenticator("none"));
    expect(result).toEqual({ ok: false, error: "no-prf" });
    expect(s.sent.map((c) => c.path)).toEqual(["/auth/passkey/generate-register-options"]);
    expect(s.stored().unlock.passkeys).toEqual([]);
  });

  it("asks for the PRF output once more when the registration only enables it", async () => {
    const s = server();
    const webAuthn = authenticator("enabled");
    const { result } = await setUp(s, webAuthn);
    expect(result.ok).toBe(true);
    const get = webAuthn.calls[1]?.options as CredentialRequestOptions;
    expect(webAuthn.calls.map((c) => c.kind)).toEqual(["create", "get"]);
    expect(
      get.publicKey?.allowCredentials?.map((c) => new Uint8Array(c.id as ArrayBuffer)),
    ).toEqual([rawId]);
  });

  it("stops when the person cancels", async () => {
    const s = server();
    const { result } = await setUp(s, authenticator("cancel"));
    expect(result).toEqual({ ok: false, error: "cancelled" });
  });

  it("takes the passkey back when the server does not keep the sealed AK", async () => {
    const s = server({ failPut: true });
    const { result } = await setUp(s);
    expect(result).toEqual({ ok: false, error: "unexpected" });
    expect(s.sent.at(-1)).toMatchObject({
      method: "DELETE",
      path: `/api/account/unlock-passkeys/${credentialId}`,
    });
  });

  it("takes the passkey back when the state cannot be written", async () => {
    const s = server({ failState: true });
    const { result } = await setUp(s);
    expect(result.ok).toBe(false);
    expect(s.sent.at(-1)?.method).toBe("DELETE");
    expect(s.stored().unlock.passkeys).toEqual([]);
  });
});

describe("unlocking with the passkey (K-707)", () => {
  const unlockAfterSetUp = async (options: Parameters<typeof server>[0] = {}) => {
    const s = server(options);
    const { result } = await setUp(s);
    if (!result.ok) throw new Error(result.error);
    const device: PasskeyDevice = result.value;
    const webAuthn = authenticator();
    const unlocked = await unlockWithPasskeyOnline(deps(s, webAuthn), device);
    return { s, unlocked, webAuthn };
  };

  it("signs in with the passkey and opens the account with its PRF output", async () => {
    const { s, unlocked, webAuthn } = await unlockAfterSetUp();
    expect(unlocked.ok && unlocked.value.opened.token).toBe("passkey-token");
    expect(unlocked.ok && unlocked.value.opened.accountKey).toEqual(s.opened().accountKey);
    const get = webAuthn.calls[0]?.options as CredentialRequestOptions;
    expect(get.publicKey?.extensions?.prf?.eval?.first).toEqual(new Uint8Array(32).fill(5));
    const verify = s.sent.find((c) => c.path === "/auth/passkey/verify-authentication");
    expect(JSON.stringify(verify?.body)).not.toContain(encodeBytes(prfOutput()));
  });

  it("opens nothing when the server tampers with the sealed AK", async () => {
    const { unlocked } = await unlockAfterSetUp({ tamper: true });
    expect(unlocked).toEqual({ ok: false, error: "wrong-passkey" });
  });

  it("refuses a passkey that gives no PRF output", async () => {
    const s = server();
    const { result } = await setUp(s);
    if (!result.ok) throw new Error(result.error);
    expect(await unlockWithPasskeyOnline(deps(s, authenticator("none")), result.value)).toEqual({
      ok: false,
      error: "no-prf",
    });
  });

  it("refuses a session of another account", async () => {
    const s = server();
    const { result } = await setUp(s);
    if (!result.ok) throw new Error(result.error);
    const device = { ...result.value, accountId: encodeBytes(new Uint8Array(16).fill(9)) };
    expect(await unlockWithPasskeyOnline(deps(s, authenticator()), device)).toEqual({
      ok: false,
      error: "unexpected",
    });
  });
});

describe("removing a passkey (K-707)", () => {
  it("drops it from the state and the server", async () => {
    const s = server();
    const { result, current, updateState } = await setUp(s);
    if (!result.ok) throw new Error(result.error);
    const removed = await removePasskeyUnlock(
      deps(s, authenticator()),
      { opened: current, updateState },
      credentialId,
    );
    expect(removed).toEqual({ ok: true, value: true });
    expect(s.stateNow(current().accountKey).passkeys[credentialId]?.removed).toBe(true);
    expect(current().state.passkeys[credentialId]?.removed).toBe(true);
    expect(s.stored().unlock.passkeys).toEqual([]);
  });
});
