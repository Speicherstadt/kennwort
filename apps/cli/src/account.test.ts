import { describe, expect, it, vi } from "vitest";
import { apiFor, cliDeviceName, withAccount } from "./account.ts";

const noKeeper = { read: () => undefined, keep: () => true };

const device = {
  server: "https://kennwort.weber-haustechnik.test",
  accountId: new Uint8Array(16).fill(7),
  secretKey: new Uint8Array(16).fill(9),
  deviceId: new Uint8Array(16).fill(1),
};

describe("the account of one command", () => {
  it("calls itself CLI in the device list", () => {
    expect(cliDeviceName("linux")).toBe("CLI · Linux");
    expect(cliDeviceName("darwin")).toBe("CLI · macOS");
    expect(cliDeviceName("sunos")).toBe("CLI");
  });

  it("talks only to the device's server and names the device", async () => {
    const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
    await apiFor(device, { send, platform: "linux", kept: noKeeper }).keys("token-1");
    const [url, init] = send.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${device.server}/api/account/keys`);
    const headers = new Headers(init?.headers);
    expect(headers.get("x-kennwort-device")).toBe("AQEBAQEBAQEBAQEBAQEBAQ");
    expect(decodeURIComponent(headers.get("x-kennwort-device-name") ?? "")).toBe("CLI · Linux");
  });

  it("is unreachable when the server does not answer", async () => {
    const send = async () => {
      throw new TypeError("offline");
    };
    expect(
      await withAccount(device, "Heizung", { send, platform: "linux", kept: noKeeper }),
    ).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});
