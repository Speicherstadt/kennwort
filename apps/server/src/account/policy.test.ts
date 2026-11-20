// K-304 part 4 (F-07): Jonas saves the company policy; the server keeps only what the root signed
import { describe, expect, it } from "bun:test";
import { encodeBytes, PolicyWire, policyToWire, signPolicy } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { ownerWithKeys } from "../testing/owner-with-keys.ts";
import { invitationBody } from "../testing/sign-in-setup.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";

const policyFor = (
  o: Awaited<ReturnType<typeof ownerWithKeys>>,
  version: number,
  minutes = 5,
  key?: Uint8Array,
) =>
  signPolicy(key ?? o.owner.state.rootSecretKey ?? new Uint8Array(32), {
    companyId: o.company.companyId,
    version,
    lockAfterMinutes: minutes,
    companyRecovery: { enabled: false },
  });
const put = (o: Awaited<ReturnType<typeof ownerWithKeys>>, body: unknown, token = o.token) =>
  o.setup.request("/api/company/policy", { method: "PUT", token, body });
const company = async (o: Awaited<ReturnType<typeof ownerWithKeys>>) =>
  (await (await o.setup.request("/api/company", { token: o.token })).json()) as { policy: unknown };

describe("company policy (K-304 part 4)", () => {
  it("has none at first, keeps a signed one and hands it out as it was signed", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    expect((await company(o)).policy).toBeNull();
    const policy = policyFor(o, 1, 3);
    expect((await put(o, policyToWire(policy))).status).toBe(200);
    expect(PolicyWire.parse((await company(o)).policy)).toEqual(policy);
    const audit = (await (await o.setup.request("/api/audit", { token: o.token })).json()) as {
      events: { action: string; subject: string }[];
    };
    expect(audit.events.at(-1)).toMatchObject({ action: "policy-changed", subject: "1" });
  });

  it("takes only a newer version", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    expect((await put(o, policyToWire(policyFor(o, 2)))).status).toBe(200);
    expect((await put(o, policyToWire(policyFor(o, 2, 9)))).status).toBe(409);
    expect((await put(o, policyToWire(policyFor(o, 1, 9)))).status).toBe(409);
    expect((await put(o, policyToWire(policyFor(o, 3, 9)))).status).toBe(200);
    expect(PolicyWire.parse((await company(o)).policy).lockAfterMinutes).toBe(9);
  });

  it("refuses a policy not signed by the company's root, of another company, or malformed", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const forged = policyFor(o, 1, 5, ed25519KeyPair().secretKey);
    expect((await put(o, policyToWire(forged))).status).toBe(400);
    const other = signPolicy(o.owner.state.rootSecretKey ?? new Uint8Array(32), {
      companyId: new Uint8Array(16),
      version: 1,
      lockAfterMinutes: 5,
      companyRecovery: { enabled: false },
    });
    expect((await put(o, policyToWire(other))).status).toBe(400);
    expect((await put(o, { ...policyToWire(policyFor(o, 1)), lockAfterMinutes: 61 })).status).toBe(
      400,
    );
    expect((await put(o, {})).status).toBe(400);
    expect((await company(o)).policy).toBeNull();
  });

  it("takes a policy only from an owner", async () => {
    const o = await ownerWithKeys(CODE, PASSPHRASE);
    const made = await o.setup.request("/api/invitations", {
      token: o.token,
      body: invitationBody("Anna"),
    });
    const { id, token } = (await made.json()) as { id: string; token: string };
    const anna = await o.setup.request(`/auth/invitations/${id}/accept`, {
      body: {
        token,
        accountId: encodeBytes(new Uint8Array(16).fill(0x20)),
        loginPublicKey: encodeBytes(new Uint8Array(32).fill(1)),
        accountSalt: encodeBytes(new Uint8Array(16)),
      },
    });
    const annaToken = ((await anna.json()) as { token: string }).token;
    expect((await put(o, policyToWire(policyFor(o, 1)), annaToken)).status).toBe(403);
    expect((await company(o)).policy).toBeNull();
  });
});
