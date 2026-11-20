// K-303 part 6: one session per device and account; the list shows them, a device signs another out
import { describe, expect, it } from "bun:test";
import { encodeBytes, signInWithPassphrase } from "@kennwort/core";
import { eq } from "drizzle-orm";
import { authSession, deviceSessions } from "../db/schema.ts";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";
import { DEVICE_HEADER, DEVICE_NAME_HEADER, deviceOf } from "./devices.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const LAPTOP = "AAAAAAAAAAAAAAAAAAAAAA";
const PHONE = "AQEBAQEBAQEBAQEBAQEBAQ";
type Owner = Awaited<ReturnType<typeof ownerWithKeys>>;
type Device = {
  id: string;
  name: string | null;
  current: boolean;
  signedInAt: number;
  lastSeenAt: number;
};

/** Signs in the notweg way from a device that names itself, as the web app does */
const signInFrom = async (owner: Owner, deviceId?: string, name = "Firefox · Linux") => {
  const headers: Record<string, string> = deviceId
    ? { [DEVICE_HEADER]: deviceId, [DEVICE_NAME_HEADER]: encodeURIComponent(name) }
    : {};
  const post = async (path: string, body: unknown) => {
    const answer = await owner.setup.request(path, { body, headers });
    return { status: answer.status, json: await answer.json() };
  };
  const result = await signInWithPassphrase(
    post,
    owner.owner.accountId,
    PASSPHRASE,
    owner.owner.secretKey,
    quick,
  );
  if (!result.ok) throw new Error(result.error);
  return result.token;
};
const devicesOf = async (owner: Owner, token: string) =>
  ((await (await owner.setup.request("/api/devices", { token })).json()) as { devices: Device[] })
    .devices;
const works = async (owner: Owner, token: string) =>
  (await owner.setup.request("/api/account/keys", { token })).status === 200;

describe("devices", () => {
  it("keeps one session per device: signing in again ends the device's earlier session", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const first = await signInFrom(owner, LAPTOP);
    const second = await signInFrom(owner, LAPTOP);
    expect(await works(owner, first)).toBe(false);
    expect(await works(owner, second)).toBe(true);
    const named = (await devicesOf(owner, second)).filter((device) => device.name !== null);
    expect(named).toHaveLength(1);
  });

  it("lists every device of the account with its name, and marks the one asking", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const laptop = await signInFrom(owner, LAPTOP, "Firefox · Linux");
    const phone = await signInFrom(owner, PHONE, "Safari · iPhone – Büro");
    const listed = await devicesOf(owner, laptop);
    const byName = Object.fromEntries(listed.map((device) => [device.name, device]));
    expect(byName["Firefox · Linux"]?.current).toBe(true);
    expect(byName["Safari · iPhone – Büro"]?.current).toBe(false);
    expect(byName["Safari · iPhone – Büro"]?.signedInAt).toBeGreaterThan(0);
    // The setup session has no device: it is listed without a name
    expect(listed.filter((device) => device.name === null)).toHaveLength(1);
    expect(await works(owner, phone)).toBe(true);
  });

  it("signs out another device or this one; another account's device stays", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const laptop = await signInFrom(owner, LAPTOP);
    const phone = await signInFrom(owner, PHONE, "Chrome · Android");
    const phoneEntry = (await devicesOf(owner, laptop)).find(
      (device) => device.name === "Chrome · Android",
    );
    const remove = (token: string, id: string) =>
      owner.setup.request(`/api/devices/${id}`, { method: "DELETE", token });
    expect((await remove(laptop, phoneEntry?.id ?? "")).status).toBe(200);
    expect(await works(owner, phone)).toBe(false);
    expect((await remove(laptop, phoneEntry?.id ?? "")).status).toBe(404);
    const anna = await owner.setup.member(encodeBytes(owner.company.companyId), "member");
    expect((await remove(anna.token, (await devicesOf(owner, laptop))[0]?.id ?? "")).status).toBe(
      404,
    );
    const own = (await devicesOf(owner, laptop)).find((device) => device.current);
    expect((await remove(laptop, own?.id ?? "")).status).toBe(200);
    expect(await works(owner, laptop)).toBe(false);
    expect((await owner.setup.request("/api/devices")).status).toBe(401);
  });

  it("does not list expired sessions", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const laptop = await signInFrom(owner, LAPTOP);
    await signInFrom(owner, PHONE, "Chrome · Android");
    const phone = owner.setup.db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.deviceId, PHONE))
      .get();
    owner.setup.db
      .update(authSession)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSession.id, phone?.sessionId ?? ""))
      .run();
    const names = (await devicesOf(owner, laptop)).map((device) => device.name);
    expect(names).toContain("Firefox · Linux");
    expect(names).not.toContain("Chrome · Android");
  });
});

describe("deviceOf", () => {
  const request = (headers: Record<string, string>) => new Request("http://x/", { headers });
  it("reads a well-formed ID and a percent-encoded name", () => {
    expect(
      deviceOf(
        request({ [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: encodeURIComponent(" Büro-PC ") }),
      ),
    ).toEqual({
      id: LAPTOP,
      name: "Büro-PC",
    });
  });

  it("refuses a missing or malformed ID or name", () => {
    for (const headers of [
      {},
      { [DEVICE_HEADER]: LAPTOP },
      { [DEVICE_NAME_HEADER]: "PC" },
      { [DEVICE_HEADER]: "kurz", [DEVICE_NAME_HEADER]: "PC" },
      { [DEVICE_HEADER]: `${LAPTOP}A`, [DEVICE_NAME_HEADER]: "PC" },
      { [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: "%E0%A4%A" },
      { [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: encodeURIComponent("a\nb") },
      { [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: encodeURIComponent("x".repeat(65)) },
      { [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: "%20" },
    ])
      expect(deviceOf(request(headers))).toBeUndefined();
    expect(
      deviceOf(request({ [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: "x".repeat(64) }))?.name,
    ).toHaveLength(64);
  });
});
