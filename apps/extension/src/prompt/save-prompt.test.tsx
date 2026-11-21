import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { AccountState } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase, PopupAccount } from "../account/popup-account.ts";
import type { Capture, PromptRequest, SaveAnswer } from "../save/messages.ts";
import { type PromptBridge, SavePrompt } from "./save-prompt.tsx";

// K-404: the save prompt compares the submitted login with the entries for the exact host, shows
// itself only when it has something to offer, and writes through the entry store only after a
// click the browser delivered while it was visible and the content script found it clear
const loaded = vi.hoisted(() => ({
  entries: [] as StoredEntry[],
  vaults: [] as unknown[],
  save: vi.fn(),
}));
vi.mock("@kennwort/client/policy/policy.ts", () => ({ applyPolicy: vi.fn() }));
vi.mock("@kennwort/client/vaults/vaults.ts", () => ({
  loadVaults: async () => ({
    ok: true,
    value: { vaults: loaded.vaults, refused: [], people: [], trust: {} },
  }),
}));
vi.mock("@kennwort/client/entries/entry-store.ts", () => ({
  httpServerFor: () => () => ({}),
  createEntryStore: () => {
    const [entries, setEntries] = createSignal<StoredEntry[]>([]);
    return {
      load: async () => setEntries(loaded.entries),
      entries,
      save: loaded.save,
    };
  },
}));

const NONCE = "ab".repeat(16);
const HOST = "portal.weber-haustechnik.test";
const vault = (idText: string, name: string, role = "edit", rotationDue = false) => ({
  idText,
  name,
  role,
  log: { rotationDue },
});
const stored = (vaultIdText: string, password: string): StoredEntry => ({
  idText: "portal",
  vaultIdText,
  role: "edit",
  version: 3,
  content: {
    type: "login",
    title: "Großhandel Portal",
    fields: [
      { id: "username", name: "Benutzername", value: "jonas.weber", kind: "text" },
      { id: "password", name: "Passwort", value: password, kind: "secret" },
      { id: "website", name: "Website", value: `https://${HOST}/login`, kind: "url" },
    ],
    tags: [],
    favorite: false,
    history: [],
  },
});
const CAPTURE: Capture = {
  host: HOST,
  url: `https://${HOST}/login`,
  username: "jonas.weber",
  password: "Kupfer-Rohr-18!",
};

/** An observer that reports the prompt visible (or not) at once */
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

const fakeAccount = (phase: Phase, neverSave: string[] = []) => {
  const state = { neverSave } as unknown as AccountState;
  const updateState = vi.fn(
    async (_api: unknown, change: (s: AccountState) => AccountState | undefined) => {
      const next = change(state);
      return next ? { ok: true as const, value: next } : { ok: false as const, error: "refused" };
    },
  );
  return {
    phase: () => phase,
    restore: vi.fn(async () => {}),
    api: () => ({ syncFetch: fetch }),
    opened: () => ({ state }),
    updateState,
  } as unknown as PopupAccount & { updateState: typeof updateState };
};

let dispose = () => {};
beforeEach(() => {
  setLocale("de", { reload: false });
  loaded.entries = [];
  loaded.vaults = [vault("buero", "Büro"), vault("bau", "Baustellen-Tablets")];
  loaded.save = vi.fn(async () => ({ ok: true, value: "new-id" }));
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
    neverSave?: string[];
    visible?: boolean;
    trusted?: boolean;
    clear?: boolean;
    capture?: Capture;
  } = {},
) => {
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
    trusted: () => options.trusted ?? true,
    wait: async () => {},
    Observer: observerReporting(options.visible ?? true),
  };
  const account = fakeAccount(options.phase ?? "open", options.neverSave);
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => <SavePrompt account={account} capture={options.capture ?? CAPTURE} bridge={bridge} />,
    root,
  );
  await settle();
  const types = () => requests.map((r) => r.type);
  return { requests, types, account };
};

const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent === name);
const click = async (name: string) => {
  button(name)?.click();
  await settle();
};

