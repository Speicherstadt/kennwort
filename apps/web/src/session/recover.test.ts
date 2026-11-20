import { encodeBytes, loginKeyPair, recoveryLoginKeyPair } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import type { AccountApi as Api } from "./api.ts";
import { readDevice } from "./device.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "./session.test-kit.ts";
import { createSession } from "./session.ts";

// K-303 part 3b (P-12): the passphrase is forgotten, the Recovery Key opens the account
const NEW = "Rohr Zange Ventil Kessel";

const madeAccount = async (api: Api) => {
  const first = createSession({ api, storage: memory(), derive });
  const made = await first.setUp("richtiger-code", PASSPHRASE);
  if (!made.ok) throw new Error("setup");
  first.lock();
  return { first, keys: made.value };
};

describe("recovering with the Recovery Key", () => {
  it("on the known device: keeps the Secret Key, sets the new passphrase and gives a new Recovery Key", async () => {
    const api = fakeApi();
    const { first, keys } = await madeAccount(api);
    const result = await first.recover(keys.recoveryKey, NEW);
    if (!result.ok) throw new Error(result.error);
    expect(first.opened()).toBeDefined();
    expect(result.value.secretKey).toEqual(keys.secretKey);
    expect(result.value.recoveryKey).not.toEqual(keys.recoveryKey);
    first.lock();
    expect(await first.unlock(PASSPHRASE)).toEqual({ ok: false, error: "wrong-passphrase" });
    expect(await first.unlock(NEW)).toEqual({ ok: true, value: true });
    first.lock();
    expect(await first.recover(keys.recoveryKey, NEW)).toEqual({
      ok: false,
      error: "wrong-recovery-key",
    });
    expect((await first.recover(result.value.recoveryKey, PASSPHRASE)).ok).toBe(true);
  });

  it("on a new device: needs the account ID, makes a new Secret Key and remembers it", async () => {
    const api = fakeApi();
    const { first, keys } = await madeAccount(api);
    const storage = memory();
    const other = createSession({ api, storage, derive, random: (n) => new Uint8Array(n).fill(9) });
    expect(await other.recover(keys.recoveryKey, NEW)).toEqual({
      ok: false,
      error: "wrong-recovery-key",
    });
    const id = encodeBytes(keys.accountId);
    const result = await other.recover(keys.recoveryKey, NEW, id);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.secretKey).toEqual(new Uint8Array(16).fill(9));
    expect(readDevice(storage)).toEqual({ accountId: id, secretKey: new Uint8Array(16).fill(9) });
    // The first device's Secret Key no longer goes with the new passphrase
    expect(await first.unlock(NEW)).toEqual({ ok: false, error: "wrong-passphrase" });
    other.lock();
    expect(await other.unlock(NEW)).toEqual({ ok: true, value: true });
  });

  it("uses the device's Secret Key only for the account the device knows", async () => {
    const api = fakeApi();
    const { first } = await madeAccount(api);
    const { keys: another } = await madeAccount(api);
    const known = first.device()?.secretKey;
    const result = await first.recover(another.recoveryKey, NEW, encodeBytes(another.accountId));
    if (!result.ok) throw new Error(result.error);
    expect(known).toHaveLength(16);
    expect(result.value.secretKey).not.toEqual(known);
    expect(result.value.secretKey).not.toEqual(another.secretKey);
    expect(result.value.accountId).toEqual(another.accountId);
  });

  it("names what went wrong and changes nothing then", async () => {
    const api = fakeApi();
    const { first, keys } = await madeAccount(api);
    const id = encodeBytes(keys.accountId);
    expect(await first.recover(keys.recoveryKey, NEW, "kein-konto")).toEqual({
      ok: false,
      error: "wrong-recovery-key",
    });
    const make = (overrides: Partial<Api>) =>
      createSession({ api: { ...api, ...overrides }, storage: memory(), derive });
    expect(
      await make({ signInWithRecovery: async () => ({ ok: false, error: "locked" }) }).recover(
        keys.recoveryKey,
        NEW,
        id,
      ),
    ).toEqual({
      ok: false,
      error: "too-many-requests",
    });
    expect(await make({ keys: async () => undefined }).recover(keys.recoveryKey, NEW, id)).toEqual({
      ok: false,
      error: "unexpected",
    });
    expect(
      await make({ replaceUnlock: async () => false }).recover(keys.recoveryKey, NEW, id),
    ).toEqual({
      ok: false,
      error: "unexpected",
    });
    // A server that lets anyone sign in still cannot open AK without the right Recovery Key
    const lax = make({ signInWithRecovery: async () => ({ ok: true, token: "signed-in-0" }) });
    expect(await lax.recover(new Uint8Array(32).fill(1), NEW, id)).toEqual({
      ok: false,
      error: "wrong-recovery-key",
    });
    const damaged = make({
      signInWithRecovery: async () => ({ ok: true, token: "x" }),
      keys: async () => ({
        accountId: keys.accountId,
        accountSalt: new Uint8Array(16),
        keyBlock: new Uint8Array(40),
        state: new Uint8Array(40),
        stateCounter: 0,
        unlock: (await api.keys("signed-in-0"))?.unlock ?? {
          passphrase: new Uint8Array(),
          recovery: new Uint8Array(),
        },
      }),
    });
    expect(await damaged.recover(keys.recoveryKey, NEW, id)).toEqual({
      ok: false,
      error: "unexpected",
    });
    expect(await first.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
  });

  it("uploads sign-in keys that belong to the new passphrase and Recovery Key", async () => {
    const api = fakeApi();
    const { first, keys } = await madeAccount(api);
    const result = await first.recover(keys.recoveryKey, NEW);
    if (!result.ok) throw new Error(result.error);
    const stored = await api.keys("signed-in-0");
    const upload = stored as unknown as {
      loginPublicKey: Uint8Array;
      recoveryLoginPublicKey: Uint8Array;
      accountSalt: Uint8Array;
    };
    expect(upload.loginPublicKey).toEqual(
      loginKeyPair(NEW, upload.accountSalt, keys.secretKey, keys.accountId, derive).publicKey,
    );
    expect(upload.recoveryLoginPublicKey).toEqual(
      recoveryLoginKeyPair(result.value.recoveryKey, keys.accountId).publicKey,
    );
  });
});
