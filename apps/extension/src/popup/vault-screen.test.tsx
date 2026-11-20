import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { createToasts, type Locale, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PopupAccount } from "../account/popup-account.ts";
import texts from "./popup.test-data.json";
import { VaultScreen } from "./vault-screen.tsx";

// The loading itself is the web app's (packages/client, tested there and end to end); here the
// screen gets the entries it would load, to check what it shows of them
const loaded = vi.hoisted(() => ({
  entries: [] as StoredEntry[],
  vaults: "ok" as "ok" | "untrusted",
}));
vi.mock("@kennwort/client/policy/policy.ts", () => ({ applyPolicy: async () => ({ ok: true }) }));
vi.mock("@kennwort/client/vaults/vaults.ts", () => ({
  loadVaults: async () =>
    loaded.vaults === "ok"
      ? { ok: true, value: { vaults: [], refused: [], people: [], trust: {} } }
      : { ok: false, error: "untrusted" },
}));
vi.mock("@kennwort/client/entries/entry-store.ts", () => ({
  httpServerFor: () => () => ({}),
  createEntryStore: () => {
    const [entries, setEntries] = createSignal<StoredEntry[]>([]);
    return { load: async () => setEntries(loaded.entries), entries };
  },
}));

const stored = (
  title: string,
  website: string,
  password: string,
  favorite = false,
): StoredEntry => ({
  idText: title,
  vaultIdText: "v",
  role: "edit",
  version: 1,
  content: {
    type: "login",
    title,
    fields: [
      {
        id: "username",
        name: "",
        value: `${title.toLowerCase()}@weber-haustechnik.test`,
        kind: "text",
      },
      { id: "password", name: "", value: password, kind: "secret" },
      { id: "website", name: "", value: website, kind: "url" },
    ],
    tags: [],
    favorite,
    history: [],
  },
});

const account = {
  api: () => ({ syncFetch: fetch }),
  lockMinutes: () => 10,
  device: () => ({ server: "https://kennwort.weber-haustechnik.test" }),
} as unknown as PopupAccount;

let dispose = () => {};
beforeEach(() => {
  loaded.vaults = "ok";
  loaded.entries = [
    stored("Großhandel", "https://portal.grosshandel.test/login", "Kupfer-Rohr-17", true),
    stored("Bank", "https://bank.test", "Heizung-Wasser-42"),
  ];
});
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
};

const show = async (host: string | undefined, locale: Locale = "de") => {
  setLocale(locale, { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  const toasts = createToasts();
  dispose = render(() => <VaultScreen account={account} host={() => host} toasts={toasts} />, root);
  await settle();
  return { root, toasts };
};

const sections = (root: HTMLElement) =>
  [...root.querySelectorAll("section")].map((section) => ({
    title: section.querySelector("h2")?.textContent,
    entries: [...section.querySelectorAll("li")].map(
      (li) => li.querySelector(".font-medium")?.textContent,
    ),
    text: section.textContent,
  }));
const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  ) as HTMLButtonElement;
const search = (root: HTMLElement, text: string) => {
  const input = root.querySelector("input[type=search]") as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
};

describe("the open popup", () => {
  it.each(["de", "en"] as const)(
    "shows the entries for the page's host first, in %s",
    async (locale) => {
      const { root } = await show("portal.grosshandel.test", locale);
      const text = texts[locale];
      const [page, all] = sections(root);
      expect(page?.title).toBe(text.forHost.replace("{host}", "portal.grosshandel.test"));
      expect(page?.entries).toEqual(["Großhandel"]);
      expect(all?.entries).toEqual(["Bank", "Großhandel"]);
      expect(root.textContent).toContain(text.lockAfter);
    },
  );

  it("shows no entry for another host, not even a subdomain", async () => {
    const { root } = await show("www.portal.grosshandel.test");
    const [page] = sections(root);
    expect(page?.entries).toEqual([]);
    expect(page?.text).toContain(texts.de.noMatches);
  });

  it("searches, but never in passwords", async () => {
    const { root } = await show(undefined);
    search(root, "bank");
    expect(sections(root).map((s) => s.entries)).toEqual([["Bank"]]);
    search(root, "Heizung-Wasser-42");
    expect(sections(root).map((s) => s.entries)).toEqual([[]]);
  });

  it("filters the favorites", async () => {
    const { root } = await show("bank.test");
    button(root, texts.de.favorites).click();
    flush();
    expect(button(root, texts.de.favorites).getAttribute("aria-pressed")).toBe("true");
    expect(sections(root).map((s) => s.entries)).toEqual([["Großhandel"]]);
    button(root, texts.de.all).click();
    flush();
    expect(sections(root)).toHaveLength(2);
  });

  it("copies username and password on a click, and never shows the password", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { root, toasts } = await show("bank.test");
    expect(root.textContent).not.toContain("Heizung-Wasser-42");
    button(root, texts.de.copyPassword.replace("{title}", "Bank")).click();
    await settle();
    expect(writeText).toHaveBeenLastCalledWith("Heizung-Wasser-42");
    expect(toasts.toasts().map((t) => t.text)).toContain("Passwort kopiert");
    button(root, texts.de.copyUsername.replace("{title}", "Bank")).click();
    await settle();
    expect(writeText).toHaveBeenLastCalledWith("bank@weber-haustechnik.test");
  });

  it("opens the generator and goes back to the entries", async () => {
    const { root } = await show(undefined);
    button(root, texts.de.generator).click();
    await settle();
    expect(root.querySelector("output")?.textContent).toHaveLength(20);
    button(root, texts.de.generator).click();
    flush();
    expect(root.querySelector("input[type=search]")).not.toBeNull();
  });

  it("shows nothing when the server's company key is not the known one", async () => {
    loaded.vaults = "untrusted";
    const { root } = await show("bank.test");
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Firmen-Schlüssel");
    expect(root.querySelectorAll("li")).toHaveLength(0);
  });
});
