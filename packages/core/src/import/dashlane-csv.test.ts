import { describe, expect, it } from "vitest";
import { parseDashlaneCsv } from "./dashlane-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("Dashlane CSV (K-502)", () => {
  it("reads credentials.csv with one-time links and categories", () => {
    expect(compact(parseDashlaneCsv(fixture("dashlane-credentials.csv")))).toEqual([
      {
        type: "login",
        title: "Großhändler-Portal",
        fields: [
          ["username", "Username", "jonas@weber-haustechnik.example", "text"],
          ["password", "Password", "Gr0ssh@ndel!", "secret"],
          ["website", "Website", "https://portal.grosshandel.example", "url"],
          ["totp", "One-time code", "otpauth://totp/Portal:jonas?secret=JBSWY3DPEHPK3PXP", "totp"],
          ["field-1", "Username 2", "jonas.weber", "text"],
          ["note", "Notes", "Kundennummer 40711\nLieferung ins Lager", "note"],
        ],
        folders: ["Einkauf"],
      },
      {
        type: "login",
        title: "Lohnprogramm",
        fields: [
          ["username", "Username", "sandra", "text"],
          ["password", "Password", "L0hn#Sandra", "secret"],
          ["website", "Website", "https://lohn.example", "url"],
        ],
      },
    ]);
  });
  it("reads securenotes.csv", () => {
    expect(compact(parseDashlaneCsv(fixture("dashlane-securenotes.csv")))).toEqual([
      {
        type: "note",
        title: "Tresorcode Büro",
        fields: [["note", "Notes", "Code 1979\nNur für Jonas und Anna", "note"]],
      },
    ]);
  });
  it("reads payments.csv: current and older cards, bank accounts", () => {
    expect(compact(parseDashlaneCsv(fixture("dashlane-payments.csv")))).toEqual([
      {
        type: "card",
        title: "Firmenkarte",
        fields: [
          ["holder", "Cardholder", "Jonas Weber", "text"],
          ["number", "Card number", "4111111111111111", "secret"],
          ["expiry", "Expiry", "08/2028", "text"],
          ["cvc", "CVC", "123", "secret"],
          ["field-1", "Bank", "Sparkasse Bremen", "text"],
          ["field-2", "Country", "DE", "text"],
          ["note", "Notes", "Tankkarte", "note"],
        ],
      },
      {
        type: "card",
        title: "Anna Schmidt",
        fields: [
          ["holder", "Cardholder", "Anna Schmidt", "text"],
          ["number", "Card number", "5555555555554444", "secret"],
          ["expiry", "Expiry", "01/2027", "text"],
          ["cvc", "CVC", "456", "secret"],
          ["field-1", "Country", "DE", "text"],
        ],
      },
      {
        type: "note",
        title: "Geschäftskonto",
        fields: [
          ["field-1", "Account holder", "Weber Haustechnik GmbH", "text"],
          ["field-2", "Account number", "DE89370400440532013000", "secret"],
          ["field-3", "Routing number", "SBREDE22", "text"],
          ["field-4", "Bank", "Sparkasse Bremen", "text"],
          ["field-5", "Country", "DE", "text"],
        ],
      },
    ]);
  });
  it("reads ids.csv", () => {
    expect(compact(parseDashlaneCsv(fixture("dashlane-ids.csv")))).toEqual([
      {
        type: "identity",
        title: "license",
        fields: [
          ["field-1", "number", "B072RRE2I55", "text"],
          ["field-2", "name", "Max Mustermann", "text"],
          ["field-3", "issue_date", "2019-04-01", "text"],
          ["field-4", "expiration_date", "2034-04-01", "text"],
          ["field-5", "place_of_issue", "Bremen", "text"],
        ],
      },
    ]);
  });
  it("reads personalInfo.csv", () => {
    expect(compact(parseDashlaneCsv(fixture("dashlane-personalinfo.csv")))).toEqual([
      {
        type: "identity",
        title: "Firmen-Mail",
        fields: [
          ["field-1", "email", "info@weber-haustechnik.example", "text"],
          ["field-2", "email_type", "business", "text"],
        ],
      },
    ]);
  });
  it("reads the older credentials.csv with otpSecret", () => {
    const csv =
      "username,username2,username3,title,password,note,url,category,otpSecret\nmax,,m3,T,p,,,,SEED";
    expect(compact(parseDashlaneCsv(csv))).toEqual([
      {
        type: "login",
        title: "T",
        fields: [
          ["username", "Username", "max", "text"],
          ["password", "Password", "p", "secret"],
          ["totp", "One-time code", "SEED", "totp"],
          ["field-1", "Username 3", "m3", "text"],
        ],
      },
    ]);
  });

  it("takes the account holder before the account name and a bank account's note", () => {
    const csv = [
      "type,account_name,account_holder,cc_number,code,expiration_month,expiration_year,routing_number,account_number,country,issuing_bank,note,name",
      "payment_card,Konto,Max Mustermann,4111,,,,,,,,,Karte",
      "bank,Konto,,,,,,,,,,Für Löhne,",
    ].join("\n");
    expect(compact(parseDashlaneCsv(csv))).toEqual([
      {
        type: "card",
        title: "Karte",
        fields: [
          ["holder", "Cardholder", "Max Mustermann", "text"],
          ["number", "Card number", "4111", "secret"],
        ],
      },
      { type: "note", title: "Konto", fields: [["note", "Notes", "Für Löhne", "note"]] },
    ]);
  });

  it("passes on what the CSV reader reports", () => {
    expect(parseDashlaneCsv('"')).toEqual({ ok: false, error: "bad-csv" });
  });

  it("refuses a CSV of another kind", () => {
    expect(parseDashlaneCsv("a,b\n1,2")).toEqual({ ok: false, error: "wrong-format" });
    expect(parseDashlaneCsv("")).toEqual({ ok: false, error: "wrong-format" });
  });
});
