import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { oidcCalls } from "./oidc-api.ts";

// K-604: the calls the app makes for OpenID Connect, against a recorded server
const id = encodeBytes(new Uint8Array(16).fill(0x40));
const root = encodeBytes(new Uint8Array(32).fill(1));

const recorder = (answer: { status: number; json: unknown }) => {
  const calls: unknown[][] = [];
  const call: Call = async (...args) => {
    calls.push(args);
    return answer;
  };
  return { calls, api: oidcCalls(call) };
};

const upload = {
  accountId: new Uint8Array(16).fill(0x40),
  loginPublicKey: new Uint8Array(32).fill(2),
  accountSalt: new Uint8Array(16).fill(3),
} as Parameters<ReturnType<typeof oidcCalls>["enrolOidc"]>[1];

describe("oidcCalls", () => {
  it("names the provider, or nothing when the server has none", async () => {
    expect(await recorder({ status: 200, json: { name: "Weber SSO" } }).api.oidcProvider()).toBe(
      "Weber SSO",
    );
    expect(await recorder({ status: 404, json: { error: "x" } }).api.oidcProvider()).toBe(
      undefined,
    );
  });

  it("redeems a ticket for a known account or an enrolment, and says why not", async () => {
    const known = recorder({ status: 200, json: { kind: "known", accountId: id } });
    expect(await known.api.redeemTicket("t")).toEqual({
      ok: true,
      value: { kind: "known", accountId: new Uint8Array(16).fill(0x40) },
    });
    expect(known.calls).toEqual([["POST", "/auth/oidc/ticket", { ticket: "t" }]]);
    const enrol = recorder({
      status: 200,
      json: { kind: "enrol", name: "Sandra", rootPublicKey: root },
    });
    expect((await enrol.api.redeemTicket("t")).ok).toBe(true);
    for (const [status, error] of [
      [410, "invalid-ticket"],
      [429, "too-many-requests"],
      [500, "unexpected"],
    ] as const)
      expect(await recorder({ status, json: {} }).api.redeemTicket("t")).toEqual({
        ok: false,
        error,
      });
  });

  it("enrols with the IDs and the sign-in key only, and returns the session", async () => {
    const { calls, api } = recorder({ status: 201, json: { accountId: id, token: "session" } });
    expect(await api.enrolOidc("t", upload)).toEqual({ ok: true, value: "session" });
    expect(calls).toEqual([
      [
        "POST",
        "/auth/oidc/enrol",
        {
          ticket: "t",
          accountId: id,
          loginPublicKey: encodeBytes(upload.loginPublicKey),
          accountSalt: encodeBytes(upload.accountSalt),
        },
      ],
    ]);
    expect(await recorder({ status: 410, json: {} }).api.enrolOidc("t", upload)).toEqual({
      ok: false,
      error: "invalid-ticket",
    });
  });

  it("reads the status, switches enrolment and gets the link address with the token", async () => {
    const status = { name: "Weber SSO", linked: false };
    const read = recorder({ status: 200, json: status });
    expect(await read.api.oidcStatus("token")).toEqual(status);
    expect(read.calls).toEqual([["GET", "/api/oidc", undefined, "token"]]);
    expect(await recorder({ status: 500, json: status }).api.oidcStatus("token")).toBe(undefined);
    const toggle = recorder({ status: 200, json: { open: true } });
    expect(await toggle.api.setEnrolment("token", true)).toBe(true);
    expect(toggle.calls).toEqual([["PUT", "/api/oidc/enrolment", { open: true }, "token"]]);
    expect(await recorder({ status: 403, json: {} }).api.setEnrolment("token", true)).toBe(false);
    const link = recorder({ status: 200, json: { url: "https://sso.test/authorize" } });
    expect(await link.api.linkOidc("token")).toBe("https://sso.test/authorize");
    expect(await recorder({ status: 502, json: {} }).api.linkOidc("token")).toBe(undefined);
  });
});
