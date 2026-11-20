import { beforeEach, describe, expect, it } from "vitest";
import { loginOf } from "./login-fields.ts";

// K-403: which fields the inline menu opens on and which a fill writes into
const byId = (id: string) => document.getElementById(id);

beforeEach(() => {
  document.body.innerHTML = "";
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

  it("does not open on things that are no elements", () => {
    expect(loginOf(undefined)).toBeUndefined();
    expect(loginOf(document)).toBeUndefined();
  });
});
