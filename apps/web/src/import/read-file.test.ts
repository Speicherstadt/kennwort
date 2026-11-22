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
      "incomplete",
      "account-encrypted",
      "wrong-password",
      "damaged",
    ] as const;
    const texts = errors.map((error) => errorText(error));
    expect(new Set(texts).size).toBe(errors.length);
    expect(errorText("encrypted")).toBe(
      "Diese Datei ist verschlüsselt – exportiere unverschlüsselt.",
    );
    expect(errorText("incomplete")).toBe(
      "Es fehlen QR-Codes dieses Exports. Scanne jeden QR-Code, den Google Authenticator zeigt.",
    );
  });

  // K-504: Kennwort's own export has a passphrase, not a key file, and versions of its own
  it("speak of the passphrase and a newer Kennwort for Kennwort's own export", () => {
    expect(errorText("wrong-key", "kennwort-json")).toBe(
      "Die Passphrase passt nicht zu diesem Export.",
    );
    expect(errorText("unsupported", "kennwort-json")).toContain("neueren Version von Kennwort");
    expect(errorText("wrong-key", "keepass-kdbx")).toBe(errorText("wrong-key"));
    expect(errorText("bad-json", "kennwort-json")).toBe(errorText("bad-json"));
  });

  // K-502 Teil 4: Bitwarden's encrypted JSON has its own refusal, KDFs and limits
  it("speak of Bitwarden's export types, KDFs and limits for Bitwarden's JSON", () => {
    expect(errorText("account-encrypted", "bitwarden-json")).toContain("kontobeschränkt");
    expect(errorText("wrong-password", "bitwarden-json")).toBe(errorText("wrong-password"));
    expect(errorText("damaged")).toContain("beschädigt oder wurde verändert");
    expect(errorText("unsupported", "bitwarden-json")).toContain("Bitwarden");
    expect(errorText("too-costly", "bitwarden-json")).toContain("2 Millionen Iterationen");
    expect(errorText("too-costly", "keepass-kdbx")).toBe(errorText("too-costly"));
  });

  // K-502 Teil 5: a CXF file of a later major version
  it("speak of the format's version for a CXF file", () => {
    expect(errorText("unsupported", "cxf-json")).toContain("Credential Exchange Format");
    expect(errorText("wrong-format", "cxf-json")).toBe(errorText("wrong-format"));
  });
});
