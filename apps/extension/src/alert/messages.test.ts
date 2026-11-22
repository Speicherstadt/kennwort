import { describe, expect, it } from "vitest";
import { alertOpenMessage, alertRequest, warningOf } from "./messages.ts";

// K-405: the worker takes from a content script only a short tag, never a typed value
describe("the messages of the phishing warning", () => {
  it("takes a salt request and a check with exactly a four-byte tag in hex", () => {
    expect(alertRequest({ type: "alert-salt", extra: 1 })).toEqual({ type: "alert-salt" });
    expect(alertRequest({ type: "alert-check", tag: "0a1b2c3d" })).toEqual({
      type: "alert-check",
      tag: "0a1b2c3d",
    });
  });

  it("refuses anything that could carry more than the tag", () => {
    for (const bad of [
      { type: "alert-check", tag: "Kupfer-Rohr-18!" },
      { type: "alert-check", tag: "0a1b2c3d4e" },
      { type: "alert-check", tag: "0A1B2C3D" },
      { type: "alert-check", tag: 12 },
      { type: "alert-check" },
      { type: "save-pending" },
      "alert-salt",
      null,
    ])
      expect(alertRequest(bad)).toBeUndefined();
    // Only the tag goes on: an extra field never reaches the worker's logic
    expect(alertRequest({ type: "alert-check", tag: "0a1b2c3d", password: "x" })).toEqual({
      type: "alert-check",
      tag: "0a1b2c3d",
    });
  });

  it("reads the worker's push to open the warning, and nothing else", () => {
    expect(alertOpenMessage({ type: "kennwort-alert-open" })).toBe(true);
    expect(alertOpenMessage({ type: "kennwort-prompt-show" })).toBe(false);
    expect(alertOpenMessage(undefined)).toBe(false);
  });

  it("reads a warning handed to the prompt", () => {
    const warning = {
      host: "portal-weber.test",
      url: "https://portal-weber.test/",
      entries: ["e1"],
    };
    expect(warningOf(warning)).toEqual(warning);
    expect(warningOf({ ...warning, entries: [1] })).toBeUndefined();
    expect(warningOf({ ...warning, host: undefined })).toBeUndefined();
    expect(warningOf("x")).toBeUndefined();
  });
});
