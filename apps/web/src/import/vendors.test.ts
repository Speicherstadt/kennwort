import { IMPORT_FORMATS } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { afterEach, describe, expect, it } from "vitest";
import { isQr, TABLE, vendorChoices } from "./vendors.ts";

// K-501: the vendor step offers every format core reads, plus any table, in German and English
afterEach(() => setLocale("de", { reload: false }));

describe("vendor choices", () => {
  it("lists every import format of core and the table last", () => {
    const ids = vendorChoices().map((choice) => choice.id);
    expect(ids).toEqual([...IMPORT_FORMATS.map((format) => format.id), TABLE]);
  });

  it("gives every choice a label and a how-to in both languages", () => {
    for (const locale of ["de", "en"] as const) {
      setLocale(locale, { reload: false });
      for (const choice of vendorChoices()) {
        expect(choice.label().trim(), choice.id).not.toBe("");
        expect(choice.howTo().length, choice.id).toBeGreaterThan(30);
      }
    }
  });

  it("gives every how-to its own text", () => {
    const texts = vendorChoices().map((choice) => choice.howTo());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("names the product as core does and adds the rest in the app's texts", () => {
    const label = (id: string) =>
      vendorChoices()
        .find((c) => c.id === id)
        ?.label();
    expect(label("safari-csv")).toBe("Safari / Apple Passwörter (CSV)");
    expect(label("bitwarden-json")).toBe("Bitwarden (JSON)");
    expect(label(TABLE)).toBe("Andere Tabelle (CSV)");
    setLocale("en", { reload: false });
    expect(label("safari-csv")).toBe("Safari / Apple Passwords (CSV)");
    expect(label(TABLE)).toBe("Other spreadsheet (CSV)");
  });

  it("names the authenticators' exports: QR codes and the .2fas file (K-503)", () => {
    const choice = (id: string) => vendorChoices().find((c) => c.id === id);
    expect(choice("google-authenticator")?.label()).toBe("Google Authenticator (QR-Code)");
    expect(choice("2fas-json")?.label()).toBe("2FAS (.2fas)");
    expect(choice("aegis-json")?.label()).toBe("Aegis (JSON)");
    expect(choice("2fas-json")?.accept).toBe(".2fas,.json,application/json");
    expect(
      vendorChoices()
        .filter(isQr)
        .map((c) => c.id),
    ).toEqual(["google-authenticator"]);
    setLocale("en", { reload: false });
    expect(choice("google-authenticator")?.label()).toBe("Google Authenticator (QR code)");
  });

  it("accepts the file type of each format in the file picker", () => {
    const accept = (id: string) => vendorChoices().find((c) => c.id === id)?.accept;
    expect(accept("bitwarden-json")).toBe(".json,application/json");
    expect(accept("keepass-xml")).toBe(".xml,text/xml,application/xml");
    expect(accept(TABLE)).toBe(".csv,text/csv");
    expect(accept("dashlane-zip")).toBe(".zip,application/zip");
    expect(accept("1password-1pux")).toBe(".1pux");
  });
});
