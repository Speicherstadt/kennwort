import { describe, expect, it } from "vitest";
import { parseSafariCsv } from "./safari-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Safari and Apple Passwords CSV (K-502)", () => {
  it("reads a real export with notes over two lines and one-time codes", () => {
    expect(compact(parseSafariCsv(fixture("safari.csv")))).toEqual([
      {
        type: "login",
        title: "elster.example (jonas.weber)",
        fields: [
          ["username", "Username", "jonas.weber", "text"],
          ["password", "Password", "Elst3r-Weber!", "secret"],
          ["website", "Website", "https://www.elster.example/", "url"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/ELSTER:jonas.weber?secret=JBSWY3DPEHPK3PXP&issuer=ELSTER",
            "totp",
          ],
          ["note", "Notes", "Zertifikatsdatei liegt im Tresor\nAblauf 2027", "note"],
        ],
      },
      {
        type: "login",
        title: "fahrzeugtracker.example (max)",
        fields: [
          ["username", "Username", "max", "text"],
          ["password", "Password", "Tr@cker-Max", "secret"],
          ["website", "Website", "https://fahrzeugtracker.example", "url"],
        ],
      },
    ]);
  });
  it("reads older Safari, which wrote Url and four columns", () => {
    const old =
      "Title,Url,Username,Password\nlohn.example (sandra),https://lohn.example,sandra,L0hn";
    expect(compact(parseSafariCsv(old))).toEqual([
      {
        type: "login",
        title: "lohn.example (sandra)",
        fields: [
          ["username", "Username", "sandra", "text"],
          ["password", "Password", "L0hn", "secret"],
          ["website", "Website", "https://lohn.example", "url"],
        ],
      },
    ]);
  });

  it("refuses a CSV with other columns", () => {
    expect(parseSafariCsv("Title,URL,Username\na,b,c")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
