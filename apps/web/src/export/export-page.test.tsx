import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { ExportFile } from "./export.ts";
import { ExportPage, type ExportPageDeps } from "./export-page.tsx";

// K-504: the page „Exportieren“ from the choice to the reminder to keep the file safe
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    flush();
  }
};

const entry: EntryContent = {
  type: "login",
  title: "DATEV",
  fields: [{ id: "password", name: "Passwort", value: "Steuer-Kessel-2026!", kind: "secret" }],
  tags: [],
  favorite: false,
  history: [],
};

const deps = (over: Partial<ExportPageDeps> = {}) => {
  const audited: string[] = [];
  const saved: ExportFile[] = [];
  const all: ExportPageDeps = {
    allowed: () => true,
    vaults: () => [
      { idText: "buero", name: "Büro", entries: [entry] },
      { idText: "technik", name: "Technik", entries: [entry, entry] },
    ],
    audit: async (subject) => {
      audited.push(subject);
      return true;
    },
    save: (file) => saved.push({ ...file, bytes: file.bytes.slice() }),
    now: () => Date.UTC(2026, 10, 22, 12),
    newId: () => "BwcHBwcHBwcHBwcHBwcHBw",
    ...over,
  };
  return { deps: all, audited, saved };
};

const show = (d: ExportPageDeps) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <ExportPage deps={d} />, root);
  flush();
  return root;
};

const input = (root: ParentNode, selector: string) => {
  const found = root.querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`no ${selector}`);
  return found;
};
const choose = (root: ParentNode, value: string) => {
  input(root, `input[type="radio"][value="${value}"]`).click();
  flush();
};
const submit = async (root: ParentNode) => {
  root.querySelector("form")?.requestSubmit();
  flush();
  await until(() => !root.textContent?.includes("Export wird ins Audit-Log eingetragen"));
};
const alertText = (root: ParentNode) => root.querySelector('[role="alert"]')?.textContent;

describe("ExportPage", () => {
  it("tells anyone but owners and admins that they may not export, and shows no form", () => {
    const root = show(deps({ allowed: () => false }).deps);
    expect(root.querySelector("h1")?.textContent).toBe("Exportieren");
    expect(root.textContent).toContain("Exportieren dürfen nur Inhaber und Admins der Firma.");
    expect(root.querySelector("form")).toBeNull();
  });

  it("offers all vaults or one, and three formats with encrypted JSON first", () => {
    const root = show(deps().deps);
    const options = [...root.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Alle Tresore", "Büro", "Technik"]);
    const formats = [...root.querySelectorAll('input[type="radio"]')].map(
      (r) => (r as HTMLInputElement).value,
    );
    expect(formats).toEqual(["kennwort-json", "kdbx", "csv"]);
    expect(input(root, 'input[value="kennwort-json"]').checked).toBe(true);
    expect(root.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expect(root.textContent).toContain("ins Audit-Log");
  });
});

describe("ExportPage sending the form", () => {
  it("asks for a passphrase of 12 characters, twice the same, and forgets the fields", async () => {
    const { deps: d, audited } = deps();
    const root = show(d);
    input(root, 'input[name="passphrase"]').value = "zu kurz";
    input(root, 'input[name="passphrase-repeat"]').value = "zu kurz";
    await submit(root);
    expect(alertText(root)).toBe("Die Passphrase braucht mindestens 12 Zeichen.");
    input(root, 'input[name="passphrase"]').value = "Pumpe Kessel Rohr";
    input(root, 'input[name="passphrase-repeat"]').value = "Pumpe Kessel Rohx";
    await submit(root);
    expect(alertText(root)).toBe("Die beiden Passphrasen stimmen nicht überein.");
    expect(input(root, 'input[name="passphrase"]').value).toBe("");
    expect(audited).toEqual([]);
  });

  it("warns that CSV is plain text and wants it confirmed before anything is logged", async () => {
    const { deps: d, audited, saved } = deps();
    const root = show(d);
    choose(root, "csv");
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(root.querySelector('[role="note"]')?.textContent).toContain(
      "Die CSV-Datei ist nicht verschlüsselt",
    );
    await submit(root);
    expect(alertText(root)).toBe("Bestätige zuerst, dass du eine unverschlüsselte Datei willst.");
    expect(audited).toEqual([]);
    input(root, 'input[name="plain-text"]').click();
    const select = root.querySelector("select") as HTMLSelectElement;
    select.value = "technik";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flush();
    await submit(root);
    expect(audited).toEqual(["csv/vault:technik/BwcHBwcHBwcHBwcHBwcHBw"]);
    expect(saved.map((f) => f.name)).toEqual(["kennwort-export-2026-11-22.csv"]);
    expect(root.textContent).toContain("2 Einträge stehen in kennwort-export-2026-11-22.csv.");
    expect(root.querySelector('[role="note"]')?.textContent).toContain("Lösche die CSV-Datei");
  });

  it("writes the encrypted JSON after the audit log took it, and says to keep it safe", async () => {
    const { deps: d, audited, saved } = deps();
    const root = show(d);
    input(root, 'input[name="passphrase"]').value = "Pumpe Kessel Rohr";
    input(root, 'input[name="passphrase-repeat"]').value = "Pumpe Kessel Rohr";
    root.querySelector("form")?.requestSubmit();
    flush();
    expect(root.textContent).toContain("Export wird ins Audit-Log eingetragen");
    await until(() => saved.length > 0 && root.textContent?.includes("Export fertig") === true);
    expect(audited).toEqual(["kennwort-json/all/BwcHBwcHBwcHBwcHBwcHBw"]);
    expect(new TextDecoder().decode(saved[0]?.bytes)).toContain('"kennwort":"export"');
    expect(root.textContent).toContain("3 Einträge stehen in kennwort-export-2026-11-22.json.");
    expect(root.textContent).toContain("Bewahre die Datei und ihre Passphrase getrennt");
    (root.querySelector("button") as HTMLButtonElement).click();
    flush();
    expect(root.querySelector("form")).not.toBeNull();
  }, 30_000);

  it("writes nothing and keeps the choice when the server does not log the export", async () => {
    const { deps: d, saved } = deps({ audit: async () => false });
    const root = show(d);
    choose(root, "csv");
    input(root, 'input[name="plain-text"]').click();
    await submit(root);
    expect(alertText(root)).toContain("Der Server hat den Export nicht ins Audit-Log eingetragen");
    expect(saved).toEqual([]);
    expect(input(root, 'input[value="csv"]').checked).toBe(true);
  });

  it("says when the scope holds no vault this device opens", async () => {
    const root = show(deps({ vaults: () => [] }).deps);
    choose(root, "csv");
    input(root, 'input[name="plain-text"]').click();
    await submit(root);
    expect(alertText(root)).toBe(
      "In diesem Umfang gibt es keinen Tresor, den dieses Gerät öffnen kann.",
    );
  });
});
