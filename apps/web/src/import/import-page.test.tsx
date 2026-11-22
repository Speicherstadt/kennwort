import { readFileSync } from "node:fs";
import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import bitwardenJson from "../../../../packages/core/src/import/fixtures/bitwarden.json?raw";
import chromeCsv from "../../../../packages/core/src/import/fixtures/chrome.csv?raw";
import google from "../../../../packages/core/src/import/fixtures/google-authenticator.txt?raw";
import exportFile from "../../../../packages/core/src/import/fixtures/kennwort-export.json?raw";
import twofas from "../../../../packages/core/src/import/fixtures/twofas.2fas?raw";
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
    expect(root.querySelectorAll("li button").length).toBe(25);
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

describe("ImportPage with an authenticator (K-503)", () => {
  const paste = async (root: ParentNode, text: string) => {
    const area = root.querySelector("textarea");
    if (!area) throw new Error("no textarea");
    area.value = text;
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    await click(button(root, "Weiter"));
  };
  const [first = ""] = google.trim().split("\n");

  it("takes Google Authenticator's pasted export links and says which codes stay out", async () => {
    const { deps: d, written } = deps();
    const root = await show(d);
    await choose(root, "Google Authenticator (QR-Code)");
    expect(root.querySelector('input[type="file"]')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toBe("Noch kein QR-Code gelesen.");
    expect(button(root, "QR-Code scannen")).toBeDefined();
    await paste(root, google);
    expect(root.querySelector("h2")?.textContent).toBe("Vorschau");
    expect(rows(root).map((r) => r.slice(0, 9))).toEqual(["DATEVLogi", "Microsoft", "Sparkasse"]);
    expect(root.textContent).toContain("1 Code übernimmt Kennwort nicht");
    // The keys never show
    expect(root.textContent).not.toContain("JBSWY3DPEHPK3PXP");
    await click(button(root, /importieren$/));
    const datev = written.flatMap((w) => w.batch).find((c) => c.title === "DATEV");
    expect(datev?.fields.find((f) => f.kind === "totp")?.value).toContain(
      "secret=JBSWY3DPEHPK3PXP",
    );
  });

  it("asks for the missing QR codes, a link first, and an export link", async () => {
    const root = await show(deps().deps);
    await choose(root, "Google Authenticator (QR-Code)");
    await click(button(root, "Weiter"));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Scanne zuerst einen QR-Code oder füge einen Export-Link ein.",
    );
    await paste(root, first);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Es fehlen QR-Codes dieses Exports. Scanne jeden QR-Code, den Google Authenticator zeigt.",
    );
    await paste(root, "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP");
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Das ist kein Export-Link von Google Authenticator.",
    );
  });

  it("reads a 2FAS backup and counts its HOTP and Steam codes as left out", async () => {
    const root = await show(deps().deps);
    await choose(root, "2FAS (.2fas)");
    await pick(root, twofas, "backup.2fas");
    expect(rows(root)).toHaveLength(3);
    expect(root.textContent).toContain("2 Codes übernimmt Kennwort nicht");
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

describe("ImportPage with a KeePass database (K-502 Teil 3)", () => {
  const fixtures = "../../../../packages/core/src/import/fixtures/";
  const bytesOf = (name: string) => readFileSync(new URL(fixtures + name, import.meta.url));
  /** Picks the database (and key file), types the password and opens it */
  const unlock = async (root: ParentNode, password: string, keyFile?: string) => {
    const set = (name: string, file: string) => {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error(`no ${name}`);
      Object.defineProperty(input, "files", {
        value: [new File([bytesOf(file)], file)],
        configurable: true,
      });
    };
    set("database", "kdbx-keyfile-v1.kdbx");
    if (keyFile) set("key-file", keyFile);
    const field = root.querySelector<HTMLInputElement>('input[type="password"]');
    if (!field) throw new Error("no password field");
    field.value = password;
    await click(button(root, "Datenbank öffnen"));
    return field;
  };

  it("asks for the master password and a key file, then previews the entries", async () => {
    const root = await show(deps().deps);
    await choose(root, "KeePass / KeePassXC (KDBX)");
    expect(root.textContent).toContain("Master-Passwort");
    expect(root.querySelector<HTMLInputElement>('input[name="database"]')?.accept).toBe(".kdbx");
    const field = await unlock(root, "Weber-Haustechnik-2026", "kdbx-key-v1.key");
    // The field lets go of the password as soon as the reader has it
    expect(field.value).toBe("");
    expect(root.querySelector("h2")?.textContent).toBe("Vorschau");
    expect(rows(root).some((r) => r.includes("Lohnbüro Sandra"))).toBe(true);
    expect(root.textContent).not.toContain("Bilanz#2026-Anna");
  });

  it("says when the password or key file does not fit, and stays on the step", async () => {
    const root = await show(deps().deps);
    await choose(root, "KeePass / KeePassXC (KDBX)");
    await unlock(root, "Weber-Haustechnik-2026");
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Passwort oder Schlüsseldatei passen nicht zu dieser Datenbank.",
    );
    expect(root.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("zeroes the key file's bytes when the database cannot be read", async () => {
    const root = await show(deps().deps);
    await choose(root, "KeePass / KeePassXC (KDBX)");
    const keyBuffer = bytesOf("kdbx-key-v1.key").buffer.slice(0);
    const database = new File([], "weber.kdbx");
    Object.defineProperty(database, "arrayBuffer", { value: () => Promise.reject(new Error()) });
    const keyFile = new File([], "weber.key");
    // The very buffer the page reads, to see what is left in it afterwards
    Object.defineProperty(keyFile, "arrayBuffer", { value: async () => keyBuffer });
    for (const [name, file] of [
      ["database", database],
      ["key-file", keyFile],
    ] as const) {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      Object.defineProperty(input, "files", { value: [file], configurable: true });
    }
    await click(button(root, "Datenbank öffnen"));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Datei ließ sich nicht öffnen.",
    );
    expect(new Uint8Array(keyBuffer).every((b) => b === 0)).toBe(true);
  });

  it("asks for the database first", async () => {
    const root = await show(deps().deps);
    await choose(root, "KeePass / KeePassXC (KDBX)");
    await click(button(root, "Datenbank öffnen"));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe("Wähle zuerst die Datenbank.");
  });
});

describe("ImportPage with Kennwort's own export (K-504)", () => {
  /** Until the step shows what it waits for: Argon2id with 64 MiB takes a while */
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 400 && !done(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      flush();
    }
  };
  const open = async (root: ParentNode, passphrase: string) => {
    const input = root.querySelector<HTMLInputElement>('input[name="database"]');
    Object.defineProperty(input, "files", {
      value: [new File([exportFile], "kennwort-export.json")],
      configurable: true,
    });
    const field = root.querySelector<HTMLInputElement>('input[type="password"]');
    if (!field) throw new Error("no passphrase field");
    field.value = passphrase;
    await click(button(root, "Export öffnen"));
    await until(
      () => root.querySelector('[role="status"]')?.textContent !== "Export wird entschlüsselt …",
    );
    return field;
  };

  it("asks for the export's passphrase only, no key file, then previews every entry", async () => {
    const root = await show(deps().deps);
    await choose(root, "Kennwort (JSON)");
    expect(root.textContent).toContain("Passphrase des Exports");
    expect(root.textContent).toContain("„Einstellungen“ → „Exportieren“");
    expect(root.querySelector('input[name="key-file"]')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('input[name="database"]')?.accept).toBe(
      ".json,application/json",
    );
    const field = await open(root, "Weber-Haustechnik-2026");
    await until(() => root.querySelector("h2")?.textContent === "Vorschau");
    expect(field.value).toBe("");
    expect(root.querySelector("h2")?.textContent).toBe("Vorschau");
    expect(rows(root).some((r) => r.includes("Online-Banking Sparkasse"))).toBe(true);
    expect(root.textContent).toContain("4 Einträge in der Datei");
    expect(root.textContent).not.toContain("Sp@rkasse");
  }, 30_000);

  it("says when the passphrase does not fit, in its own words", async () => {
    const root = await show(deps().deps);
    await choose(root, "Kennwort (JSON)");
    await open(root, "falsch");
    await until(() => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Passphrase passt nicht zu diesem Export.",
    );
  }, 30_000);
});
