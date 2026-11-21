import { describe, expect, it } from "vitest";
import { parseOnePasswordCsv } from "./onepassword-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("1Password CSV (K-502)", () => {
  it("reads 1Password 8's export with BOM, tags, favorites and one-time codes", () => {
    expect(compact(parseOnePasswordCsv(fixture("onepassword.csv")))).toEqual([
      {
        type: "login",
        title: "Lieferantenportal Buderus",
        fields: [
          ["username", "Username", "jonas@weber-haustechnik.example", "text"],
          ["password", "Password", "Bud3rus#2026", "secret"],
          ["website", "Website", "https://portal.heiztechnik.example", "url"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Portal:jonas?secret=GEZDGNBVGY3TQOJQ&issuer=Portal",
            "totp",
          ],
          ["note", "Notes", "Rahmenvertrag bis 12/2027", "note"],
        ],
        tags: ["Einkauf", "Lieferanten"],
        favorite: true,
      },
      {
        type: "login",
        title: "Kassensystem",
        fields: [
          ["username", "Username", "anna", "text"],
          ["password", "Password", "K@sse-Anna", "secret"],
          ["website", "Website", "https://kasse.weber-haustechnik.example", "url"],
        ],
      },
    ]);
  });
  it("reads a favorite written in capitals", () => {
    const csv = "Title,Url,Username,Password,OTPAuth,Favorite\nKasse,,anna,x,,TRUE";
    expect(compact(parseOnePasswordCsv(csv))).toEqual([
      {
        type: "login",
        title: "Kasse",
        fields: [
          ["username", "Username", "anna", "text"],
          ["password", "Password", "x", "secret"],
        ],
        favorite: true,
      },
    ]);
  });

  it("needs the one-time code column", () => {
    expect(parseOnePasswordCsv("Title,Url,Username,Password\na,b,c,d")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
