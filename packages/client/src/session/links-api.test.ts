import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { callerOf } from "./api.ts";
import { linkCalls } from "./links-api.ts";

// K-601: the calls the app makes for one-time links, against a recorded server
const id = encodeBytes(new Uint8Array(16).fill(1));
const fetchId = encodeBytes(new Uint8Array(16).fill(2));

const recorder = (answer: { status: number; json: unknown }) => {
  const calls: unknown[][] = [];
  const call: Call = async (...args) => {
    calls.push(args);
    return answer;
  };
  return { calls, api: linkCalls(call) };
};

describe("linkCalls", () => {
  it("creates a link with the ciphertext in base64url and the session's token", async () => {
    const made = { id, fetchId, expiresAt: 9 };
    const { calls, api } = recorder({ status: 201, json: made });
    const answer = await api.createLink("token", {
      ciphertext: Uint8Array.of(1, 2, 3),
      expiresInMs: 3_600_000,
      maxFetches: 2,
    });
    expect(answer).toEqual(made);
    expect(calls).toEqual([
      [
        "POST",
        "/api/links",
        { ciphertext: "AQID", expiresInMs: 3_600_000, maxFetches: 2 },
        "token",
      ],
    ]);
  });

  it("takes no answer it cannot parse or that is not 201", async () => {
    const link = { ciphertext: Uint8Array.of(1), expiresInMs: 3_600_000, maxFetches: 1 };
    expect(await recorder({ status: 201, json: { id } }).api.createLink("t", link)).toBeUndefined();
    const made = { id, fetchId, expiresAt: 9 };
    expect(await recorder({ status: 200, json: made }).api.createLink("t", link)).toBeUndefined();
  });

  it("lists and revokes the account's links", async () => {
    const summary = { id, createdAt: 1, expiresAt: 2, maxFetches: 2, remaining: 1 };
    const listed = recorder({ status: 200, json: { links: [summary] } });
    expect(await listed.api.myLinks("t")).toEqual([summary]);
    expect(listed.calls).toEqual([["GET", "/api/links", undefined, "t"]]);
    expect(await recorder({ status: 500, json: { links: [] } }).api.myLinks("t")).toBeUndefined();
    expect(await recorder({ status: 200, json: { links: "x" } }).api.myLinks("t")).toBeUndefined();
    const revoked = recorder({ status: 200, json: { revoked: true } });
    expect(await revoked.api.revokeLink("t", id)).toBe(true);
    expect(revoked.calls).toEqual([["DELETE", `/api/links/${id}`, undefined, "t"]]);
    expect(await recorder({ status: 404, json: {} }).api.revokeLink("t", id)).toBe(false);
  });

  it("fetches without a token and tells gone, too many, no server and the unexpected apart", async () => {
    const fetched = recorder({
      status: 200,
      json: { ciphertext: "AQID", remaining: 1, expiresAt: 5 },
    });
    expect(await fetched.api.fetchLink(fetchId)).toEqual({
      ok: true,
      value: { ciphertext: Uint8Array.of(1, 2, 3), remaining: 1, expiresAt: 5 },
    });
    expect(fetched.calls).toEqual([["POST", `/auth/links/${fetchId}/open`]]);
    const cases: [number, string][] = [
      [404, "gone"],
      [429, "too-many-requests"],
      [0, "unreachable"],
      [500, "unexpected"],
      [200, "unexpected"],
    ];
    for (const [status, error] of cases)
      expect(await recorder({ status, json: { error: "x" } }).api.fetchLink(fetchId)).toEqual({
        ok: false,
        error,
      });
  });

  it("sends no device identity when made over a plain caller, as the recipient's page is", async () => {
    const sent: RequestInit[] = [];
    const send = (async (_path: string, init: RequestInit) => {
      sent.push(init);
      return new Response('{"error":"not-found"}', { status: 404 });
    }) as typeof fetch;
    await linkCalls(callerOf(send, undefined)).fetchLink(fetchId);
    expect(Object.keys(sent[0]?.headers ?? {})).toEqual(["content-type"]);
    expect(sent[0]?.body).toBeUndefined();
  });
});
