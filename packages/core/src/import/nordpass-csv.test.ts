import { describe, expect, it } from "vitest";
import { parseNordPassCsv } from "./nordpass-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("NordPass CSV (K-502)", () => {
  it("reads a real export: folder rows, JSON in cells, cards, identities, notes", () => {
    expect(compact(parseNordPassCsv(fixture("nordpass.csv")))).toEqual([
      {
        type: "login",
        title: "Heizungsportal Kunde Meyer",
        fields: [
          ["username", "Username", "service@weber-haustechnik.example", "text"],
          ["password", "Password", "Me7er-Heizung", "secret"],
          ["website", "Website", "https://heizung.kunde.example", "url"],
          ["website-2", "Website", "https://app.heizung.kunde.example", "url"],
          ["field-1", "Anlagennummer", "WP-2291", "text"],
          ["field-2", "Wartungscode", "8812", "secret"],
          ["note", "Notes", "Anlage im Keller\nZugang über Garage", "note"],
        ],
        folders: ["Kunden"],
      },
      {
        type: "card",
        title: "Tankkarte",
        fields: [
          ["holder", "Cardholder", "Sandra Becker", "text"],
          ["number", "Card number", "4000056655665556", "secret"],
          ["expiry", "Expiry", "09/27", "text"],
          ["cvc", "CVC", "321", "secret"],
        ],
      },
      {
        type: "identity",
        title: "Sandra Becker",
        fields: [
          ["name", "Name", "Sandra Becker", "text"],
          ["email", "Email", "sandra@weber-haustechnik.example", "email"],
          ["phone", "Phone", "+49 421 654321", "text"],
          ["address", "Address", "Industriestraße 12\nHalle 2\n28199 Bremen\nDE", "note"],
          ["note", "Notes", "Personalakte", "note"],
        ],
      },
      {
        type: "note",
        title: "Notfallnummern",
        fields: [["note", "Notes", "Heizungsnotdienst: 0421 999\nWasserwerk: 0421 888", "note"]],
      },
    ]);
  });
  it("reads a login without more links and an identity's state", () => {
    const head =
      "name,url,additional_urls,username,password,note,cardholdername,cardnumber,cvc,expirydate,zipcode,folder,full_name,phone_number,email,address1,address2,city,country,state,type,custom_fields";
    const csv = [
      head,
      "L,https://a.example,,u,,,,,,,,,,,,,,,,,password,",
      "I,,,,,,,,,,,,,,,,,,,Bremen,identity,",
    ].join("\n");
    expect(compact(parseNordPassCsv(csv))).toEqual([
      {
        type: "login",
        title: "L",
        fields: [
          ["username", "Username", "u", "text"],
          ["website", "Website", "https://a.example", "url"],
        ],
      },
      { type: "identity", title: "I", fields: [["address", "Address", "Bremen", "note"]] },
    ]);
  });

  it("refuses a CSV with other columns", () => {
    expect(parseNordPassCsv("name,url,username,password\na,b,c,d")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
