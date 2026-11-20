import { type Stored, stateHash } from "@kennwort/core";
import { deviceFingerprint, wrap, xwingKeyPair } from "@kennwort/crypto";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { announce, answerPairing, joinAccount, poll } from "./pairing.ts";

// K-303 part 5 (P-04): both sides of adding a device, against a server stand-in in memory
const unlockedOwner = async () => {
  const api = fakeApi();
  const owner = createSession({ api, storage: memory(), derive });
  const made = await owner.setUp("richtiger-code", PASSPHRASE);
  if (!made.ok) throw new Error("setup");
  const opened = owner.opened();
  if (!opened) throw new Error("not opened");
  return { api, owner, opened, secretKey: made.value.secretKey };
};

/** What the server keeps for one pairing; the honest one hands the package on unchanged */
const pairingServer = (stored: () => Promise<Stored | undefined>) => {
  const state: { publicKey?: Uint8Array; pkg?: Uint8Array; confirmed: boolean } = {
    confirmed: false,
  };
  return {
    state,
    announcePairing: async (publicKey: Uint8Array) => {
      state.publicKey = publicKey;
      return { id: "p1", pollToken: "t1" };
    },
    pollPairing: async () =>
      !state.pkg
        ? ({ state: "waiting" } as const)
        : state.confirmed
          ? ({ state: "confirmed", package: state.pkg, token: "signed-in-0" } as const)
          : ({ state: "package", package: state.pkg } as const),
    pairingKey: async () => state.publicKey,
    answerPairing: async (_token: string, _id: string, pkg: Uint8Array) => {
      state.pkg = pkg;
      return true;
    },
    keys: stored,
  };
};

describe("adding a device", () => {
  it("joins the new device to the account once the code is confirmed", async () => {
    const { api, opened, secretKey } = await unlockedOwner();
    const server = pairingServer(() => api.keys("signed-in-0"));
    const pairing = await announce(server);
    if (!pairing) throw new Error("announce");
    expect(pairing.link.fingerprint).toEqual(deviceFingerprint(pairing.keys.publicKey));
    expect(pairing.link.secret).toHaveLength(32);
    expect(await poll(server, pairing)).toEqual({ state: "waiting" });

    const answered = await answerPairing(server, opened, secretKey, pairing.link);
    if (!answered.ok) throw new Error(answered.error);
    const waiting = await poll(server, pairing);
    expect(waiting.state === "package" && waiting.code).toBe(answered.code);

    server.state.confirmed = true;
    const confirmed = await poll(server, pairing);
    if (confirmed.state !== "confirmed") throw new Error(confirmed.state);
    expect(confirmed.content.secretKey).toEqual(secretKey);
    const joined = await joinAccount(api, confirmed.content, confirmed.token);
    expect(joined?.state).toEqual(opened.state);

    const storage = memory();
    const device = createSession({ api, storage, derive });
    if (!joined) throw new Error("join");
    device.adopt(joined, confirmed.content.secretKey);
    flush();
    expect(device.opened()).toBeDefined();
    expect(device.device()?.secretKey).toEqual(secretKey);
    device.lock();
    // The new device unlocks like any other afterwards, with the passphrase
    expect(await device.unlock(PASSPHRASE)).toEqual({ ok: true, value: true });
  });

  it("fails on a package the server made itself, or when the server stops answering", async () => {
    const { api } = await unlockedOwner();
    const server = pairingServer(() => api.keys("signed-in-0"));
    const pairing = await announce(server);
    if (!pairing) throw new Error("announce");
    // The server knows the one-time key, not the secret from the QR code
    const to = { publicKey: pairing.keys.publicKey, fingerprint: pairing.link.fingerprint };
    server.state.pkg = wrap(to, new Uint8Array(112), { purpose: "device", context: [] });
    expect(await poll(server, pairing)).toEqual({ state: "failed" });
    expect(await poll({ pollPairing: async () => undefined }, pairing)).toEqual({
      state: "failed",
    });
    expect(await announce({ announcePairing: async () => undefined })).toBeUndefined();
  });

  it("does not join when the server's ciphertexts are not the account's or are gone", async () => {
    const { api, opened, secretKey } = await unlockedOwner();
    const content = {
      accountKey: opened.accountKey,
      accountId: opened.accountId,
      secretKey,
      stateHash: new Uint8Array(32),
    };
    expect(await joinAccount(api, content, "signed-in-0")).toBeUndefined();
    expect(await joinAccount({ keys: async () => undefined }, content, "x")).toBeUndefined();
  });

  it("answers only a key that matches the fingerprint from the QR code", async () => {
    const { api, opened, secretKey } = await unlockedOwner();
    const server = pairingServer(() => api.keys("signed-in-0"));
    const pairing = await announce(server);
    if (!pairing) throw new Error("announce");
    const swapped = { ...server, pairingKey: async () => xwingKeyPair().publicKey };
    expect(await answerPairing(swapped, opened, secretKey, pairing.link)).toEqual({
      ok: false,
      error: "other-key",
    });
    expect(server.state.pkg).toBeUndefined();
    const gone = { ...server, pairingKey: async () => undefined };
    expect(await answerPairing(gone, opened, secretKey, pairing.link)).toEqual({
      ok: false,
      error: "gone",
    });
    const noKeys = { ...server, keys: async () => undefined };
    expect(await answerPairing(noKeys, opened, secretKey, pairing.link)).toEqual({
      ok: false,
      error: "unexpected",
    });
    const refused = { ...server, answerPairing: async () => false };
    expect(await answerPairing(refused, opened, secretKey, pairing.link)).toEqual({
      ok: false,
      error: "gone",
    });
  });

  it("wraps the hash of the sealed state the server holds", async () => {
    const { api, opened, secretKey } = await unlockedOwner();
    const server = pairingServer(() => api.keys("signed-in-0"));
    const pairing = await announce(server);
    if (!pairing) throw new Error("announce");
    await answerPairing(server, opened, secretKey, pairing.link);
    const result = await poll(server, pairing);
    const stored = await api.keys("signed-in-0");
    expect(result.state === "package" && result.content.stateHash).toEqual(
      stateHash(stored?.state ?? new Uint8Array()),
    );
  });
});
