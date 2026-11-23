// K-605 (P-27): one person, two companies. Jonas runs Weber Haustechnik and also set up Müller
// Elektro for his customer; the web app keeps a separate account per company and signs in to both
// from one device. Nothing of one company reaches the other's session, and signing in to one does
// not end the other's.
import { describe, expect, it } from "bun:test";
import {
  createCompany,
  encodeBytes,
  newLinkPassphrase,
  signInWithPassphrase,
  toWire,
} from "@kennwort/core";
import { DEVICE_HEADER, DEVICE_NAME_HEADER } from "../auth/devices.ts";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";

const CODE = "setup-code-of-the-operator";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const LAPTOP = { [DEVICE_HEADER]: "AAAAAAAAAAAAAAAAAAAAAA", [DEVICE_NAME_HEADER]: "Firefox" };

/** Weber with Jonas as owner, and Müller set up from the same device by Jonas's home account */
const jonasInTwoCompanies = async () => {
  const weber = await ownerWithKeys(CODE, PASSPHRASE);
  const linkPassphrase = newLinkPassphrase();
  const mueller = createCompany(linkPassphrase, { derive: quick });
  const { owner } = mueller;
  const made = await weber.setup.request("/auth/setup", {
    headers: LAPTOP,
    body: {
      code: CODE,
      companyId: encodeBytes(mueller.companyId),
      accountId: encodeBytes(owner.accountId),
      loginPublicKey: encodeBytes(owner.upload.loginPublicKey),
      accountSalt: encodeBytes(owner.upload.accountSalt),
      rootPublicKey: encodeBytes(mueller.rootPublicKey),
    },
  });
  expect(made.status).toBe(201);
  const { token } = (await made.json()) as { token: string };
  const u = owner.upload;
  const keys = await weber.setup.request("/api/account/keys", {
    method: "PUT",
    token,
    body: {
      xwingPublicKey: encodeBytes(u.xwingPublicKey),
      edPublicKey: encodeBytes(u.edPublicKey),
      keyBlock: encodeBytes(u.keyBlock),
      unlock: {
        passphrase: encodeBytes(u.unlock.passphrase),
        recovery: encodeBytes(u.unlock.recovery),
      },
      recoveryLoginPublicKey: encodeBytes(u.recoveryLoginPublicKey),
      state: encodeBytes(u.state),
      stateCounter: 0,
      certificate: toWire(mueller.certificate),
    },
  });
  expect(keys.status).toBe(201);
  /** Signs in from the laptop, as the switch between the companies does */
  const signIn = async (accountId: Uint8Array, passphrase: string, secretKey: Uint8Array) => {
    const post = async (path: string, body: unknown) => {
      const answer = await weber.setup.request(path, { body, headers: LAPTOP });
      return { status: answer.status, json: await answer.json() };
    };
    const result = await signInWithPassphrase(post, accountId, passphrase, secretKey, quick);
    if (!result.ok) throw new Error(result.error);
    return result.token;
  };
  const weberToken = await signIn(weber.owner.accountId, PASSPHRASE, weber.owner.secretKey);
  const muellerToken = await signIn(owner.accountId, linkPassphrase, owner.secretKey);
  const get = async (path: string, token: string) => {
    const answer = await weber.setup.request(path, { token, headers: LAPTOP });
    return { status: answer.status, json: (await answer.json()) as Record<string, unknown> };
  };
  return { weber, mueller, weberToken, muellerToken, get };
};

describe("one person in two companies", () => {
  it("keeps both sessions of one device: a sign-in ends only the same account's earlier one", async () => {
    const { weberToken, muellerToken, get } = await jonasInTwoCompanies();
    expect((await get("/api/devices", weberToken)).status).toBe(200);
    expect((await get("/api/devices", muellerToken)).status).toBe(200);
  });

  it("shows each session its own company, members, devices and keys, never the other's", async () => {
    const { weber, mueller, weberToken, muellerToken, get } = await jonasInTwoCompanies();
    const weberId = encodeBytes(weber.company.companyId);
    const muellerId = encodeBytes(mueller.companyId);
    expect((await get("/api/company", weberToken)).json.id).toBe(weberId);
    expect((await get("/api/company", muellerToken)).json.id).toBe(muellerId);
    expect((await get("/api/company", muellerToken)).json.rootPublicKey).toBe(
      encodeBytes(mueller.rootPublicKey),
    );
    const membersOf = async (token: string) =>
      ((await get("/api/members", token)).json.members as { id: string }[]).map(
        (member) => member.id,
      );
    expect(await membersOf(weberToken)).toEqual([encodeBytes(weber.owner.accountId)]);
    expect(await membersOf(muellerToken)).toEqual([encodeBytes(mueller.owner.accountId)]);
    const devicesOf = async (token: string) =>
      (await get("/api/devices", token)).json.devices as { current: boolean }[];
    // Each account lists only its own sessions: the setup's and the switch's
    expect((await devicesOf(weberToken)).filter((d) => d.current)).toHaveLength(1);
    expect((await devicesOf(muellerToken)).filter((d) => d.current)).toHaveLength(1);
    const keysOf = async (token: string) => (await get("/api/account/keys", token)).json.accountId;
    expect(await keysOf(weberToken)).toBe(encodeBytes(weber.owner.accountId));
    expect(await keysOf(muellerToken)).toBe(encodeBytes(mueller.owner.accountId));
  });

  it("keeps a vault of one company from the other company's session", async () => {
    const { weber, weberToken, muellerToken, get } = await jonasInTwoCompanies();
    const vaultId = encodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    const created = await weber.setup.request("/api/vaults", {
      token: weberToken,
      body: { id: vaultId },
    });
    expect(created.status).toBe(201);
    const listed = (await get("/api/vaults", muellerToken)).json.vaults as { id: string }[];
    expect(listed.map((v) => v.id)).not.toContain(vaultId);
    for (const path of [`/api/vaults/${vaultId}/log`, `/api/vaults/${vaultId}/keys`])
      expect((await get(path, muellerToken)).status).toBe(404);
    // Nor may Müller's account create a vault under the same ID, nor ask for access to it
    const taken = await weber.setup.request("/api/vaults", {
      token: muellerToken,
      body: { id: vaultId },
    });
    expect(taken.status).not.toBe(201);
    const asked = await weber.setup.request(`/api/vaults/${vaultId}/requests`, {
      token: muellerToken,
      body: {},
    });
    expect(asked.status).toBe(404);
  });

  it("lets neither account act on the other company's members", async () => {
    const { weber, mueller, weberToken, muellerToken } = await jonasInTwoCompanies();
    for (const [token, other] of [
      [muellerToken, weber.owner.accountId],
      [weberToken, mueller.owner.accountId],
    ] as const) {
      const removed = await weber.setup.request(`/api/members/${encodeBytes(other)}`, {
        method: "DELETE",
        token,
      });
      expect(removed.status).toBe(404);
      const role = await weber.setup.request(`/api/members/${encodeBytes(other)}/role`, {
        method: "PUT",
        token,
        body: { role: "member" },
      });
      expect([400, 404]).toContain(role.status);
    }
  });
});
