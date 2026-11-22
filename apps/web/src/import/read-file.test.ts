import { readFile } from "node:fs/promises";
import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import bitwardenJson from "../../../../packages/core/src/import/fixtures/bitwarden.json?raw";
import chromeCsv from "../../../../packages/core/src/import/fixtures/chrome.csv?raw";
import { errorText, guessColumns, parseChoice } from "./read-file.ts";
import { TABLE, vendorChoices } from "./vendors.ts";

// K-501: the file is parsed on the device by the chosen vendor's parser; any table needs its
// columns mapped first, and every error of core reads as a friendly text
const FIXTURES: Record<string, string> = {
  "bitwarden.json": bitwardenJson,
  "chrome.csv": chromeCsv,
};
const PROTON_ZIP = "../../../../packages/core/src/import/fixtures/protonpass.zip";
const fixture = (name: string) => new TextEncoder().encode(FIXTURES[name]);
const choice = (id: string) => {
  const found = vendorChoices().find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

beforeEach(() => setLocale("de", { reload: false }));

describe("parsing the chosen file", () => {
  it("reads a Bitwarden JSON with its vendor's parser", async () => {
    const parsed = await parseChoice(choice("bitwarden-json"), fixture("bitwarden.json"));
    expect(parsed.ok && parsed.value.length).toBeGreaterThan(3);
  });

  it("refuses a file of another vendor", async () => {
    expect(await parseChoice(choice("bitwarden-json"), fixture("chrome.csv"))).toEqual({
      ok: false,
      error: "bad-json",
    });
    expect(await parseChoice(choice("lastpass-csv"), fixture("chrome.csv"))).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });

  it("reads any table with the columns mapped", async () => {
    const parsed = await parseChoice(choice(TABLE), fixture("chrome.csv"), {
      title: "name",
      username: "username",
      password: "password",
    });
    expect(parsed.ok && parsed.value[0]?.content.title).toBe("portal.sanitaer-grosshandel.example");
  });

  it("refuses a table without a mapping", async () => {
    expect(await parseChoice(choice(TABLE), fixture("chrome.csv"))).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});

describe("parsing a ZIP container", () => {
  it("unpacks the archive asynchronously with its vendor's parser", async () => {
    const zip = new Uint8Array(await readFile(new URL(PROTON_ZIP, import.meta.url)));
    const parsed = await parseChoice(choice("protonpass-zip"), zip);
    expect(parsed.ok && parsed.value.length).toBeGreaterThan(3);
    expect(await parseChoice(choice("dashlane-zip"), fixture("chrome.csv"))).toEqual({
      ok: false,
      error: "bad-zip",
    });
  });
});

describe("the columns of any table", () => {
  it("are guessed from their names, in German and English, once each", () => {
    expect(guessColumns(["name", "url", "username", "password", "note"])).toEqual({
      title: "name",
      url: "url",
      username: "username",
      password: "password",
      notes: "note",
    });
    expect(
      guessColumns([
        "Titel",
        "Benutzername",
        "Passwort",
        "Website",
        "Notizen",
        "Ordner",
        "Kennung",
      ]),
    ).toEqual({
      title: "Titel",
      username: "Benutzername",
      password: "Passwort",
      url: "Website",
      notes: "Notizen",
      folder: "Ordner",
    });
    expect(guessColumns(["E-Mail", "Login"])).toEqual({ username: "E-Mail" });
  });
});

describe("error texts", () => {
  it("say what went wrong for every error of the parsers", () => {
    const errors = [
      "not-text",
      "bad-csv",
      "bad-json",
      "bad-xml",
      "wrong-format",
      "encrypted",
      "bad-zip",
      "unsupported-zip",
      "too-large",
    ] as const;
    const texts = errors.map(errorText);
    expect(new Set(texts).size).toBe(errors.length);
    expect(errorText("encrypted")).toBe(
      "Diese Datei ist verschlüsselt – exportiere unverschlüsselt.",
    );
  });
});
