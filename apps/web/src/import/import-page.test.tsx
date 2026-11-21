import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import bitwardenJson from "../../../../packages/core/src/import/fixtures/bitwarden.json?raw";
import chromeCsv from "../../../../packages/core/src/import/fixtures/chrome.csv?raw";
import type { Navigation } from "../navigation.ts";
import { type ImportDeps, ImportPage } from "./import-page.tsx";
import type { Comparable } from "./preview.ts";

// K-501: the import page from the vendor to the reminder to delete the file
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
  }
};

const nav = { go: vi.fn(), route: () => ({ page: "import" }) } as unknown as Navigation;
const VAULTS = [
  { idText: "persoenlich", name: "Persönlich" },
  { idText: "buero", name: "Büro" },
];
type Saved = Awaited<ReturnType<NonNullable<ReturnType<ImportDeps["save"]>>>>;

const deps = (over: Partial<ImportDeps> = {}) => {
  const written: { vault: string; batch: EntryContent[] }[] = [];
  const save = async (vault: string, batch: EntryContent[]): Promise<Saved> => {
    written.push({ vault, batch });
    return { ok: true, value: { saved: batch.map((_, i) => `id-${i}`), unsaved: 0 } };
  };
  const all: ImportDeps = {
    vaults: () => VAULTS,
    existing: () => [],
    save: () => save,
    ...over,
  };
  return { deps: all, written };
};

const show = async (d: ImportDeps) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <ImportPage nav={nav} deps={d} />, root);
  flush();
  await settle();
  return root;
};

const button = (root: ParentNode, name: string | RegExp) => {
  const found = [...root.querySelectorAll("button")].find((b) =>
    typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? ""),
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
const click = async (element: HTMLElement) => {
  element.click();
  flush();
  await settle();
};
const pick = async (root: ParentNode, text: string, name = "export") => {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  const file = new File([text], name);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  flush();
  await settle();
};
const choose = async (root: ParentNode, vendor: string) => click(button(root, vendor));
const rows = (root: ParentNode) =>
  [...root.querySelectorAll('ul[aria-label="Einträge in der Datei"] > li')].map(
    (li) => li.textContent ?? "",
  );

describe("ImportPage up to the file", () => {
  it("offers every vendor and shows how to export from the chosen one", async () => {
    const root = await show(deps().deps);
    expect(root.querySelectorAll("li button").length).toBe(17);
    await choose(root, "Bitwarden (JSON)");
    expect(root.textContent).toContain("Werkzeuge");
    expect(root.querySelector<HTMLInputElement>('input[type="file"]')?.accept).toBe(
      ".json,application/json",
    );
  });

  it("previews a Bitwarden JSON with counts per type, never showing a secret", async () => {
    const root = await show(deps().deps);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, bitwardenJson);
    expect(root.querySelector("h2")?.textContent).toBe("Vorschau");
    expect(root.textContent).toContain("Login: ");
    expect(rows(root).some((r) => r.includes("Online-Banking Sparkasse"))).toBe(true);
    // Neither the password nor its history nor a hidden field shows
    expect(root.textContent).not.toContain("Sp@rkasse");
    expect(root.textContent).not.toContain("90210");
  });

  it("says what is wrong with a file of another vendor and stays on the file step", async () => {
    const root = await show(deps().deps);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, chromeCsv);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Das ist keine gültige JSON-Datei. Hast du das richtige Format gewählt?",
    );
    expect(root.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("says an encrypted export must be exported unencrypted", async () => {
    const root = await show(deps().deps);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, JSON.stringify({ encrypted: true, encKeyValidation_DO_NOT_EDIT: "x" }));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Diese Datei ist verschlüsselt – exportiere unverschlüsselt.",
    );
  });
});

