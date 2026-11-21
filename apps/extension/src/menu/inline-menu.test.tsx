import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { type Locale, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase, PopupAccount } from "../account/popup-account.ts";
import type { MenuAnswer, MenuRequest } from "../fill/messages.ts";
import { InlineMenu, type MenuBridge } from "./inline-menu.tsx";

// K-403: the inline menu lists the entries for its frame's exact host and asks the service worker
// to fill only on a click the browser delivered while the menu was visible. Loading is the web
// app's (packages/client); here the menu gets the entries it would load.
const loaded = vi.hoisted(() => ({ entries: [] as StoredEntry[] }));
const policy = vi.hoisted(() => vi.fn());
vi.mock("@kennwort/client/policy/policy.ts", () => ({ applyPolicy: policy }));
vi.mock("@kennwort/client/vaults/vaults.ts", () => ({
  loadVaults: async () => ({ ok: true, value: { vaults: [], refused: [], people: [], trust: {} } }),
}));
vi.mock("@kennwort/client/entries/entry-store.ts", () => ({
  httpServerFor: () => () => ({}),
  createEntryStore: () => {
    const [entries, setEntries] = createSignal<StoredEntry[]>([]);
    return { load: async () => setEntries(loaded.entries), entries };
  },
}));

const NONCE = "ab".repeat(16);
const HOST = "portal.weber-haustechnik.test";
const login = (title: string, website: string, password: string): StoredEntry => ({
  idText: title,
  vaultIdText: "v",
  role: "edit",
  version: 1,
  content: {
    type: "login",
    title,
    fields: [
      { id: "username", name: "", value: "jonas.weber", kind: "text" },
      { id: "password", name: "", value: password, kind: "secret" },
      { id: "website", name: "", value: website, kind: "url" },
    ],
    tags: [],
    favorite: false,
    history: [],
  },
});

const fakeAccount = (phase: Phase) =>
  ({
    phase: () => phase,
    restore: vi.fn(async () => {}),
    api: () => ({ syncFetch: fetch }),
  }) as unknown as PopupAccount;

/** An observer that reports the menu visible (or not) at once */
const observerReporting = (isVisible: boolean) =>
  class {
    constructor(
      private report: (
        r: { isVisible: boolean; intersectionRatio: number; time: number }[],
      ) => void,
    ) {}
    observe() {
      this.report([{ isVisible, intersectionRatio: 1, time: 0 }]);
    }
    disconnect() {}
  };

let dispose = () => {};
beforeEach(() => {
  loaded.entries = [
    login("Großhandel Portal", `https://${HOST}/login`, "Kupfer-Rohr-17!"),
    login("Sparkasse", "https://sparkasse.test", "Rohr-Ventil-2026!"),
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

const show = async (
  options: {
    phase?: Phase;
    page?: MenuAnswer;
    visible?: boolean;
    clock?: number;
    trusted?: boolean;
    verifiable?: boolean;
    locale?: Locale;
  } = {},
) => {
  setLocale(options.locale ?? "de", { reload: false });
  const requests: MenuRequest[] = [];
  const answers: Record<string, MenuAnswer> = {
    "menu-page": options.page ?? { ok: true, host: HOST },
    "menu-fill": { ok: true },
  };
  const bridge: MenuBridge = {
    nonce: NONCE,
    request: async (request) => {
      requests.push(request);
      return answers[request.type] ?? { ok: true };
    },
    // Far past the arming time unless a test says otherwise
    now: () => options.clock ?? 60_000,
    verifiable: options.verifiable ?? true,
    trusted: () => options.trusted ?? true,
    wait: async () => {},
    Observer: observerReporting(options.visible ?? true),
  };
  const account = fakeAccount(options.phase ?? "open");
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <InlineMenu account={account} bridge={bridge} />, root);
  await settle();
  return { requests, account, answers };
};

const entryButton = (title: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${title} ausfüllen"]`);
const fills = (requests: MenuRequest[]) => requests.filter((r) => r.type === "menu-fill");

describe("the inline menu", () => {
  it("lists only the entries for its frame's exact host, under the host", async () => {
    await show();
    expect(document.querySelector("header")?.textContent).toContain(HOST);
    expect(entryButton("Großhandel Portal")).not.toBeNull();
    expect(entryButton("Sparkasse")).toBeNull();
    expect(document.body.textContent).not.toContain("Kupfer-Rohr-17!");
  });

  it("opens the account without moving the lock time and loads no policy", async () => {
    const { account } = await show();
    expect(account.restore).toHaveBeenCalled();
    expect(policy).not.toHaveBeenCalled();
  });

  it("asks the worker to fill on a click, with the entry's stored addresses", async () => {
    const { requests } = await show();
    entryButton("Großhandel Portal")?.click();
    await settle();
    expect(fills(requests)).toEqual([
      {
        type: "menu-fill",
        nonce: NONCE,
        addresses: [`https://${HOST}/login`],
        username: "jonas.weber",
        password: "Kupfer-Rohr-17!",
      },
    ]);
  });

  it("fills nothing on a click the browser did not deliver", async () => {
    const { requests } = await show({ trusted: false });
    entryButton("Großhandel Portal")?.click();
    await settle();
    expect(fills(requests)).toEqual([]);
  });

  it("fills nothing while the browser reports it covered or faded, and says so", async () => {
    const { requests } = await show({ visible: false });
    expect(document.querySelector("main")?.dataset.armed).toBe("false");
    entryButton("Großhandel Portal")?.click();
    await settle();
    expect(fills(requests)).toEqual([]);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Das Menü war verdeckt oder durchsichtig. Kennwort hat nichts ausgefüllt.",
    );
  });

  it("fills nothing right after it became visible", async () => {
    const { requests } = await show({ clock: 100 });
    entryButton("Großhandel Portal")?.click();
    await settle();
    expect(fills(requests)).toEqual([]);
  });

  it("says when the worker or the page refused the fill", async () => {
    const { answers } = await show();
    answers["menu-fill"] = { ok: false, error: "no-match" };
    entryButton("Großhandel Portal")?.click();
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Kennwort hat nichts ausgefüllt: Die Seite passt nicht mehr zum Eintrag.",
    );
  });

  it("shows no entries in a frame the worker refuses", async () => {
    await show({ page: { ok: false, error: "foreign-frame" } });
    expect(entryButton("Großhandel Portal")).toBeNull();
    expect(document.body.textContent).toContain("In diesen Rahmen füllt Kennwort nichts aus");
  });

  it("offers to open the popup while Kennwort is locked", async () => {
    const { requests } = await show({ phase: "locked", locale: "en" });
    expect(document.body.textContent).toContain("Kennwort is locked");
    const open = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Open to unlock",
    );
    open?.click();
    expect(requests.at(-1)).toEqual({ type: "menu-unlock" });
  });

  it("says so where the browser cannot report visibility", async () => {
    await show({ verifiable: false });
    expect(document.body.textContent).toContain(
      "Dieser Browser kann nicht bestätigen, dass das Menü sichtbar ist.",
    );
  });

  it("closes on Esc and moves between entries with the arrow keys", async () => {
    loaded.entries.push(login("Portal Lager", `https://${HOST}/lager`, "x"));
    const { requests } = await show();
    const [first, second] = document.querySelectorAll<HTMLButtonElement>("button[data-entry]");
    first?.focus();
    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(second);
    second?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(requests.at(-1)).toEqual({ type: "menu-close", nonce: NONCE });
  });
});
