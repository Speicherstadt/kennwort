// Contract cases from the review of K-207: how fetch really sends requests, size limit and early abort
import { describe, expect, it } from "vitest";
import { encodeBytes } from "../bytes.ts";
import { watchVault } from "../http.ts";
import { recordToWire, sealRecord } from "../record.ts";
import { openBuero } from "./buero.ts";
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
const askAs = (t: Target, token: string, method: string, path: string, body?: BodyInit) => {
  const c = t.connect(token);
  return c.fetch(`${c.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
};
const outcome = (r: Promise<Response>) =>
  r.then(async (res) => [res.status, await res.json()]).catch((e: Error) => ["rejects", e.name]);
const answer = async (r: Response) => [r.status, await r.json()];
const own = () =>
  recordToWire(sealRecord(contextFor(jonas).author, ring, id(0xe1), 1, bank, new Uint8Array()));

export const wireContract = (target: () => Promise<Target>) =>
  describe("the way fetch sends requests", () => {
    it("A: refuses a record over 1 MiB with 413 too-large", async () => {
      const t = await target();
      await openBuero(t);
      const big = { ...own(), padding: "x".repeat(1_200_000) }; // unknown key: the schema drops it
      expect(
        await answer(await ask(t, "PUT", `/api/vaults/${vault}/records`, JSON.stringify(big))),
      ).toEqual([413, { error: "too-large" }]);
    });

    it("takes a record of exactly 1 MiB, the limit itself", async () => {
      const t = await target();
      await openBuero(t);
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
      await openBuero(t);
      const stop = new AbortController();
      stop.abort();
      const ended = await Promise.race([
        watchVault(t.connect("t-anna"), ring.vaultId, () => {}, stop.signal).then(() => "ended"),
        new Promise((r) => setTimeout(() => r("still running"), 500)),
      ]);
      expect([ended, t.listening(vault)]).toEqual(["ended", 0]);
    });
    it("an oversized PUT to another company's vault answers like the server", async () => {
      const t = await target();
      await askAs(t, "t-jonas", "POST", "/api/vaults", JSON.stringify({ id: vault }));
      const big = JSON.stringify({ padding: "x".repeat(1_200_000) });
      expect([
        await outcome(askAs(t, "t-petra", "PUT", `/api/vaults/${vault}/records`, big)),
        await outcome(
          askAs(t, "t-jonas", "PUT", `/api/vaults/${encodeBytes(id(0xb9))}/records`, big),
        ),
      ]).toEqual([
        [413, { error: "too-large" }],
        [413, { error: "too-large" }],
      ]);
    });

    it("a GET with a body is refused as fetch refuses it", async () => {
      const t = await target();
      await askAs(t, "t-jonas", "POST", "/api/vaults", JSON.stringify({ id: vault }));
      expect(
        await outcome(askAs(t, "t-jonas", "GET", `/api/vaults/${vault}/records`, "{}")),
      ).toEqual(["rejects", "TypeError"]);
    });
    it("limits the size only of records: a large body elsewhere is answered as usual", async () => {
      const t = await target();
      await askAs(t, "t-jonas", "POST", "/api/vaults", JSON.stringify({ id: vault }));
      const big = JSON.stringify({ padding: "x".repeat(1_200_000) });
      expect([
        await outcome(askAs(t, "t-jonas", "POST", `/api/vaults/${vault}/records`, big)),
        await outcome(askAs(t, "t-jonas", "PUT", `/api/vaults/${vault}/entries/x/versions`, big)),
      ]).toEqual([
        [404, { error: "not-found" }],
        [404, { error: "not-found" }],
      ]);
    });
    it("a GET with a body is refused by fetch whatever the token", async () => {
      const c = (await target()).connect("nobody");
      const outcome = await c
        .fetch(`${c.baseUrl}/api/vaults/${vault}/records`, {
          headers: { authorization: `Bearer ${c.token}` },
          body: "{}",
        })
        .then((r) => ["answered", r.status])
        .catch((e: Error) => ["rejects", e.name]);
      expect(outcome).toEqual(["rejects", "TypeError"]);
    });
  });
