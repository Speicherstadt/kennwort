// K-307 part c (P-13): Anna lost everything; her new device pairs, Jonas (owner) answers for her
// with the recovered AK, confirms, and the new device gets a session for Anna, never for Jonas
import { describe, expect, it } from "bun:test";
import {
  approveRecovery,
  bytes,
  encodeBytes,
  openRecoveryPackage,
  RECOVERY_PACKAGE_LENGTH,
  renewUnlockWithAccountKey,
  StoredWire,
} from "@kennwort/core";
import { xwingKeyPair } from "@kennwort/crypto";
import { quick } from "../testing/owner-with-keys.ts";
import {
  annaDeposits,
  makeRecoveryKey,
  type WeberWithAnna,
  weberWithAnna,
} from "../testing/recovery-setup.ts";
import { DEVICE_PACKAGE_LENGTH } from "./pairings.ts";

const newDevice = async (w: WeberWithAnna) => {
  const keys = xwingKeyPair();
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const announced = await w.o.setup.request("/auth/pairings", {
    body: { publicKey: encodeBytes(keys.publicKey) },
  });
  const { id, pollToken } = (await announced.json()) as { id: string; pollToken: string };
  const poll = async () =>
    (await (
      await w.o.setup.request(`/auth/pairings/${id}/poll`, { body: { pollToken } })
    ).json()) as Record<string, string>;
  return { keys, secret, id, poll };
};

const ready = async () => {
  const w = await weberWithAnna();
  const { key, policy } = await makeRecoveryKey(w);
  const { deposit } = await annaDeposits(w, policy, key.publicKey);
  const device = await newDevice(w);
  const approved = approveRecovery({
    recoveryKey: key,
    bundle: {
      deposit,
      keyBlock: w.anna.upload.keyBlock,
      state: w.anna.upload.state,
      stateCounter: 0,
    },
    certificate: w.annaCert,
    rootFingerprint: w.o.owner.state.rootFingerprint,
    device: { publicKey: device.keys.publicKey, pairingSecret: device.secret },
  });
  if (!approved.ok) throw new Error(approved.error);
  const answer = (body: unknown, token = w.o.token) =>
    w.o.setup.request(`/api/pairings/${device.id}`, { method: "PUT", token, body });
  return { w, device, pkg: approved.value, answer };
};

describe("recovering a member through a new device (P-13)", () => {
  it("gives the new device a session for Anna once Jonas confirmed, with her AK in the package", async () => {
    const { w, device, pkg, answer } = await ready();
    expect(pkg).toHaveLength(RECOVERY_PACKAGE_LENGTH);
    expect((await answer({ package: encodeBytes(pkg), accountId: w.annaIdText })).status).toBe(200);
    expect((await device.poll()).state).toBe("package");
    // Anna herself cannot confirm what Jonas answered
    const confirm = (token: string) =>
      w.o.setup.request(`/api/pairings/${device.id}/confirm`, { body: {}, token });
    expect((await confirm(w.annaToken)).status).toBe(404);
    expect((await confirm(w.o.token)).status).toBe(200);
    const done = await device.poll();
    expect(done).toMatchObject({ state: "confirmed", accountId: w.annaIdText });
    const opened = openRecoveryPackage(device.keys, device.secret, bytes().parse(done.package));
    expect(opened.ok && opened.value.accountKey).toEqual(w.anna.accountKey);
    const keys = await w.o.setup.request("/api/account/keys", { token: done.token ?? "" });
    expect(StoredWire.parse(await keys.json()).accountId).toEqual(w.anna.accountId);
  });

  it("lets only an owner answer for a member with a deposit, with a recovery package", async () => {
    const { w, pkg, answer } = await ready();
    const recovery = { package: encodeBytes(pkg), accountId: w.annaIdText };
    // Anna cannot answer for Jonas
    const forJonas = { package: encodeBytes(pkg), accountId: encodeBytes(w.o.owner.accountId) };
    expect((await answer(forJonas, w.annaToken)).status).toBe(403);
    // a device package for someone else, a recovery package for oneself
    const devicePkg = encodeBytes(new Uint8Array(DEVICE_PACKAGE_LENGTH));
    expect((await answer({ package: devicePkg, accountId: w.annaIdText })).status).toBe(400);
    expect((await answer({ package: encodeBytes(pkg) })).status).toBe(400);
    // nobody outside the company, nobody without a deposit
    expect((await answer({ ...recovery, accountId: "someone-else" })).status).toBe(404);
    expect((await answer(recovery)).status).toBe(200);
  });

  it("refuses a member without a deposit", async () => {
    const w = await weberWithAnna();
    await makeRecoveryKey(w);
    const device = await newDevice(w);
    const body = {
      package: encodeBytes(new Uint8Array(RECOVERY_PACKAGE_LENGTH)),
      accountId: w.annaIdText,
    };
    const answer = await w.o.setup.request(`/api/pairings/${device.id}`, {
      method: "PUT",
      token: w.o.token,
      body,
    });
    expect(answer.status).toBe(404);
  });

  it("lets the recovered device set new unlock ways, proven by Anna's own key", async () => {
    const w = await weberWithAnna();
    const renew = (edSecretKey: Uint8Array) =>
      renewUnlockWithAccountKey(
        w.anna.accountKey,
        w.anna.accountId,
        "Neue Passphrase nach Recovery",
        new Uint8Array(16).fill(3),
        edSecretKey,
        { derive: quick },
      ).upload;
    const put = (upload: ReturnType<typeof renew>) =>
      w.o.setup.request("/api/account/unlock", {
        method: "PUT",
        token: w.annaToken,
        body: {
          accountSalt: encodeBytes(upload.accountSalt),
          loginPublicKey: encodeBytes(upload.loginPublicKey),
          recoveryLoginPublicKey: encodeBytes(upload.recoveryLoginPublicKey),
          unlock: {
            passphrase: encodeBytes(upload.unlock.passphrase),
            recovery: encodeBytes(upload.unlock.recovery),
          },
          proof: encodeBytes(upload.proof),
        },
      });
    expect((await put(renew(w.o.owner.keyBlock.ed.secretKey))).status).toBe(403);
    expect((await put(renew(w.anna.keyBlock.ed.secretKey))).status).toBe(200);
  });
});
