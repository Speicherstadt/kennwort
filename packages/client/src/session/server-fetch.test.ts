import { describe, expect, it, vi } from "vitest";
import { serverFetch } from "./server-fetch.ts";

const SERVER = "https://kennwort.weber-haustechnik.test";
const ok = () => vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}));

describe("fetch against the connected server", () => {
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
});
