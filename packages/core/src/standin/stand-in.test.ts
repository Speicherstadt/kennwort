import { describe, expect, it } from "vitest";
import { encodeBytes } from "../sync/bytes.ts";
import { syncContract } from "../sync/test/contract.ts";
import { anna, jonas, max } from "../sync/test/fixtures.ts";
import { standIn } from "./stand-in.ts";

const sessions = {
  "t-jonas": { accountId: encodeBytes(jonas.id), companyId: "weber" },
  "t-anna": { accountId: encodeBytes(anna.id), companyId: "weber" },
  "t-max": { accountId: encodeBytes(max.id), companyId: "weber" },
  "t-petra": { accountId: "petra-mueller-elektro0", companyId: "mueller" },
};

syncContract("stand-in", async () => {
  const server = standIn(sessions);
  return {
    connect: (token) => ({ fetch: server.fetch, baseUrl: "https://demo.kennwort.test", token }),
    listening: server.listening,
  };
});

describe("stand-in", () => {
  it("knows only its own sessions, not keys every object has (review of K-207)", async () => {
    const server = standIn(sessions);
    for (const token of ["constructor", "toString", "__proto__"]) {
      const response = await server
        .fetch(`https://demo.kennwort.test/api/vaults/${encodeBytes(new Uint8Array(16))}/records`, {
          headers: { authorization: `Bearer ${token}` },
        })
        .catch((e: Error) => ({ status: `threw ${e.message}` }));
      expect([token, response.status]).toEqual([token, 401]);
    }
  });

  it("writes the live stream as SSE and lets a reader go that cancels without a signal", async () => {
    const server = standIn(sessions);
    const vault = encodeBytes(new Uint8Array(16).fill(7));
    const auth = { authorization: "Bearer t-jonas" };
    await server.fetch("https://demo.kennwort.test/api/vaults", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ id: vault }),
    });
    const response = await server.fetch(`https://demo.kennwort.test/api/vaults/${vault}/events`, {
      headers: auth,
    });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("event: ready\ndata: \n\n");
    expect(server.listening(vault)).toBe(1);
    await reader.cancel();
    expect(server.listening(vault)).toBe(0);
    // Stopped by the client's signal: the reader sees the stream end with the reason
    const stop = new AbortController();
    const aborted = await server.fetch(`https://demo.kennwort.test/api/vaults/${vault}/events`, {
      headers: auth,
      signal: stop.signal,
    });
    const second = (aborted.body as ReadableStream<Uint8Array>).getReader();
    await second.read();
    stop.abort(new Error("gone"));
    await expect(second.read()).rejects.toThrow("gone");
    expect(server.listening(vault)).toBe(0);
  });

  it("answers routes it does not know with 404, like the server", async () => {
    const server = standIn(sessions);
    const ask = (method: string, path: string) =>
      server.fetch(`https://demo.kennwort.test${path}`, {
        method,
        headers: { authorization: "Bearer t-jonas" },
      });
    expect((await ask("GET", "/api/elsewhere")).status).toBe(404);
    expect((await ask("POST", "/api/vaults")).status).toBe(400);
    await server.fetch("https://demo.kennwort.test/api/vaults", {
      method: "POST",
      headers: { authorization: "Bearer t-jonas" },
      body: JSON.stringify({ id: encodeBytes(new Uint8Array(16)) }),
    });
    const vault = encodeBytes(new Uint8Array(16));
    expect((await ask("DELETE", `/api/vaults/${vault}/records`)).status).toBe(404);
    expect((await ask("GET", `/api/vaults/${vault}/other`)).status).toBe(404);
    expect(
      (await server.fetch(`https://demo.kennwort.test/api/vaults/${vault}/records`)).status,
    ).toBe(401);
  });
});
