import { describe, expect, it } from "vitest";
import { parseChromeCsv } from "./chrome-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Chrome and Edge CSV (K-502)", () => {
  it("reads a real export: CRLF, a quoted note over two lines, an Android app, an empty row", () => {
    expect(compact(parseChromeCsv(fixture("chrome.csv")))).toEqual([
      {
        type: "login",
        title: "portal.sanitaer-grosshandel.example",
        fields: [
          ["username", "Username", "jonas@weber-haustechnik.example", "text"],
          ["password", "Password", "Gr0ssh@ndel-2026", "secret"],
          ["website", "Website", "https://portal.sanitaer-grosshandel.example/login", "url"],
          [
            "note",
            "Notes",
            'Kundennummer 40711, Lieferadresse Lager\nAnsprechpartner: Herr "Kalle" Schröder',
            "note",
          ],
        ],
      },
      {
        type: "login",
        title: "datev.example",
        fields: [
          ["username", "Username", "anna@weber-haustechnik.example", "text"],
          ["password", "Password", "Steuer,Büro;2026!", "secret"],
          ["website", "Website", "https://www.datev.example/", "url"],
        ],
      },
      {
        type: "login",
        title: "com.heizungsapp.monteur",
        fields: [
          ["username", "Username", "max@weber-haustechnik.example", "text"],
          ["password", "Password", "M0nteur💧App", "secret"],
          ["website", "Website", "android://Zm9vYmFy@com.heizungsapp.monteur/", "url"],
        ],
      },
    ]);
  });
  it("reads the older export without notes", () => {
    const old = "name,url,username,password\nkasse.example,https://kasse.example,anna,K@sse";
    expect(compact(parseChromeCsv(old))).toEqual([
      {
        type: "login",
        title: "kasse.example",
        fields: [
          ["username", "Username", "anna", "text"],
          ["password", "Password", "K@sse", "secret"],
          ["website", "Website", "https://kasse.example", "url"],
        ],
      },
    ]);
  });

  it("refuses a CSV with other columns", () => {
    expect(parseChromeCsv("name,url,username\na,b,c")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
