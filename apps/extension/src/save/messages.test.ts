import { describe, expect, it } from "vitest";
import { captureRequest, promptContentMessage, promptRequest } from "./messages.ts";

// K-404: the worker and the content script act only on messages of their exact shape
const NONCE = "0123456789abcdef0123456789abcdef";

describe("the messages of saving a login", () => {
  it("takes a submitted login with a password, and the current one if given", () => {
    expect(captureRequest({ type: "save-capture", username: "jonas", password: "neu" })).toEqual({
      type: "save-capture",
      username: "jonas",
      password: "neu",
    });
    expect(
      captureRequest({ type: "save-capture", username: "", password: "neu", previous: "alt" }),
    ).toEqual({ type: "save-capture", username: "", password: "neu", previous: "alt" });
    expect(captureRequest({ type: "save-pending", extra: 1 })).toEqual({ type: "save-pending" });
  });

  it("refuses a login without a password, with odd values or far too long", () => {
    for (const bad of [
      { type: "save-capture", username: "jonas", password: "" },
      { type: "save-capture", username: 1, password: "neu" },
      { type: "save-capture", username: "jonas", password: "neu", previous: "" },
      { type: "save-capture", username: "jonas", password: "neu", previous: 5 },
      { type: "save-capture", username: "jonas", password: "x".repeat(1025) },
      { type: "save-capture", username: "x".repeat(1025), password: "neu" },
      { type: "other" },
      null,
      "save-pending",
    ])
      expect(captureRequest(bad)).toBeUndefined();
    expect(
      captureRequest({ type: "save-capture", username: "", password: "x".repeat(1024) }),
    ).toBeDefined();
  });

  it("takes the prompt's requests only with a nonce", () => {
    for (const type of [
      "prompt-take",
      "prompt-show",
      "prompt-check",
      "prompt-close",
      "prompt-unlock",
    ])
      expect(promptRequest({ type, nonce: NONCE })).toEqual({ type, nonce: NONCE });
    expect(promptRequest({ type: "prompt-size", nonce: NONCE, height: 90 })).toEqual({
      type: "prompt-size",
      nonce: NONCE,
      height: 90,
    });
    expect(
      promptRequest({ type: "prompt-size", nonce: NONCE, height: Number.NaN }),
    ).toBeUndefined();
    expect(promptRequest({ type: "prompt-take", nonce: "zz" })).toBeUndefined();
    expect(promptRequest({ type: "prompt-take" })).toBeUndefined();
    expect(promptRequest({ type: "prompt-other", nonce: NONCE })).toBeUndefined();
    expect(promptRequest(undefined)).toBeUndefined();
  });

  it("passes on to the content script only the worker's prompt messages", () => {
    for (const type of [
      "kennwort-prompt-owns",
      "kennwort-prompt-show",
      "kennwort-prompt-check",
      "kennwort-prompt-close",
    ])
      expect(promptContentMessage({ type, nonce: NONCE })).toEqual({ type, nonce: NONCE });
    expect(
      promptContentMessage({ type: "kennwort-prompt-size", nonce: NONCE, height: 80 }),
    ).toEqual({ type: "kennwort-prompt-size", nonce: NONCE, height: 80 });
    expect(promptContentMessage({ type: "kennwort-prompt-size", nonce: NONCE })).toBeUndefined();
    expect(promptContentMessage({ type: "kennwort-fill", nonce: NONCE })).toBeUndefined();
    expect(promptContentMessage({ type: "kennwort-prompt-show", nonce: "x" })).toBeUndefined();
  });
});
