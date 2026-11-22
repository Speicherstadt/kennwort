import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsOf, submittedLogin } from "./capture.ts";
import { geckoAutocomplete } from "../testing/gecko-autocomplete.ts";

// K-404: what a sign-in or change-password submit carries, read only from fields the page shows
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 16, y: 16, width: 240, height: 32 }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** A form with these inputs, each `type:value[:autocomplete][:style]`; returns its inputs */
const form = (...specs: string[]) => {
  document.body.innerHTML = `<form>${specs
    .map((spec) => {
      const [type, value, autocomplete = "", style = ""] = spec.split("|");
      return `<input type="${type}" value="${value}" autocomplete="${autocomplete}" style="${style}">`;
    })
    .join("")}</form>`;
  return inputsOf(document.querySelector("form") as HTMLFormElement);
};

describe("submittedLogin", () => {
  it("reads a sign-in: the user name before the password", () => {
    expect(
      submittedLogin(form("text|suche", "email|jonas@weber.test", "password|Rohr-17!")),
    ).toEqual({
      username: "jonas@weber.test",
      password: "Rohr-17!",
    });
    expect(submittedLogin(form("text|jonas.weber", "text|Werkstatt", "password|Rohr-17!"))).toEqual(
      {
        username: "Werkstatt",
        password: "Rohr-17!",
      },
    );
    expect(
      submittedLogin(form("text|jonas.weber|username", "text|Werkstatt", "password|Rohr-17!")),
    ).toEqual({ username: "jonas.weber", password: "Rohr-17!" });
    expect(submittedLogin(form("password|Rohr-17!"))).toEqual({
      username: "",
      password: "Rohr-17!",
    });
  });

  it("reads nothing without a filled password field", () => {
    expect(submittedLogin(form("text|jonas.weber", "password|"))).toBeUndefined();
    expect(submittedLogin(form("text|jonas.weber"))).toBeUndefined();
  });

  it("never reads a field the page hides, or one the user cannot type into", () => {
    for (const style of ["display:none", "opacity:0", "visibility:hidden"])
      expect(
        submittedLogin(form("text|jonas.weber", `password|Rohr-17!||${style}`)),
      ).toBeUndefined();
    const hiddenUser = form("text|ein-name||display:none", "password|Rohr-17!");
    expect(submittedLogin(hiddenUser)).toEqual({ username: "", password: "Rohr-17!" });
    const [user, pass] = form("text|jonas.weber", "password|Rohr-17!");
    (pass as HTMLInputElement).disabled = true;
    expect(submittedLogin([user as HTMLInputElement, pass as HTMLInputElement])).toBeUndefined();
    const hiddenType = form("hidden|jonas.weber", "password|Rohr-17!");
    expect(submittedLogin(hiddenType)).toEqual({ username: "", password: "Rohr-17!" });
  });

  it("reads a change-password form: current, new and confirmation", () => {
    expect(
      submittedLogin(form("text|jonas", "password|alt", "password|neu", "password|neu")),
    ).toEqual({ username: "jonas", password: "neu", previous: "alt" });
    // New and confirmation only
    expect(submittedLogin(form("password|neu", "password|neu"))).toEqual({
      username: "",
      password: "neu",
    });
    // Current and new, without confirmation
    expect(submittedLogin(form("password|alt", "password|neu"))).toEqual({
      username: "",
      password: "neu",
      previous: "alt",
    });
    // Marked fields decide, whatever their order
    expect(
      submittedLogin(form("password|neu|new-password", "password|alt|current-password")),
    ).toEqual({ username: "", password: "neu", previous: "alt" });
  });

  // Firefox's `input.autocomplete` says only "on" or "off" by default (testing/gecko-autocomplete.ts)
  it("reads the fields marked new-password and username as Firefox reports them", () => {
    geckoAutocomplete();
    expect(
      submittedLogin(form("password|neu|new-password", "password|alt|current-password")),
    ).toEqual({ username: "", password: "neu", previous: "alt" });
    expect(
      submittedLogin(form("text|jonas|username", "text|Weber", "password|Rohr-17!")),
    ).toEqual({ username: "jonas", password: "Rohr-17!" });
  });

  it("reads nothing when the confirmation differs from the new password", () => {
    expect(submittedLogin(form("password|alt", "password|neu", "password|nue"))).toBeUndefined();
    expect(
      submittedLogin(form("password|neu|new-password", "password|nue|new-password")),
    ).toBeUndefined();
  });
});

describe("inputsOf", () => {
  it("takes a form's own inputs, or a document's inputs outside any form", () => {
    document.body.innerHTML = `<form id="a"><input id="in-a"></form><input id="loose">
      <input id="owned" form="a">`;
    const ids = (inputs: HTMLInputElement[]) => inputs.map((input) => input.id);
    expect(ids(inputsOf(document.getElementById("a") as HTMLFormElement))).toEqual(["in-a"]);
    expect(ids(inputsOf(document))).toEqual(["loose"]);
  });
});
