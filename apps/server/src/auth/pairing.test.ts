// K-303, part 4 (P-04): a new device announces a one-time key, the unlocked device answers with the
// wrapped package, both see the same code, the unlocked device confirms; only then a session
import { describe, expect, it } from "bun:test";
import {
  bytes,
  encodeBytes,
  openDevicePackage,
  type Stored,
  sealDevicePackage,
  stateHash,
  unlockWithDevicePackage,
} from "@kennwort/core";
import { deviceCode, deviceFingerprint, xwingKeyPair } from "@kennwort/crypto";
import { ownerWithKeys } from "../testing/owner-with-keys.ts";
import { PAIRING_MS } from "./pairings.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
type Owner = Awaited<ReturnType<typeof ownerWithKeys>>;

const storedOf = async ({ setup }: Owner, token: string): Promise<Stored> => {
  const keys = (await (await setup.request("/api/account/keys", { token })).json()) as Record<
    string,
    unknown
  >;
  const b = (value: unknown) => bytes().parse(value);
  const unlock = keys.unlock as Record<string, string>;
  return {
    accountId: b(keys.accountId),
    accountSalt: b(keys.accountSalt),
    keyBlock: b(keys.keyBlock),
    state: b(keys.state),
    stateCounter: keys.stateCounter as number,
    unlock: { passphrase: b(unlock.passphrase), recovery: b(unlock.recovery) },
  };
};

/** The new device: a one-time key, announced; poll() as it would every few seconds */
const newDevice = async ({ setup }: Owner) => {
  const keys = xwingKeyPair();
  const announced = await setup.request("/auth/pairings", {
    body: { publicKey: encodeBytes(keys.publicKey) },
  });
  const { id, pollToken } = (await announced.json()) as { id: string; pollToken: string };
  const poll = async (token = pollToken) => {
    const answer = await setup.request(`/auth/pairings/${id}/poll`, { body: { pollToken: token } });
    return { status: answer.status, json: (await answer.json()) as Record<string, string> };
  };
  return { keys, id, pollToken, poll, status: announced.status };
};

/** The unlocked device answers: loads the key, checks it against the QR fingerprint, wraps */
const answer = async (owner: Owner, id: string, fingerprint: Uint8Array) => {
  const loaded = (await (
    await owner.setup.request(`/api/pairings/${id}`, { token: owner.token })
  ).json()) as {
    publicKey: string;
  };
  const publicKey = bytes(1216).parse(loaded.publicKey);
  expect(encodeBytes(deviceFingerprint(publicKey))).toBe(encodeBytes(fingerprint));
  const stored = await storedOf(owner, owner.token);
  const pkg = sealDevicePackage(publicKey, {
    accountKey: owner.owner.accountKey,
    accountId: owner.owner.accountId,
    secretKey: owner.owner.secretKey,
    stateHash: stateHash(stored.state),
  });
  const put = await owner.setup.request(`/api/pairings/${id}`, {
    method: "PUT",
    token: owner.token,
    body: { package: encodeBytes(pkg) },
  });
  return { pkg, publicKey, status: put.status };
};

describe("adding a device", () => {
  it("hands over AK, account and Secret Key; the session comes only after the confirmation", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const device = await newDevice(owner);
    expect(device.status).toBe(201);
    expect((await device.poll()).json).toEqual({ state: "waiting" });

    const sent = await answer(owner, device.id, deviceFingerprint(device.keys.publicKey));
    expect(sent.status).toBe(200);
    const waiting = await device.poll();
    expect(waiting.json.state).toBe("package");
    expect(waiting.json.token).toBeUndefined();
    const pkg = bytes().parse(waiting.json.package);
    const opened = openDevicePackage(device.keys.secretKey, device.keys.publicKey, pkg);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.value.secretKey).toEqual(owner.owner.secretKey);
    // Both screens show the same code
    expect(deviceCode(device.keys.publicKey, pkg)).toBe(deviceCode(sent.publicKey, sent.pkg));

    const confirmed = await owner.setup.request(`/api/pairings/${device.id}/confirm`, {
      method: "POST",
      token: owner.token,
    });
    expect(confirmed.status).toBe(200);
    const done = await device.poll();
    expect(done.json.state).toBe("confirmed");
    expect(done.json.accountId).toBe(encodeBytes(owner.owner.accountId));
    const unlocked = unlockWithDevicePackage(
      await storedOf(owner, done.json.token ?? ""),
      opened.value,
    );
    expect(unlocked.ok && unlocked.value.state).toEqual(owner.owner.state);
    // Once: the pairing is gone with the session
    expect((await device.poll()).status).toBe(404);
  });

  it("lets only the account that answered confirm, and only once a package is there", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const anna = await owner.setup.member(encodeBytes(owner.company.companyId), "member");
    const device = await newDevice(owner);
    const confirm = (token: string) =>
      owner.setup.request(`/api/pairings/${device.id}/confirm`, { method: "POST", token });
    expect((await confirm(owner.token)).status).toBe(404);
    await answer(owner, device.id, deviceFingerprint(device.keys.publicKey));
    // The first answer wins: Anna can neither answer again, nor load the key, nor confirm
    const second = await owner.setup.request(`/api/pairings/${device.id}`, {
      method: "PUT",
      token: anna.token,
      body: { package: "AAAA" },
    });
    expect(second.status).toBe(404);
    expect(
      (await owner.setup.request(`/api/pairings/${device.id}`, { token: anna.token })).status,
    ).toBe(404);
    expect((await confirm(anna.token)).status).toBe(404);
    expect((await device.poll()).json.state).toBe("package");
    expect((await confirm(owner.token)).status).toBe(200);
  });

  it("answers only the right poll token, forgets a cancelled or expired pairing, and needs sessions", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const device = await newDevice(owner);
    expect((await device.poll("falsch")).status).toBe(404);
    expect((await owner.setup.request(`/api/pairings/${device.id}`)).status).toBe(401);
    const cancel = (token: string) =>
      owner.setup.request(`/auth/pairings/${device.id}/cancel`, { body: { pollToken: token } });
    expect((await cancel("falsch")).status).toBe(404);
    expect((await cancel(device.pollToken)).status).toBe(200);
    expect((await device.poll()).status).toBe(404);

    const late = await newDevice(owner);
    owner.setup.clock.advance(PAIRING_MS + 1);
    expect((await late.poll()).status).toBe(404);
    expect(
      (await owner.setup.request(`/api/pairings/${late.id}`, { token: owner.token })).status,
    ).toBe(404);
  });

  it("refuses what is not a one-time key, a poll without token, and too many announcements", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const announce = (publicKey: string) =>
      owner.setup.request("/auth/pairings", { body: { publicKey } });
    expect((await announce("AAAA")).status).toBe(400);
    const device = await newDevice(owner);
    expect(
      (await owner.setup.request(`/auth/pairings/${device.id}/poll`, { body: {} })).status,
    ).toBe(400);
    expect(
      (await owner.setup.request(`/auth/pairings/${device.id}/cancel`, { body: {} })).status,
    ).toBe(400);
    expect(
      (
        await owner.setup.request(`/api/pairings/${device.id}`, {
          method: "PUT",
          token: owner.token,
          body: {},
        })
      ).status,
    ).toBe(400);
  });
});
