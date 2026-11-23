import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { pwnedCalls } from "./pwned-api.ts";

// K-603: the leak check asks its own server for a range, with the prefix only
const recorder = (answer: { status: number; json: unknown }) => {
  const calls: unknown[][] = [];
  const call: Call = async (...args) => {
    calls.push(args);
    return answer;
  };
  return { calls, api: pwnedCalls(call) };
};

describe("pwnedCalls", () => {
  it("asks for the prefix's range with the session's token, nothing in a body", async () => {
    const { calls, api } = recorder({ status: 200, json: { range: "AB:1" } });
    expect(await api.pwnedRange("token", "5BAA6")).toEqual({ ok: true, value: "AB:1" });
    expect(calls).toEqual([["GET", "/api/pwned/5BAA6", undefined, "token"]]);
  });

  it.each([
    [404, "unavailable"],
    [429, "limited"],
    [502, "unreachable"],
    [0, "unreachable"],
    [400, "unreachable"],
  ])("reads status %i as %s", async (status, error) => {
    const { api } = recorder({ status, json: { range: "AB:1" } });
    expect(await api.pwnedRange("token", "5BAA6")).toEqual({ ok: false, error });
  });

  it.each([[undefined], [null], ["AB:1"], [{ range: 3 }], [{}]])(
    "calls %j no range",
    async (json) => {
      const { api } = recorder({ status: 200, json });
      expect(await api.pwnedRange("token", "5BAA6")).toEqual({ ok: false, error: "malformed" });
    },
  );
});