describe("the save prompt", () => {
  it("offers a new login and saves it into the chosen vault after a click that counts", async () => {
    const { types } = await show();
    expect(types()).toContain("prompt-show");
    expect(document.body.textContent).toContain("Login speichern?");
    expect(document.body.textContent).toContain("jonas.weber");
    expect(document.body.textContent).not.toContain("Kupfer-Rohr-18!");
    const select = document.querySelector("select") as HTMLSelectElement;
    select.value = "bau";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await click("Speichern");
    expect(types()).toContain("prompt-check");
    expect(loaded.save).toHaveBeenCalledOnce();
    const [vaultId, content, entryId] = loaded.save.mock.calls[0] as unknown as [
      string,
      { title: string; fields: { id: string; value: string }[] },
      string | undefined,
    ];
    expect([vaultId, entryId, content.title]).toEqual(["bau", undefined, HOST]);
    expect(content.fields.find((f) => f.id === "password")?.value).toBe("Kupfer-Rohr-18!");
    expect(document.body.textContent).toContain("Gespeichert.");
    expect(types().at(-1)).toBe("prompt-close");
  });

  it("offers only vaults it may write, and asks no choice for one", async () => {
    loaded.vaults = [vault("buero", "Büro"), vault("kunden", "Kunden", "read")];
    await show();
    expect(document.querySelector("select")).toBeNull();
    await click("Speichern");
    expect(loaded.save.mock.calls[0]?.[0]).toBe("buero");
  });

  it("updates a changed password, with the old one in the entry's history", async () => {
    loaded.entries = [stored("buero", "Kupfer-Rohr-17!")];
    await show();
    expect(document.body.textContent).toContain("Passwort aktualisieren?");
    expect(document.body.textContent).toContain("Großhandel Portal");
    await click("Aktualisieren");
    const [vaultId, content, entryId] = loaded.save.mock.calls[0] as unknown as [
      string,
      {
        fields: { id: string; value: string }[];
        history: { fieldId: string; value: string }[];
      },
      string,
    ];
    expect([vaultId, entryId]).toEqual(["buero", "portal"]);
    expect(content.fields.find((f) => f.id === "password")?.value).toBe("Kupfer-Rohr-18!");
    expect(content.history).toEqual([
      expect.objectContaining({ fieldId: "password", value: "Kupfer-Rohr-17!" }),
    ]);
    expect(document.body.textContent).toContain("Aktualisiert.");
  });

  it("closes unseen for a login it already knows, and for a site on the never list", async () => {
    loaded.entries = [stored("buero", "Kupfer-Rohr-18!")];
    const same = await show();
    expect(same.types()).toContain("prompt-close");
    expect(same.types()).not.toContain("prompt-show");
    dispose();
    loaded.entries = [];
    const never = await show({ neverSave: [HOST] });
    expect(never.types()).toContain("prompt-close");
    expect(never.types()).not.toContain("prompt-show");
  });

  it("names a login without user name, in English too", async () => {
    setLocale("en", { reload: false });
    await show({ capture: { ...CAPTURE, username: "" } });
    expect(document.body.textContent).toContain("Save this login?");
    expect(document.body.textContent).toContain("no username");
    expect(button("Never for this site")).toBeDefined();
  });
});

describe("the save prompt writes nothing", () => {
  it("on a click the browser did not deliver, or while covered or not clear", async () => {
    for (const options of [{ trusted: false }, { visible: false }, { clear: false }]) {
      await show(options);
      await click("Speichern");
      expect(loaded.save, JSON.stringify(options)).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        "Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts gespeichert.",
      );
      dispose();
      document.body.innerHTML = "";
    }
  });

  it("but puts the site on the never list in the account state, and closes", async () => {
    const { account, types } = await show({ neverSave: ["sparkasse.test"] });
    await click("Nie für diese Seite");
    expect(account.updateState).toHaveBeenCalledOnce();
    const change = account.updateState.mock.calls[0]?.[1] as (s: AccountState) => AccountState;
    expect(change({ neverSave: ["z.test", HOST] } as AccountState).neverSave).toEqual([
      HOST,
      "z.test",
    ]);
    expect(types().at(-1)).toBe("prompt-close");
    expect(loaded.save).not.toHaveBeenCalled();
  });

  it("while locked: it offers to unlock and opens the popup for it", async () => {
    const { types } = await show({ phase: "locked" });
    expect(types()).toContain("prompt-show");
    expect(document.body.textContent).toContain("Kennwort ist gesperrt");
    await click("Entsperren und speichern");
    expect(types()).toContain("prompt-unlock");
    expect(loaded.save).not.toHaveBeenCalled();
  });

  it("into a read-only vault, one with a rotation due, or without a vault, and says why", async () => {
    loaded.vaults = [vault("kunden", "Kunden", "read")];
    loaded.entries = [stored("kunden", "alt")];
    await show();
    expect(document.body.textContent).toContain("Diesen Eintrag darfst du nur lesen");
    expect(button("Aktualisieren")).toBeUndefined();
    dispose();
    loaded.vaults = [vault("bau", "Bau", "edit", true)];
    loaded.entries = [stored("bau", "alt")];
    await show();
    expect(document.body.textContent).toContain("steht ein Schlüsselwechsel aus");
    dispose();
    loaded.entries = [];
    await show();
    expect(document.body.textContent).toContain("keinen Tresor");
    expect(button("Speichern")).toBeUndefined();
  });

  it("when the store refuses, and says so", async () => {
    loaded.save = vi.fn(async () => ({ ok: false, error: "rotation-due" }));
    await show();
    await click("Speichern");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Schlüsselwechsel aus");
    loaded.save.mockImplementation(async () => ({ ok: false, error: "unreachable" }));
    await click("Speichern");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Nicht gespeichert. Versuch es noch einmal.",
    );
  });
});
