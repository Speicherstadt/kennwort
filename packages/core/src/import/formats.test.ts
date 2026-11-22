import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS } from "./formats.ts";
import { fixture } from "./test/helpers.ts";

/** One fixture per format, the vendor's real export structure */
const FIXTURES: Record<string, string> = {
  "bitwarden-json": "bitwarden.json",
  "bitwarden-csv": "bitwarden.csv",
  "lastpass-csv": "lastpass.csv",
  "1password-1pux": "onepassword.1pux",
  "1password-csv": "onepassword.csv",
  "keepass-xml": "keepass.xml",
  "keepassxc-csv": "keepassxc.csv",
  "keepass-csv": "keepass.csv",
  "passbolt-csv": "passbolt.csv",
  "dashlane-zip": "dashlane.zip",
  "dashlane-csv": "dashlane-credentials.csv",
  "protonpass-zip": "protonpass.zip",
  "protonpass-json": "protonpass.json",
  "keeper-csv": "keeper.csv",
  "nordpass-csv": "nordpass.csv",
  "enpass-json": "enpass.json",
  "chrome-csv": "chrome.csv",
  "firefox-csv": "firefox.csv",
  "safari-csv": "safari.csv",
  "google-authenticator": "google-authenticator.txt",
  "aegis-json": "aegis.json",
  "2fas-json": "twofas.2fas",
};

describe("import formats (K-502, K-503)", () => {
  it("lists every format of the plan by vendor and file", () => {
    expect(IMPORT_FORMATS.map((f) => [f.id, f.vendor, f.file])).toEqual([
      ["bitwarden-json", "Bitwarden", "JSON"],
      ["bitwarden-csv", "Bitwarden", "CSV"],
      ["lastpass-csv", "LastPass", "CSV"],
      ["1password-1pux", "1Password", "1PUX"],
      ["1password-csv", "1Password", "CSV"],
      ["keepass-xml", "KeePass", "XML"],
      ["keepassxc-csv", "KeePassXC", "CSV"],
      ["keepass-csv", "KeePass", "CSV"],
      ["passbolt-csv", "Passbolt", "CSV"],
      ["dashlane-zip", "Dashlane", "ZIP"],
      ["dashlane-csv", "Dashlane", "CSV"],
      ["protonpass-zip", "Proton Pass", "ZIP"],
      ["protonpass-json", "Proton Pass", "JSON"],
      ["keeper-csv", "Keeper", "CSV"],
      ["nordpass-csv", "NordPass", "CSV"],
      ["enpass-json", "Enpass", "JSON"],
      ["chrome-csv", "Chrome / Edge", "CSV"],
      ["firefox-csv", "Firefox", "CSV"],
      ["safari-csv", "Safari", "CSV"],
      ["google-authenticator", "Google Authenticator", "QR"],
      ["aegis-json", "Aegis", "JSON"],
      ["2fas-json", "2FAS", "2FAS"],
    ]);
  });

  it("reads each vendor's fixture with its own parser", async () => {
    for (const format of IMPORT_FORMATS) {
      const result = await format.parse(fixture(FIXTURES[format.id] ?? ""));
      expect([format.id, result.ok && result.value.length > 0]).toEqual([format.id, true]);
    }
  });
});
