import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createToasts, setLocale } from "../index.ts";
import { GeneratorPanel } from "./generator-panel.tsx";
import type { SettingsStorage } from "./settings.ts";

// K-306 part 3: the generator page; K-402: the same panel in the extension's popup, without storage
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  localStorage.clear();
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  flush();
};

const show = async (remember: "remember" | "forget" = "remember") => {
  const storage: SettingsStorage | undefined = remember === "remember" ? localStorage : undefined;
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const toasts = createToasts();
  dispose = render(() => <GeneratorPanel toasts={toasts} storage={storage} />, root);
  flush();
  await settle();
  return { root, toasts };
};
const result = (root: ParentNode) => root.querySelector("output")?.textContent ?? "";
const strength = (root: ParentNode) => root.querySelector("p")?.textContent;
const checkbox = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))
    ?.querySelector("input") as HTMLInputElement;
const range = (root: ParentNode) => root.querySelector('input[type="range"]') as HTMLInputElement;
const button = (root: ParentNode, label: string) =>
  root.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const tab = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label) as HTMLElement;

describe("GeneratorPanel", () => {
  it("shows a strong password of 20 characters with digits and symbols at first", async () => {
    const { root } = await show();
    expect(result(root)).toHaveLength(20);
    expect(strength(root)).toBe("Stark · 124 Bit");
    expect(checkbox(root, "Ziffern").checked).toBe(true);
    expect(checkbox(root, "Sonderzeichen").checked).toBe(true);
    expect(root.textContent).toContain("Länge: 20 Zeichen");
  });

  it("makes a new one on every change and remembers the options on the device", async () => {
    const { root } = await show();
    range(root).value = "32";
    range(root).dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(result(root)).toHaveLength(32);
    expect(root.textContent).toContain("Länge: 32 Zeichen");
    checkbox(root, "Sonderzeichen").click();
    checkbox(root, "Ziffern").click();
    await settle();
    expect(result(root)).toMatch(/^[a-zA-Z]{32}$/);
    expect(strength(root)).toBe("Stark · 182 Bit");
    expect(JSON.parse(localStorage.getItem("kennwort-generator") ?? "{}").password).toEqual({
      length: 32,
      digits: false,
      symbols: false,
      avoidAmbiguous: false,
      minDigits: 1,
      minSymbols: 1,
    });
    const before = result(root);
    button(root, "Neu erzeugen").click();
    await settle();
    expect(result(root)).not.toBe(before);
  });
});

describe("GeneratorPanel's password options", () => {
  it("avoids look-alikes and keeps the asked minimums when told to", async () => {
    const { root } = await show();
    checkbox(root, "Mehrdeutige Zeichen vermeiden").click();
    const digits = root.querySelector(
      'input[aria-label="Mindestens so viele Ziffern"]',
    ) as HTMLInputElement;
    digits.value = "6";
    digits.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    for (let i = 0; i < 20; i++) {
      expect(result(root)).toHaveLength(20);
      expect(result(root)).not.toMatch(/[0Oo1Iil|]/);
      expect(result(root).replace(/\D/g, "").length).toBeGreaterThanOrEqual(6);
      button(root, "Neu erzeugen").click();
      await settle();
    }
    expect(JSON.parse(localStorage.getItem("kennwort-generator") ?? "{}").password).toMatchObject({
      avoidAmbiguous: true,
      minDigits: 6,
    });
    checkbox(root, "Ziffern").click();
    await settle();
    expect(root.querySelector('input[aria-label="Mindestens so viele Ziffern"]')).toBeNull();
  });

  it("colors digits and symbols but keeps the plain text to read and copy", async () => {
    const { root } = await show();
    const output = root.querySelector("output") as HTMLOutputElement;
    expect(output.getAttribute("aria-label")).toBe("Ergebnis");
    const spans = [...output.querySelectorAll("span")];
    expect(spans.map((s) => s.textContent).join("")).toBe(result(root));
    for (const span of spans) {
      const c = span.textContent ?? "";
      if (/\d/.test(c)) expect(span.className).toContain("text-sky-500");
      else if (/[a-zA-Z]/.test(c)) expect(span.className).toBe("");
      else expect(span.className).toContain("text-rose-500");
    }
    expect(spans.some((s) => s.className.includes("text-sky-500"))).toBe(true);
    expect(spans.some((s) => s.className.includes("text-rose-500"))).toBe(true);
  });
});

describe("GeneratorPanel's other kinds and actions", () => {
  it("makes a passphrase of five words from the list on its tab", async () => {
    const { root } = await show();
    tab(root, "Passphrase").click();
    // The word list loads on first use: wait for it, not for a number of ticks
    await vi.waitFor(() => expect(result(root).split("-").length).toBeGreaterThanOrEqual(5));
    expect(strength(root)).toBe("Gut · 64 Bit");
    expect(root.textContent).toContain("Wörter: 5");
    const separator = root.querySelector("select") as HTMLSelectElement;
    separator.value = " ";
    separator.dispatchEvent(new Event("change", { bubbles: true }));
    checkbox(root, "Wörter groß beginnen").click();
    await vi.waitFor(() => expect(result(root).split(" ")).toHaveLength(5));
    const words = result(root).split(" ");
    for (const word of words) expect(word).toMatch(/^[A-Z]/);
    expect(JSON.parse(localStorage.getItem("kennwort-generator") ?? "{}").kind).toBe("passphrase");
  });

  it("opens with the options remembered on this device", async () => {
    localStorage.setItem(
      "kennwort-generator",
      JSON.stringify({ kind: "passphrase", passphrase: { words: 7, separator: ".", digit: true } }),
    );
    const { root } = await show();
    await vi.waitFor(() => expect(result(root).split(".")).toHaveLength(7));
    expect(result(root)).toMatch(/\d/);
    expect(root.textContent).toContain("Wörter: 7");
    expect(strength(root)).toBe("Stark · 93 Bit");
  });

  it("copies what it made and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { root, toasts } = await show();
    button(root, "Passwort kopieren").click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(result(root));
    expect(toasts.toasts().map((t) => t.text)).toContain("Passwort kopiert");
  });

  it("remembers nothing without a storage, as in the extension, and still makes passwords", async () => {
    const { root } = await show("forget");
    expect(result(root)).toHaveLength(20);
    tab(root, "Passphrase").click();
    flush();
    await vi.waitFor(() => expect(result(root).split("-").length).toBeGreaterThan(3));
    expect(localStorage.getItem("kennwort-generator")).toBeNull();
  });
});
