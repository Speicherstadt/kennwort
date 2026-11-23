import { describe, expect, it, vi } from "vitest";
import { extensionDeviceName, serverApiFor, serverFetch } from "./server-api.ts";

const SERVER = "https://kennwort.weber-haustechnik.test";
const ok = () => vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}));

describe("the server's API in the extension", () => {
  it("resolves the API's paths against the connected server", async () => {
    const send = ok();
    await serverFetch(SERVER, send)("/api/vaults", { method: "GET" });
    expect(String(send.mock.calls[0]?.[0])).toBe(`${SERVER}/api/vaults`);
    expect(send.mock.calls[0]?.[1]).toEqual({ method: "GET" });
  });

  it.each(["https://evil.test/api/vaults", "//evil.test/api", `${SERVER}.evil.test/api`])(
    "refuses to send anything to another origin: %s",
    async (path) => {
      const send = ok();
      await expect(serverFetch(SERVER, send)(path)).rejects.toThrow(TypeError);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("names the device and signs in at the connected server", async () => {
    const send = ok();
    const api = serverApiFor(
      send,
      "Mozilla/5.0 (X11; Linux x86_64) Chrome/153.0 Safari/537.36",
    )({
      server: SERVER,
      accountId: new Uint8Array(16),
      secretKey: new Uint8Array(16),
      deviceId: new Uint8Array(16).fill(1),
    });
    await api.keys("token-1");
    const [url, init] = send.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${SERVER}/api/account/keys`);
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer token-1");
    expect(headers.get("x-kennwort-device")).toBe("AQEBAQEBAQEBAQEBAQEBAQ");
    expect(decodeURIComponent(headers.get("x-kennwort-device-name") ?? "")).toBe(
      "Chrome · Linux · Extension",
    );
  });

  it("calls itself an extension in the device list", () => {
    expect(extensionDeviceName("Firefox/140.0 (X11; Linux)")).toBe("Firefox · Linux · Extension");
  });
});
