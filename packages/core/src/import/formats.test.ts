import { describe, expect, it } from "vitest";
import { IMPORT_FORMATS } from "./formats.ts";
import { fixture } from "./test/helpers.ts";

/** One fixture per format, the vendor's real export structure */
const FIXTURES: Record<string, string> = {
  "kennwort-json": "kennwort-export.json",
  "bitwarden-json": "bitwarden-protected-pbkdf2.json",
  "bitwarden-csv": "bitwarden.csv",
  "lastpass-csv": "lastpass.csv",
  "1password-1pux": "onepassword.1pux",
  "1password-csv": "onepassword.csv",
  "keepass-kdbx": "kdbx-argon2d-aes.kdbx",
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

describe("import formats (K-502, K-503, K-504)", () => {
  it("lists every format of the plan by vendor and file", () => {
    expect(IMPORT_FORMATS.map((f) => [f.id, f.vendor, f.file])).toEqual([
      ["kennwort-json", "Kennwort", "JSON"],
      ["bitwarden-json", "Bitwarden", "JSON"],
      ["bitwarden-csv", "Bitwarden", "CSV"],
      ["lastpass-csv", "LastPass", "CSV"],
      ["1password-1pux", "1Password", "1PUX"],
      ["1password-csv", "1Password", "CSV"],
      ["keepass-kdbx", "KeePass / KeePassXC", "KDBX"],
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

  it("reads each vendor's fixture with its own parser, an encrypted one with its password", async () => {
    for (const format of IMPORT_FORMATS) {
      const bytes = fixture(FIXTURES[format.id] ?? "");
      const result = format.unlock
        ? await format.unlock(bytes, { password: "Weber-Haustechnik-2026" })
        : await format.parse(bytes);
      expect([format.id, result.ok && result.value.length > 0]).toEqual([format.id, true]);
    }
  });

  it("asks for the password for Kennwort's own export, KeePass's database and Bitwarden's protected JSON", async () => {
    const locked = IMPORT_FORMATS.filter((format) => format.unlock);
    expect(locked.map((format) => [format.id, format.sometimesEncrypted ?? false])).toEqual([
      ["kennwort-json", false],
      ["bitwarden-json", true],
      ["keepass-kdbx", false],
    ]);
    const encrypted = { ok: false, error: "encrypted" };
    expect(await locked[0]?.parse(fixture("kennwort-export.json"))).toEqual(encrypted);
    expect(await locked[1]?.parse(fixture("bitwarden-protected-pbkdf2.json"))).toEqual(encrypted);
    expect(await locked[2]?.parse(fixture("kdbx-argon2d-aes.kdbx"))).toEqual(encrypted);
  });

  it("reads a plain Bitwarden export without asking for a password", async () => {
    const bitwarden = IMPORT_FORMATS.find((format) => format.id === "bitwarden-json");
    const result = await bitwarden?.parse(fixture("bitwarden.json"));
    expect(result?.ok && result.value.length).toBe(5);
  });
});
