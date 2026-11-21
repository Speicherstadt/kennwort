import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginOf } from "./login-fields.ts";

/** happy-dom lays out nothing: every element gets the box of an ordinary field */
const FIELD_BOX = { x: 16, y: 16, width: 240, height: 32 };

/** One element laid out elsewhere (a spy on the element itself would replace the prototype's) */
const placeAt = (element: Element, rect: DOMRectInit) =>
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => DOMRect.fromRect(rect),
    configurable: true,
  });

// K-403: which fields the inline menu opens on and which a fill writes into
const byId = (id: string) => document.getElementById(id);

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect(FIELD_BOX),
  );
});

describe("loginOf", () => {
  it("pairs a password field with the user name field before it", () => {
    document.body.innerHTML = `<form>
      <input id="search" type="search"><input id="user" type="text"><input id="pass" type="password">
    </form>`;
    const login = { username: byId("user"), password: byId("pass") };
    expect(loginOf(byId("pass"))).toEqual(login);
    expect(loginOf(byId("user"))).toEqual(login);
  });

  it("prefers a field marked as user name or e-mail", () => {
    document.body.innerHTML = `<form>
      <input id="mail" type="text" autocomplete="username"><input id="code" type="text">
      <input id="pass" type="password">
    </form>`;
    expect(loginOf(byId("pass"))?.username).toBe(byId("mail"));
  });

  it("stays inside the field's form", () => {
    document.body.innerHTML = `<form><input id="news" type="email"></form>
      <form><input id="pass" type="password"></form>`;
    expect(loginOf(byId("pass"))).toEqual({ password: byId("pass") });
    expect(loginOf(byId("news"))).toBeUndefined();
  });

  it("finds fields without a form in the document", () => {
    document.body.innerHTML = `<input id="user" type="email"><input id="pass" type="password">`;
    expect(loginOf(byId("user"))).toEqual({ username: byId("user"), password: byId("pass") });
  });

  it("opens on a first step that asks only for the user name", () => {
    document.body.innerHTML = `<form><input id="user" autocomplete="username"></form>`;
    expect(loginOf(byId("user"))).toEqual({ username: byId("user") });
  });

  it.each([
    `<input id="f" type="text">`,
    `<input id="f" type="search">`,
    `<input id="f" type="checkbox"><input type="password">`,
    `<textarea id="f"></textarea><input type="password">`,
    `<input id="f" type="password" disabled>`,
    `<input id="f" type="password" readonly>`,
  ])("does not open on %s", (html) => {
    document.body.innerHTML = html;
    expect(loginOf(byId("f"))).toBeUndefined();
  });

  it.each([
    ["not displayed", "display:none"],
    ["transparent", "opacity:0.05"],
    ["invisible", "visibility:hidden"],
  ])("pairs no password field the page hides (%s) with a user name field", (_, style) => {
    document.body.innerHTML = `<form><input id="user" autocomplete="username">
      <input id="pass" type="password" style="${style}"></form>`;
    expect(loginOf(byId("user"))).toEqual({ username: byId("user") });
    expect(loginOf(byId("pass"))).toBeUndefined();
  });

  it("pairs no password field off the page or a pixel small, and no hidden user name field", () => {
    document.body.innerHTML = `<form><input id="hidden" style="opacity:0">
      <input id="user" autocomplete="username"><input id="pass" type="password"></form>`;
    const user = byId("user") as HTMLElement;
    const pass = byId("pass") as HTMLElement;
    expect(loginOf(pass)).toEqual({ username: user, password: pass });
    placeAt(pass, { x: -9999, y: -9999, width: 240, height: 32 });
    expect(loginOf(user)).toEqual({ username: user });
    placeAt(pass, { x: 16, y: 60, width: 1, height: 1 });
    expect(loginOf(user)).toEqual({ username: user });
  });

  it("does not open on things that are no elements", () => {
    expect(loginOf(undefined)).toBeUndefined();
    expect(loginOf(document)).toBeUndefined();
  });
});
