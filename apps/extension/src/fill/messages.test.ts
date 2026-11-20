import { describe, expect, it } from "vitest";
import { contentMessage, menuRequest, newNonce } from "./messages.ts";

// K-403: the worker and the content script act only on messages of their exact shape
const NONCE = "0123456789abcdef0123456789abcdef";

describe("menuRequest", () => {
  it.each([
    { type: "menu-page", nonce: NONCE },
    { type: "menu-close", nonce: NONCE },
    { type: "menu-size", nonce: NONCE, height: 120 },
    { type: "menu-fill", nonce: NONCE, addresses: ["bank.test"], username: "a", password: "b" },
    { type: "menu-unlock" },
  ])("reads %o", (message) => {
    expect(menuRequest(message)).toEqual(message);
  });

  it("drops what it does not know", () => {
    expect(menuRequest({ type: "menu-page", nonce: NONCE, extra: 1 })).toEqual({
      type: "menu-page",
      nonce: NONCE,
    });
  });

  it.each([
    null,
    "menu-page",
    { type: "menu-page" },
    { type: "menu-page", nonce: "ABC" },
    { type: "menu-size", nonce: NONCE, height: Number.NaN },
    { type: "menu-fill", nonce: NONCE, addresses: "bank.test", username: "a", password: "b" },
    { type: "menu-fill", nonce: NONCE, addresses: [], username: 1, password: "b" },
    { type: "kennwort-fill", nonce: NONCE },
  ])("refuses %o", (message) => {
    expect(menuRequest(message)).toBeUndefined();
  });
});

describe("contentMessage", () => {
  it.each([
    { type: "kennwort-fill", nonce: NONCE, host: "bank.test", username: "a", password: "b" },
    { type: "kennwort-menu-size", nonce: NONCE, height: 90 },
    { type: "kennwort-menu-close", nonce: NONCE },
  ])("reads %o", (message) => {
    expect(contentMessage(message)).toEqual(message);
  });

  it.each([
    { type: "kennwort-fill", nonce: NONCE, host: "bank.test", username: "a" },
    { type: "kennwort-menu-close" },
    { type: "menu-fill", nonce: NONCE },
    undefined,
  ])("refuses %o", (message) => {
    expect(contentMessage(message)).toBeUndefined();
  });
});

it("makes a nonce of 128 random bits in hex", () => {
  expect(newNonce((length) => new Uint8Array(length).fill(171))).toBe("ab".repeat(16));
  expect(
    menuRequest({ type: "menu-close", nonce: newNonce((n) => new Uint8Array(n)) }),
  ).toBeTruthy();
});
