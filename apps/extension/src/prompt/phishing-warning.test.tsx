import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase, PopupAccount } from "../account/popup-account.ts";
import type { Warning } from "../alert/messages.ts";
import type { PromptRequest, SaveAnswer } from "../save/messages.ts";
import type { PromptBridge } from "./bridge.ts";
import { PhishingWarning } from "./phishing-warning.tsx";

// K-405: the warning names the entry and its site, shows and pins itself only when the decrypted
// entries confirm it, and closes on "continue anyway" only after a click that counts
const loaded = vi.hoisted(() => ({ entries: [] as StoredEntry[] }));
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
const SITE = "portal.weber-haustechnik.test";
const LOOK_ALIKE = "portal-weber-haustechnik.test";
const WARNING: Warning = {
  host: LOOK_ALIKE,
  url: `https://${LOOK_ALIKE}/login`,
  entries: ["portal"],
};
const stored = (...urls: string[]): StoredEntry => ({
  idText: "portal",
  vaultIdText: "buero",
  role: "edit",
  version: 1,
  content: {
    type: "login",
    title: "Großhandel Portal",
    fields: [
      { id: "username", name: "", value: "jonas.weber", kind: "text" },
      { id: "password", name: "", value: "Kupfer-Rohr-18!", kind: "secret" },
      ...urls.map((value, i) => ({ id: `u${i}`, name: "", value, kind: "url" as const })),
    ],
    tags: [],
    favorite: false,
    history: [],
  },
});

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

const fakeAccount = (phase: Phase) =>
  ({
    phase: () => phase,
    restore: vi.fn(async () => {}),
    api: () => ({ syncFetch: fetch }),
    device: () => ({ server: "https://kennwort.weber-haustechnik.test" }),
  }) as unknown as PopupAccount;

let dispose = () => {};
beforeEach(() => {
  setLocale("de", { reload: false });
  loaded.entries = [stored(`https://${SITE}/login`)];
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

const show = async (options: { phase?: Phase; visible?: boolean; clear?: boolean } = {}) => {
  const requests: PromptRequest[] = [];
  const bridge: PromptBridge = {
    nonce: NONCE,
    request: async (request): Promise<SaveAnswer> => {
      requests.push(request);
      if (request.type === "prompt-check") return { ok: options.clear ?? true } as SaveAnswer;
      return { ok: true };
    },
    now: () => 60_000,
    verifiable: true,
    trusted: () => true,
    wait: async () => {},
    Observer: observerReporting(options.visible ?? true),
  };
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => (
      <PhishingWarning
        account={fakeAccount(options.phase ?? "open")}
        warning={WARNING}
        bridge={bridge}
      />
    ),
    root,
  );
  await settle();
  return { types: () => requests.map((r) => r.type) };
};

const byText = (selector: string, text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (el) => el.textContent === text,
  );

describe("the phishing warning", () => {
  it("names the entry and its site, shows itself and stays on top", async () => {
    const { types } = await show();
    expect(types()).toEqual(expect.arrayContaining(["prompt-show", "prompt-pin"]));
    expect(document.body.textContent).toContain(`Ist das wirklich ${SITE}?`);
    expect(document.body.textContent).toContain("„Großhandel Portal“");
    expect(document.body.textContent).toContain(LOOK_ALIKE);
    expect(document.body.textContent).not.toContain("Kupfer-Rohr-18!");
    const change = byText("a", "Passwort ändern") as HTMLAnchorElement;
    expect(change.href).toBe(`https://${SITE}/.well-known/change-password`);
    expect(change.rel).toBe("noopener noreferrer");
    expect((byText("a", "Eintrag öffnen") as HTMLAnchorElement).href).toBe(
      "https://kennwort.weber-haustechnik.test/entries/portal",
    );
    expect(byText("button", `Das ist nicht ${SITE} – trotzdem fortfahren`)).toBeDefined();
  });

  it("closes on continue anyway after a click that counts", async () => {
    const { types } = await show();
    byText("button", `Das ist nicht ${SITE} – trotzdem fortfahren`)?.click();
    await settle();
    expect(types()).toContain("prompt-check");
    expect(types().at(-1)).toBe("prompt-close");
  });

  it("stays open while covered or not clear, and says why", async () => {
    for (const covered of [{ visible: false }, { clear: false }]) {
      const { types } = await show(covered);
      byText("button", `Das ist nicht ${SITE} – trotzdem fortfahren`)?.click();
      await settle();
      expect(types()).not.toContain("prompt-close");
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "Die Warnung war verdeckt oder durchsichtig. Klick noch einmal, sobald du sie ganz siehst.",
      );
      dispose();
      document.body.innerHTML = "";
    }
  });

  it("closes unseen while locked, and when an entry with the password is for this very host", async () => {
    const locked = await show({ phase: "locked" });
    expect(locked.types()).toEqual(["prompt-close"]);
    dispose();
    loaded.entries = [stored(`https://${SITE}`, `https://${LOOK_ALIKE}`)];
    const same = await show();
    expect(same.types()).not.toContain("prompt-show");
    expect(same.types()).toContain("prompt-close");
  });

  it("speaks English in an English browser", async () => {
    setLocale("en", { reload: false });
    await show();
    expect(document.body.textContent).toContain(`Is this really ${SITE}?`);
    expect(byText("button", `This isn't ${SITE} – continue anyway`)).toBeDefined();
    expect(byText("a", "Change password")).toBeDefined();
  });
});
