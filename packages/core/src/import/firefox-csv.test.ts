import { describe, expect, it } from "vitest";
import { parseFirefoxCsv } from "./firefox-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Firefox CSV (K-502)", () => {
  it("reads a real export, titles from the host, without Firefox's own account row", () => {
    expect(compact(parseFirefoxCsv(fixture("firefox.csv")))).toEqual([
      {
        type: "login",
        title: "webmail.weber-haustechnik.example",
        fields: [
          ["username", "Username", "sandra@weber-haustechnik.example", "text"],
          ["password", "Password", "Ma1l-Sandra#Büro", "secret"],
          ["website", "Website", "https://webmail.weber-haustechnik.example", "url"],
        ],
      },
      {
        type: "login",
        title: "router.weber-haustechnik.example",
        fields: [
          ["username", "Username", "admin", "text"],
          ["password", "Password", 'R0uter "Büro" 2026', "secret"],
          ["website", "Website", "https://router.weber-haustechnik.example:8443", "url"],
        ],
      },
    ]);
  });
  it("needs Firefox's guid column", () => {
    expect(parseFirefoxCsv("url,username,password\nhttps://a.example,a,b")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
