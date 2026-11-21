import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS } from "./formats.ts";
import { fixture } from "./test/helpers.ts";

/** One fixture per format, the vendor's real export structure */
const FIXTURES: Record<string, string> = {
  "bitwarden-json": "bitwarden.json",
  "bitwarden-csv": "bitwarden.csv",
  "lastpass-csv": "lastpass.csv",
  "1password-csv": "onepassword.csv",
  "keepass-xml": "keepass.xml",
  "keepassxc-csv": "keepassxc.csv",
  "keepass-csv": "keepass.csv",
  "passbolt-csv": "passbolt.csv",
  "dashlane-csv": "dashlane-credentials.csv",
  "protonpass-json": "protonpass.json",
  "keeper-csv": "keeper.csv",
  "nordpass-csv": "nordpass.csv",
  "enpass-json": "enpass.json",
  "chrome-csv": "chrome.csv",
  "firefox-csv": "firefox.csv",
  "safari-csv": "safari.csv",
};

describe("import formats (K-502)", () => {
  it("lists every format of the plan by vendor and file", () => {
    expect(IMPORT_FORMATS.map((f) => [f.id, f.vendor, f.file])).toEqual([
      ["bitwarden-json", "Bitwarden", "JSON"],
      ["bitwarden-csv", "Bitwarden", "CSV"],
      ["lastpass-csv", "LastPass", "CSV"],
      ["1password-csv", "1Password", "CSV"],
      ["keepass-xml", "KeePass", "XML"],
      ["keepassxc-csv", "KeePassXC", "CSV"],
      ["keepass-csv", "KeePass", "CSV"],
      ["passbolt-csv", "Passbolt", "CSV"],
      ["dashlane-csv", "Dashlane", "CSV"],
      ["protonpass-json", "Proton Pass", "JSON"],
      ["keeper-csv", "Keeper", "CSV"],
      ["nordpass-csv", "NordPass", "CSV"],
      ["enpass-json", "Enpass", "JSON"],
      ["chrome-csv", "Chrome / Edge", "CSV"],
      ["firefox-csv", "Firefox", "CSV"],
      ["safari-csv", "Safari", "CSV"],
    ]);
  });

  it("reads each vendor's fixture with its own parser", () => {
    for (const format of IMPORT_FORMATS) {
      const result = format.parse(fixture(FIXTURES[format.id] ?? ""));
      expect([format.id, result.ok && result.value.length > 0]).toEqual([format.id, true]);
    }
  });
});
