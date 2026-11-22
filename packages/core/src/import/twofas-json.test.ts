import { describe, expect, it } from "vitest";
import { compact, fixture } from "./test/helpers.ts";
import { parseTwoFasJson } from "./twofas-json.ts";

const backup = (services: unknown[], groups: unknown[] = []) =>
  JSON.stringify({ services, groups, schemaVersion: 4 });
const service = (otp: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  name: "DATEV",
  secret: "JBSWY3DPEHPK3PXP",
  otp: { account: "jonas", tokenType: "TOTP", ...otp },
  ...extra,
});

describe("2FAS backup (K-503)", () => {
  it("reads a plain backup: TOTP with its settings and groups; HOTP and Steam are counted", () => {
    const result = parseTwoFasJson(fixture("twofas.2fas"));
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
        ],
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
        folders: ["Büro"],
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

  it("reports a backup with a password as encrypted", () => {
    expect(parseTwoFasJson(fixture("twofas-encrypted.2fas"))).toEqual({
      ok: false,
      error: "encrypted",
    });
  });

  it("takes the defaults for left-out settings, as older backups have them", () => {
    const result = parseTwoFasJson(
      backup([{ name: "DATEV", secret: "JBSWY3DPEHPK3PXP", otp: {} }]),
    );
    expect(compact(result)).toEqual([
      {
        type: "login",
        title: "DATEV",
        fields: [
          [
            "totp",
            "One-time code",
            "otpauth://totp/DATEV:?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA1&digits=6&period=30",
            "totp",
          ],
        ],
      },
    ]);
    expect(result).toMatchObject({ skipped: 0 });
  });

  it("skips services whose codes Kennwort cannot work out; an unknown group is no folder", () => {
    const result = parseTwoFasJson(
      backup([
        service({ algorithm: "MD5" }),
        service({ digits: 9 }),
        service({ period: 100_000 }),
        service({}, { secret: "0000" }),
        service({ tokenType: "totp" }),
        service({ tokenType: "HOTP", counter: 3 }),
        service({ algorithm: "sha512" }, { groupId: "fehlt" }),
      ]),
    );
    expect(result).toMatchObject({ ok: true, skipped: 6 });
    expect(result.ok && result.value.map((e) => e.content.fields[1]?.value)).toEqual([
      "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV&algorithm=SHA512&digits=6&period=30",
    ]);
    expect(result.ok && result.value[0]?.folders).toEqual([]);
  });

  it("refuses JSON of another shape", () => {
    for (const json of ['{"services":[]}', '{"schemaVersion":4}', '{"db":{}}'])
      expect(parseTwoFasJson(json)).toEqual({ ok: false, error: "wrong-format" });
  });
});
