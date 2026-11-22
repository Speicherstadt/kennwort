import type { ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import type { EntryContent, ImportedEntry } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewStep } from "./import-preview.tsx";
import type { Comparable } from "./preview.ts";

// K-503 Teil 2: the preview offers each code from an authenticator app to the matching login of
// the vault; the person may give it a login of its own instead, a login with another code is a
// conflict and never offered, and a login with this code makes it a duplicate
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const DATEV = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";
const OTHER = "otpauth://totp/DATEV:jonas?secret=KRUGKIDROVUWG2ZAMJZG653OEBTG66BA&issuer=DATEV";
const field = (id: string, value: string, kind: EntryContent["fields"][number]["kind"]) => ({
  id,
  name: id,
  value,
  kind,
});
const code = (title: string, account: string): ImportedEntry => ({
  content: {
    type: "login",
    title,
    fields: [field("username", account, "text"), field("totp", DATEV, "totp")],
    tags: [],
    favorite: false,
    history: [],
  },
  folders: [],
});
const inVault = (id: string, title: string, username: string, totp = ""): Comparable => ({
  id,
  type: "login",
  title,
  username,
  website: "",
  fields: [field("username", username, "text"), field("totp", totp, "totp")],
});

const show = (entries: ImportedEntry[], existing: Comparable[]) => {
  setLocale("de", { reload: false });
  const imported: ImportWrite[][] = [];
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => (
      <PreviewStep
        entries={entries}
        unsupported={0}
        passkeysLeftOut={0}
        vaults={[{ idText: "buero", name: "Büro" }]}
        existing={() => existing}
        canWrite={true}
        onImport={(_, writes) => imported.push(writes)}
        onBack={() => {}}
      />
    ),
    root,
  );
  flush();
  const radio = (label: string) => {
    const found = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (input) => input.parentElement?.textContent?.trim() === label,
    );
    if (!found) throw new Error(`no choice ${label}`);
    return found;
  };
  const start = () => {
    const button = [...root.querySelectorAll("button")].find((b) =>
      b.textContent?.endsWith("importieren"),
    );
    button?.click();
    flush();
    return imported.at(-1);
  };
  return { root, radio, start };
};

describe("the preview of codes", () => {
  it("puts a code into the one matching login, or into a login of its own", () => {
    const { root, radio, start } = show([code("DATEV", "jonas")], [inVault("d", "DATEV", "jonas")]);
    expect(root.querySelector("legend")?.textContent).toBe("Wohin kommt der Einmalcode von DATEV?");
    expect(radio("Zu »DATEV« (jonas) hinzufügen").checked).toBe(true);
    expect(radio("Eigenen Login anlegen").checked).toBe(false);
    expect(root.textContent).toContain("1 Code kommt in einen vorhandenen Login.");
    expect(root.textContent).not.toContain("JBSWY3DP");
    expect(start()).toEqual([{ kind: "code", entryIdText: "d", totp: DATEV }]);

    radio("Eigenen Login anlegen").click();
    flush();
    expect(root.textContent).not.toContain("vorhandenen Login");
    expect(start()).toEqual([{ kind: "new", content: code("DATEV", "jonas").content }]);
  });

  it("picks none of several logins by itself, and takes the one chosen", () => {
    const vault = [inVault("a", "DATEV", "jonas"), inVault("b", "datev", "jonas")];
    const { radio, start } = show([code("DATEV", "jonas")], vault);
    expect(radio("Zu »DATEV« (jonas) hinzufügen").checked).toBe(false);
    expect(radio("Zu »datev« (jonas) hinzufügen").checked).toBe(false);
    expect(radio("Eigenen Login anlegen").checked).toBe(true);
    expect(start()?.[0]?.kind).toBe("new");
    radio("Zu »datev« (jonas) hinzufügen").click();
    flush();
    expect(start()).toEqual([{ kind: "code", entryIdText: "b", totp: DATEV }]);
  });

  it("shows a login with another code as a conflict and gives the code a login of its own", () => {
    const { root, start } = show([code("DATEV", "jonas")], [inVault("d", "DATEV", "jonas", OTHER)]);
    expect(root.textContent).toContain("anderer Code");
    expect(root.textContent).toContain(
      "»DATEV« (jonas) hat schon einen anderen Einmalcode. Kennwort überschreibt ihn nicht; der Code bekommt einen eigenen Login.",
    );
    expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(start()).toEqual([{ kind: "new", content: code("DATEV", "jonas").content }]);
  });

  it("skips a code a login has already, as a duplicate", () => {
    const { root } = show([code("DATEV", "jonas")], [inVault("d", "DATEV", "jonas", DATEV)]);
    expect(root.textContent).toContain("doppelt");
    expect(root.textContent).toContain("»DATEV« (jonas) hat diesen Einmalcode schon.");
    expect(root.textContent).toContain("1 Eintrag gibt es schon und wird übersprungen.");
    expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });
});
