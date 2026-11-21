import { describe, expect, it } from "vitest";
import { parseKeePassCsv, parseKeePassXcCsv } from "./keepass-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("KeePass and KeePassXC CSV (K-502)", () => {
  it("reads KeePassXC's export: path below the root as folder, the recycle bin left out", () => {
    expect(compact(parseKeePassXcCsv(fixture("keepassxc.csv")))).toEqual([
      {
        type: "login",
        title: "Lohnbuchhaltung",
        fields: [
          ["username", "Username", "sandra", "text"],
          ["password", "Password", "L0hn-Sandra!", "secret"],
          ["website", "Website", "https://lohn.example", "url"],
        ],
      },
      {
        type: "login",
        title: "Schlüsseltresor Baustelle",
        fields: [
          ["password", "Password", "4711", "secret"],
          ["note", "Notes", "Code für den Schlüsselkasten am Eingang\nGültig bis Bauende", "note"],
        ],
        folders: ["Baustellen/Musterstraße 5"],
      },
    ]);
  });
  it("reads KeePass 2's export with BOM and CRLF", () => {
    expect(compact(parseKeePassCsv(fixture("keepass.csv")))).toEqual([
      {
        type: "login",
        title: "Großhandel Online",
        fields: [
          ["username", "Username", "weber-ht", "text"],
          ["password", "Password", "Gr0ss-2026", "secret"],
          ["website", "Website", "https://shop.grosshandel.example", "url"],
          ["note", "Notes", "Kundennr. 12345", "note"],
        ],
      },
      {
        type: "login",
        title: "Zeiterfassung",
        fields: [
          ["username", "Username", "anna", "text"],
          ["password", "Password", "Z€it-Anna", "secret"],
          ["website", "Website", "https://zeit.example", "url"],
        ],
      },
    ]);
  });
  it("leaves out the German recycle bin and keeps entries of the root group without a folder", () => {
    const csv = [
      '"Group","Title","Username","Password","URL","Notes"',
      '"Root","Oben","a","b","",""',
      '"Root/Papierkorb","Weg","c","d","",""',
      '"Root/Papierkorb-Archiv","Bleibt","e","f","",""',
    ].join("\n");
    expect(compact(parseKeePassXcCsv(csv))).toEqual([
      {
        type: "login",
        title: "Oben",
        fields: [
          ["username", "Username", "a", "text"],
          ["password", "Password", "b", "secret"],
        ],
      },
      {
        type: "login",
        title: "Bleibt",
        fields: [
          ["username", "Username", "e", "text"],
          ["password", "Password", "f", "secret"],
        ],
        folders: ["Papierkorb-Archiv"],
      },
    ]);
  });

  it("reads KeePassXC's one-time code", () => {
    const csv =
      '"Group","Title","Username","Password","URL","Notes","TOTP"\n"Root","T","","","","","otpauth://totp/T?secret=JBSWY3DPEHPK3PXP"';
    expect(compact(parseKeePassXcCsv(csv))).toEqual([
      {
        type: "login",
        title: "T",
        fields: [["totp", "One-time code", "otpauth://totp/T?secret=JBSWY3DPEHPK3PXP", "totp"]],
      },
    ]);
  });

  it("tells KeePassXC's and KeePass 2's layouts apart", () => {
    const wrong = { ok: false, error: "wrong-format" };
    expect(parseKeePassXcCsv(fixture("keepass.csv"))).toEqual(wrong);
    expect(parseKeePassCsv(fixture("keepassxc.csv"))).toEqual(wrong);
  });
});
