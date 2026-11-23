import { encodeBytes } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import type { Call } from "./api.ts";
import { privacyCalls } from "./privacy-api.ts";

// K-607: the calls of the deletion and the export read only what they expect
const answering = (status: number, json: unknown) => {
  const sent: unknown[][] = [];
  const call: Call = async (...args) => {
    sent.push(args);
    return { status, json };
  };
  return { api: privacyCalls(call), sent };
};
const vaults = { drop: ["a"], leave: [], await: ["b"], "sole-manager": [] };

describe("privacyCalls", () => {
  it("reads the plan of a deletion and nothing malformed", async () => {
    const { api, sent } = answering(200, { company: "leave", vaults, refused: null });
    expect(await api.deletionPlan("t")).toEqual({ vaults, refused: null });
    expect(sent).toEqual([["GET", "/api/account/deletion", undefined, "t"]]);
    expect(await answering(200, { vaults, refused: "sole-manager" }).api.deletionPlan("t")).toEqual(
      { vaults, refused: "sole-manager" },
    );
    for (const json of [
      null,
      { vaults: null, refused: null },
      { vaults: { ...vaults, leave: [1] }, refused: null },
      { vaults, refused: "maybe" },
    ])
      expect(await answering(200, json).api.deletionPlan("t")).toBeUndefined();
    expect(await answering(401, { vaults, refused: null }).api.deletionPlan("t")).toBeUndefined();
  });

  it("reads a challenge with its 32 bytes and the account salt", async () => {
    const challenge = encodeBytes(new Uint8Array(32).fill(1));
    const accountSalt = encodeBytes(new Uint8Array(16).fill(2));
    const { api, sent } = answering(200, { challengeId: "c", challenge, accountSalt });
    expect(await api.deletionChallenge("t")).toEqual({
      challengeId: "c",
      challenge: new Uint8Array(32).fill(1),
      accountSalt: new Uint8Array(16).fill(2),
    });
    expect(sent).toEqual([["POST", "/api/account/deletion/challenge", undefined, "t"]]);
    for (const json of [
      { challengeId: "", challenge, accountSalt },
      { challengeId: 5, challenge, accountSalt },
      { challengeId: "c", challenge: accountSalt, accountSalt },
      { challengeId: "c", challenge, accountSalt: challenge },
      "nothing",
    ])
      expect(await answering(200, json).api.deletionChallenge("t")).toBeUndefined();
    expect(
      await answering(409, { challengeId: "c", challenge, accountSalt }).api.deletionChallenge("t"),
    ).toBeUndefined();
  });

  it("sends the confirmation and names why a deletion was refused", async () => {
    const signature = new Uint8Array(65).fill(3);
    const { api, sent } = answering(200, { deleted: true, company: true });
    expect(await api.deleteAccount("t", "c", signature)).toEqual({ ok: true, company: true });
    expect(sent).toEqual([
      ["DELETE", "/api/account", { challengeId: "c", signature: encodeBytes(signature) }, "t"],
    ]);
    const outcome = async (status: number, json: unknown) =>
      answering(status, json).api.deleteAccount("t", "c", signature);
    expect(await outcome(200, { deleted: true })).toEqual({ ok: true, company: false });
    expect(await outcome(200, { deleted: false })).toEqual({ ok: false, error: "unexpected" });
    expect(await outcome(0, undefined)).toEqual({ ok: false, error: "unreachable" });
    expect(await outcome(401, {})).toEqual({ ok: false, error: "denied" });
    expect(await outcome(423, {})).toEqual({ ok: false, error: "locked" });
    expect(await outcome(409, { error: "last-owner" })).toEqual({ ok: false, error: "last-owner" });
    expect(await outcome(409, { error: "sole-manager" })).toEqual({
      ok: false,
      error: "sole-manager",
    });
    expect(await outcome(409, { error: "other" })).toEqual({ ok: false, error: "unexpected" });
    expect(await outcome(500, { error: "last-owner" })).toEqual({ ok: false, error: "unexpected" });
  });

  it("gives the export as the server sent it, nothing on an error", async () => {
    expect(await answering(200, { format: "x" }).api.privacyExport("t")).toEqual({ format: "x" });
    expect(await answering(200, "text").api.privacyExport("t")).toBeUndefined();
    expect(await answering(401, { format: "x" }).api.privacyExport("t")).toBeUndefined();
  });
});
