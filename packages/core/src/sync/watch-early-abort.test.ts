// Regression (review of K-204): watchVault ends quietly when the signal aborts while reading, but rejects when it
// aborts before the response headers arrived (an unmount right after mounting)
import { describe, expect, it } from "vitest";
import { type Connection, watchVault } from "./http.ts";
import { contextFor, jonas } from "./test/fixtures.ts";

const vaultId = contextFor(jonas).ring.vaultId;

/** Like the platform fetch: still waiting for headers, rejects with AbortError on abort */
const slowHeaders: Connection = {
  fetch: ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    })) as unknown as typeof fetch,
  baseUrl: "https://kennwort.weber-haustechnik.test",
  token: "t",
};

describe("watchVault stopped early", () => {
  it("ends without an error when the signal aborts before the stream opened", async () => {
    const stop = new AbortController();
    const watching = watchVault(slowHeaders, vaultId, () => {}, stop.signal);
    stop.abort();
    await expect(watching).resolves.toBeUndefined();
  });
});