describe("ImportPage preview and import", () => {
  it("skips a duplicate unless it is taken anyway, and flags a weak password", async () => {
    const existing: Comparable[] = [
      {
        title: "portal.sanitaer-grosshandel.example",
        username: "jonas@weber-haustechnik.example",
        website: "https://portal.sanitaer-grosshandel.example/login",
      },
    ];
    const root = await show(deps({ existing: () => existing }).deps);
    await choose(root, "Chrome / Edge / Brave / Opera (CSV)");
    await pick(root, `${chromeCsv}\nRouter,https://router.test,admin,sommer2019,\n`);
    expect(rows(root)[0]).toContain("doppelt");
    expect(root.textContent).toContain("1 Eintrag gibt es schon und wird übersprungen.");
    expect(button(root, /importieren$/).textContent).toBe("3 Einträge importieren");
    expect(rows(root).find((r) => r.includes("Router"))).toContain("schwach");
    const take = root.querySelector<HTMLInputElement>(
      'input[aria-label="portal.sanitaer-grosshandel.example trotzdem importieren"]',
    );
    if (!take) throw new Error("no checkbox");
    await click(take);
    expect(button(root, /importieren$/).textContent).toBe("4 Einträge importieren");
  });

  it("imports into the chosen vault with folders as tags, then asks to delete the file", async () => {
    const { deps: d, written } = deps();
    const root = await show(d);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, bitwardenJson);
    const vault = root.querySelector("select");
    if (!vault) throw new Error("no vault select");
    vault.value = "buero";
    vault.dispatchEvent(new Event("change", { bubbles: true }));
    const tags = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')][0];
    if (!tags) throw new Error("no checkbox");
    await click(tags);
    await click(button(root, /importieren$/));
    expect(written.every((w) => w.vault === "buero")).toBe(true);
    const contents = written.flatMap((w) => w.batch);
    expect(contents.find((c) => c.title === "Online-Banking Sparkasse")?.tags).toContain("Büro");
    expect(root.textContent).toContain("Import fertig");
    expect(root.querySelector('[role="note"]')?.textContent).toContain(
      "Lösche jetzt die Exportdatei",
    );
    // The entries are gone with the preview: only counts are left
    expect(root.textContent).not.toContain("Online-Banking Sparkasse");
  });

  it("links to Zum Ändern after importing a weak password", async () => {
    const root = await show(deps().deps);
    await choose(root, "Chrome / Edge / Brave / Opera (CSV)");
    await pick(
      root,
      "name,url,username,password,note\nRouter,https://router.test,admin,sommer2019,\n",
    );
    await click(button(root, /importieren$/));
    const link = root.querySelector<HTMLAnchorElement>('a[href="/to-change"]');
    expect(link?.textContent).toBe("Schwache Passwörter unter „Zum Ändern“ ansehen");
  });
});

describe("ImportPage with any table", () => {
  it("maps the columns of any table, starting from a guess", async () => {
    const root = await show(deps().deps);
    await choose(root, "Andere Tabelle (CSV)");
    await pick(root, "Bezeichnung,Benutzer,Kennwort\nNAS,admin,Kessel-Pumpe-Rohr-7!\n");
    expect(root.querySelector("h2")?.textContent).toBe("Spalten zuordnen");
    const selects = [...root.querySelectorAll("select")];
    expect(selects.map((s) => s.value)).toEqual(["", "Benutzer", "Kennwort", "", "", "", "", ""]);
    const title = selects[0];
    if (!title) throw new Error("no select");
    title.value = "Bezeichnung";
    title.dispatchEvent(new Event("change", { bubbles: true }));
    flush();
    await click(button(root, "Weiter"));
    expect(root.querySelector("h2")?.textContent).toBe("Vorschau");
    expect(rows(root)[0]).toContain("NAS");
    expect(rows(root)[0]).toContain("admin");
  });

  it("asks for a column before going on without a mapping", async () => {
    const root = await show(deps().deps);
    await choose(root, "Andere Tabelle (CSV)");
    await pick(root, "a,b\n1,2\n");
    await click(button(root, "Weiter"));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Ordne mindestens eine Spalte zu.",
    );
  });
});

describe("ImportPage when nothing may be written", () => {
  it("writes nothing offline and says why", async () => {
    const root = await show(deps({ save: () => undefined }).deps);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, bitwardenJson);
    expect(root.textContent).toContain("Offline – importieren geht erst wieder");
    expect(button(root, /importieren$/).disabled).toBe(true);
  });

  it("says when the store refused a batch because a rotation is due", async () => {
    const save = async (): Promise<Saved> => ({ ok: false, error: "rotation-due" });
    const root = await show(deps({ save: () => save }).deps);
    await choose(root, "Bitwarden (JSON)");
    await pick(root, bitwardenJson);
    await click(button(root, /importieren$/));
    expect(root.textContent).toContain("0 Einträge importiert.");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Schlüsselwechsel");
    expect(root.querySelector('[role="note"]')).not.toBeNull();
  });
});

describe("ImportPage when the person leaves", () => {
  it("zeroes the bytes of a table still being mapped when the page goes", async () => {
    const root = await show(deps().deps);
    await choose(root, "Andere Tabelle (CSV)");
    const text = "Bezeichnung,Benutzer,Kennwort\nNAS,admin,Kessel-Pumpe-Rohr-7!\n";
    const buffer = new TextEncoder().encode(text).buffer;
    const input = root.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    const file = new File([text], "export.csv");
    // The very buffer the page reads, to see what is left in it after leaving
    Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    flush();
    await settle();
    expect(root.querySelector("h2")?.textContent).toBe("Spalten zuordnen");
    dispose();
    dispose = () => {};
    expect(new Uint8Array(buffer).every((b) => b === 0)).toBe(true);
  });
});
