import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillLogin } from "./fill-in.ts";

// K-403: a fill writes the values and tells the page's scripts as typing would
const input = (type: string) => {
  const element = document.createElement("input");
  element.type = type;
  document.body.append(element);
  return element;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("fillLogin", () => {
  it("writes user name and password and fires input and change", () => {
    const username = input("text");
    const password = input("password");
    const events: string[] = [];
    for (const type of ["input", "change"]) {
      document.body.addEventListener(type, (event) =>
        events.push(`${(event.target as HTMLInputElement).type}:${type}`),
      );
    }
    expect(fillLogin({ username, password }, { username: "jonas", password: "Kupfer-17" })).toBe(
      true,
    );
    expect([username.value, password.value]).toEqual(["jonas", "Kupfer-17"]);
    expect(events).toEqual(["text:input", "text:change", "password:input", "password:change"]);
  });

  it("goes through the input's own value setter, not one the page put on the element", () => {
    const password = input("password");
    const planted = vi.fn();
    Object.defineProperty(password, "value", { set: planted, get: () => "", configurable: true });
    fillLogin({ password }, { username: "", password: "Kupfer-17" });
    expect(planted).not.toHaveBeenCalled();
  });

  it("leaves the user name alone when the entry has none", () => {
    const username = input("text");
    username.value = "typed";
    fillLogin({ username, password: input("password") }, { username: "", password: "x" });
    expect(username.value).toBe("typed");
  });

  it("fills nothing when the fields are gone", () => {
    const password = input("password");
    password.remove();
    expect(fillLogin({ password }, { username: "a", password: "b" })).toBe(false);
  });
});
