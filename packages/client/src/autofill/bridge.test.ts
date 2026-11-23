import { describe, expect, it } from "vitest";
import { cancelResponse, fillResponse, parseFillRequest, parseSaveProposal } from "./bridge.ts";

const request = {
  version: 1,
  requestId: "6f1c2a4e-0b9d-4c55-9a3e-1d2f3a4b5c6d",
  target: { kind: "web", host: "portal.weber-haustechnik.test" },
  fields: ["username", "password"],
};

describe("parseFillRequest", () => {
  it("reads a request for a web page", () => {
    expect(parseFillRequest(request)).toEqual({ ok: true, value: request });
  });

  it("reads a request for a native app", () => {
    const app = { ...request, target: { kind: "app", id: "de.weber.lager" } };
    expect(parseFillRequest(app)).toEqual({ ok: true, value: app });
  });

  it("drops a repeated field", () => {
    const parsed = parseFillRequest({ ...request, fields: ["password", "password"] });
    expect(parsed.ok && parsed.value.fields).toEqual(["password"]);
  });

  it.each([
    [null, "not-an-object"],
    [[request], "not-an-object"],
    [{ ...request, version: 2 }, "wrong-version"],
    [{ ...request, requestId: "" }, "bad-request-id"],
    [{ ...request, requestId: "a".repeat(65) }, "bad-request-id"],
    [{ ...request, target: { kind: "web", host: "Portal.Test" } }, "bad-target"],
    [{ ...request, target: { kind: "web", host: "portal.test/login" } }, "bad-target"],
    [{ ...request, target: { kind: "app", id: "1bad" } }, "bad-target"],
    [{ ...request, target: { kind: "file", host: "x" } }, "bad-target"],
    [{ ...request, fields: [] }, "bad-fields"],
    [{ ...request, fields: ["password", "card"] }, "bad-fields"],
  ])("refuses %j with %s", (raw, error) => {
    expect(parseFillRequest(raw)).toEqual({ ok: false, error });
  });
});

describe("responses", () => {
  const parsed = parseFillRequest({ ...request, fields: ["password"] });
  if (!parsed.ok) throw new Error("fixture");

  it("answers only the fields that were asked for", () => {
    expect(fillResponse(parsed.value, { username: "anna", password: "Lager-2026!" })).toEqual({
      version: 1,
      requestId: request.requestId,
      kind: "fill",
      values: { password: "Lager-2026!" },
    });
  });

  it("cancels with the request's id and no values", () => {
    expect(cancelResponse(parsed.value)).toEqual({
      version: 1,
      requestId: request.requestId,
      kind: "cancel",
    });
  });
});

describe("parseSaveProposal", () => {
  const proposal = {
    version: 1,
    requestId: "s-1",
    target: { kind: "app", id: "com.heizungsapp.monteur" },
    username: "max@weber-haustechnik.test",
    password: "M0nteur-App",
  };

  it("reads a login to save", () => {
    expect(parseSaveProposal(proposal)).toEqual({ ok: true, value: proposal });
  });

  it.each([
    [{ ...proposal, version: 2 }, "wrong-version"],
    [{ ...proposal, target: { kind: "web", host: "Evil.test" } }, "bad-target"],
    [{ ...proposal, password: "" }, "bad-fields"],
    [{ ...proposal, password: "x".repeat(4097) }, "bad-fields"],
    [{ ...proposal, username: 1 }, "bad-fields"],
    [null, "not-an-object"],
  ])("refuses %j", (raw, error) => {
    expect(parseSaveProposal(raw)).toEqual({ ok: false, error });
  });
});
