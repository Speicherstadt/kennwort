import { type Locale, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import texts from "./locked-screen.test-data.json";
import { LockedScreen } from "./locked-screen.tsx";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const show = (locale: Locale) => {
  setLocale(locale, { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <LockedScreen />, root);
  return root;
};

const buttonNames = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].map((button) => button.textContent);

it.each(["de", "en"] as const)("shows the locked state in %s", (locale) => {
  const root = show(locale);
  const expected = texts[locale];
  expect(root.querySelector("h1")?.textContent).toBe(expected.title);
  expect(buttonNames(root)).toEqual([expected.passkey, expected.passphrase]);
  expect(root.querySelector("button")?.className).toContain("bg-primary");
  expect(root.querySelector("[role=status]")?.textContent).toBe("");
});

it("says unlocking is not there yet instead of pretending to work", () => {
  const root = show("de");
  for (const button of root.querySelectorAll("button")) {
    button.click();
    flush();
    expect(root.querySelector("[role=status]")?.textContent).toBe(texts.de.notYet);
  }
});
