import { describe, expect, it } from "vitest";
import { parseAegisJson } from "./aegis-json.ts";
import { compact, fixture } from "./test/helpers.ts";

const vault = (entries: unknown[], groups: unknown[] = []) =>
  JSON.stringify({
    version: 1,
    header: { slots: null, params: null },
    db: { version: 3, entries, groups },
  });
const totp = (info: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: "totp",
  name: "jonas",
  issuer: "DATEV",
  info: { secret: "JBSWY3DPEHPK3PXP", ...info },
  ...extra,
});

describe("Aegis JSON (K-503)", () => {
  it("reads a plain export: TOTP with its settings, notes, favorites and groups; HOTP and Steam are counted", () => {
    const result = parseAegisJson(fixture("aegis.json"));
    expect(compact(result)).toEqual([
      {
        type: "login",
        title: "DATEV",
        fields: [
          ["username", "Username", "jonas@weber-haustechnik.example", "text"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/DATEV:jonas%40weber-haustechnik.example?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
            "totp",
          ],
          ["note", "Notes", "Kanzlei-Zugang für die Lohnabrechnung", "note"],
        ],
        favorite: true,
        folders: ["Büro"],
      },
      {
        type: "login",
        title: "Microsoft 365",
        fields: [
          ["username", "Username", "anna@weber-haustechnik.example", "text"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Microsoft%20365:anna%40weber-haustechnik.example?secret=KRUGKIDROVUWG2ZAMJZG653OEBTG66BA&issuer=Microsoft+365&algorithm=SHA256&digits=8&period=60",
            "totp",
          ],
        ],
        folders: ["Büro", "Verwaltung"],
      },
      {
        type: "login",
        title: "Großhandel-Portal",
        fields: [
          ["username", "Username", "sandra.becker", "text"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Gro%C3%9Fhandel-Portal:sandra.becker?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Gro%C3%9Fhandel-Portal&algorithm=SHA512&digits=7&period=30",
            "totp",
          ],
        ],
      },
    ]);
    expect(result).toMatchObject({ ok: true, skipped: 2 });
  });

  it("reports an encrypted export as encrypted", () => {
    expect(parseAegisJson(fixture("aegis-encrypted.json"))).toEqual({
      ok: false,
      error: "encrypted",
    });
  });

  it("takes Aegis's defaults for left-out settings and the old single group name", () => {
    const result = parseAegisJson(vault([totp({}, { group: "Werkstatt" })]));
    expect(compact(result)).toEqual([
      {
        type: "login",
        title: "DATEV",
        fields: [
          ["username", "Username", "jonas", "text"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
            "totp",
          ],
        ],
        folders: ["Werkstatt"],
      },
    ]);
    expect(result).toMatchObject({ skipped: 0 });
  });

  it("skips TOTP entries whose codes Kennwort cannot work out; unknown groups are no folder", () => {
    const result = parseAegisJson(
      vault([
        totp({ algo: "MD5" }),
        totp({ digits: 5 }),
        totp({ period: 0 }),
        totp({ secret: "kein schlüssel" }),
        totp({ secret: "" }),
        totp({ algo: "sha256" }, { groups: ["fehlt"] }),
        { ...totp({}), type: "TOTP" },
        { ...totp({}), type: "motp" },
      ]),
    );
    expect(result).toMatchObject({ ok: true, skipped: 7 });
    expect(result.ok && result.value.map((e) => e.content.fields[1]?.value)).toEqual([
      "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA256&digits=6&period=30",
    ]);
    expect(result.ok && result.value[0]?.folders).toEqual([]);
  });

  it("trims the issuer and account", () => {
    const result = parseAegisJson(vault([totp({}, { name: " jonas ", issuer: " DATEV " })]));
    expect(compact(result)).toMatchObject([
      {
        title: "DATEV",
        fields: [
          ["username", "Username", "jonas", "text"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
            "totp",
          ],
        ],
      },
    ]);
  });

  it("refuses JSON of another shape", () => {
    for (const json of ['{"services":[]}', '{"version":1,"header":{},"db":{}}', "[]"])
      expect(parseAegisJson(json)).toEqual({ ok: false, error: "wrong-format" });
    expect(parseAegisJson("{")).toEqual({ ok: false, error: "bad-json" });
  });
});
