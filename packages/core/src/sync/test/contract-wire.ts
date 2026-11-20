// Contract cases from the review of K-207: how fetch really sends requests, size limit and early abort
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../bytes.ts";
import { watchVault } from "../http.ts";
import { recordToWire, sealRecord } from "../record.ts";
import type { Target } from "./contract.ts";
import { bank, contextFor, id, jonas } from "./fixtures.ts";

const ring = contextFor(jonas).ring;
const vault = encodeBytes(ring.vaultId);
const base = (t: Target) => t.connect("t-jonas");
const ask = (t: Target, method: string, path: string, body?: BodyInit) => {
  const c = base(t);
  return c.fetch(`${c.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
};
const answer = async (r: Response) => [r.status, await r.json()];
const own = () =>
  recordToWire(sealRecord(contextFor(jonas).author, ring, id(0xe1), 1, bank, new Uint8Array()));

export const wireContract = (target: () => Promise<Target>) =>
  describe("the way fetch sends requests", () => {
    it("A: refuses a record over 1 MiB with 413 too-large", async () => {
      const t = await target();
      await ask(t, "POST", "/api/vaults", JSON.stringify({ id: vault }));
      const big = { ...own(), padding: "x".repeat(1_200_000) }; // unknown key: the schema drops it
      expect(
        await answer(await ask(t, "PUT", `/api/vaults/${vault}/records`, JSON.stringify(big))),
      ).toEqual([413, { error: "too-large" }]);
    });

    it("takes a record of exactly 1 MiB, the limit itself", async () => {
      const t = await target();
      await ask(t, "POST", "/api/vaults", JSON.stringify({ id: vault }));
      const empty = JSON.stringify({ ...own(), padding: "" });
      const exact = JSON.stringify({ ...own(), padding: "x".repeat(1024 * 1024 - empty.length) });
      expect(new TextEncoder().encode(exact).length).toBe(1024 * 1024);
      expect(await answer(await ask(t, "PUT", `/api/vaults/${vault}/records`, exact))).toEqual([
        200,
        { stored: true },
      ]);
    });

    it("B: reads a body given as bytes, as fetch sends it", async () => {
      const t = await target();
      const body = new TextEncoder().encode(JSON.stringify({ id: vault }));
      expect(await answer(await ask(t, "POST", "/api/vaults", body))).toEqual([201, { id: vault }]);
    });

    it("C: takes a lower-case method the way fetch normalizes it", async () => {
      const t = await target();
      expect(
        await answer(await ask(t, "post", "/api/vaults", JSON.stringify({ id: vault }))),
      ).toEqual([201, { id: vault }]);
    });

    it("D: a watch stopped before it starts ends and leaves no listener", async () => {
      const t = await target();
      await ask(t, "POST", "/api/vaults", JSON.stringify({ id: vault }));
      const stop = new AbortController();
      stop.abort();
      const ended = await Promise.race([
        watchVault(t.connect("t-anna"), ring.vaultId, () => {}, stop.signal).then(() => "ended"),
        new Promise((r) => setTimeout(() => r("still running"), 500)),
      ]);
      expect([ended, t.listening(vault)]).toEqual(["ended", 0]);
    });
  });
