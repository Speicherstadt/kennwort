import { describe, expect, it } from "vitest";
import { parsePassboltCsv } from "./passbolt-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Passbolt CSV (K-502)", () => {
  it("reads the KeePass layout of Passbolt's export with groups and one-time codes", () => {
    expect(compact(parsePassboltCsv(fixture("passbolt.csv")))).toEqual([
      {
        type: "login",
        title: "Heizungs-Fernwartung",
        fields: [
          ["username", "Username", "service@weber-haustechnik.example", "text"],
          ["password", "Password", "F3rnW@rtung", "secret"],
          ["website", "Website", "https://fernwartung.heizung.example", "url"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Fernwartung:service?secret=KRSXG5CTMVRXEZLU&issuer=Fernwartung",
            "totp",
          ],
          ["note", "Notes", "Zugang für alle Monteure", "note"],
        ],
        folders: ["Technik/Fernwartung"],
      },
      {
        type: "login",
        title: "Telefonanlage",
        fields: [
          ["username", "Username", "admin", "text"],
          ["password", "Password", "T3lef0n!", "secret"],
          ["website", "Website", "https://192.168.10.2", "url"],
        ],
      },
    ]);
  });
  it("needs the group column", () => {
    expect(parsePassboltCsv("Title,Username,URL,Password\na,b,c,d")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
