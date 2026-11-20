// Review of K-303 part 6: "Zuletzt aktiv" (docs/konto.md, sicherheitsdesign.md: "letzter Aktivität")
import { describe, expect, it } from "bun:test";
import { signInWithPassphrase } from "@kennwort/core";
import { ownerWithKeys, quick } from "../testing/owner-with-keys.ts";
import { DEVICE_HEADER, DEVICE_NAME_HEADER } from "./devices.ts";

const CODE = "setup-code-of-weber-haustechnik";
const PASSPHRASE = "Heizung-Wasser-Licht-Kupfer";
const LAPTOP = "AAAAAAAAAAAAAAAAAAAAAA";

describe("devices review", () => {
  it("moves a device's lastSeenAt forward when it uses its session", async () => {
    const owner = await ownerWithKeys(CODE, PASSPHRASE);
    const headers = { [DEVICE_HEADER]: LAPTOP, [DEVICE_NAME_HEADER]: "Laptop" };
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The laptop works with its session ...
    expect((await owner.setup.request("/api/account/keys", { token: result.token })).status).toBe(
      200,
    );
    // ... so the list should not still show the sign-in time as its last activity
    const { devices } = (await (
      await owner.setup.request("/api/devices", { token: owner.token })
    ).json()) as { devices: { name: string | null; signedInAt: number; lastSeenAt: number }[] };
    const laptop = devices.find((device) => device.name === "Laptop");
    expect(laptop?.lastSeenAt).toBeGreaterThan(laptop?.signedInAt ?? Number.POSITIVE_INFINITY);
  });
});
