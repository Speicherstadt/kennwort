import { describe, expect, it } from "vitest";
import { parseLastPassCsv } from "./lastpass-csv.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("LastPass CSV (K-502)", () => {
  it("reads a real export: logins, cards, addresses, other notes, shared folders", () => {
    expect(compact(parseLastPassCsv(fixture("lastpass.csv")))).toEqual([
      {
        type: "login",
        title: "Sanitär-Shop",
        fields: [
          ["username", "Username", "einkauf@weber-haustechnik.example", "text"],
          ["password", "Password", 'Sh0p,"Sanitär"', "secret"],
          ["website", "Website", "https://shop.sanitaer.example/login", "url"],
          ["note", "Notes", "Bestellungen ab 500 € mit Freigabe", "note"],
        ],
        favorite: true,
        folders: ["Einkauf"],
      },
      {
        type: "card",
        title: "Firmenkreditkarte",
        fields: [
          ["holder", "Cardholder", "Jonas Weber", "text"],
          ["number", "Card number", "4111111111111111", "secret"],
          ["expiry", "Expiry", "08/2028", "text"],
          ["cvc", "CVC", "123", "secret"],
          ["note", "Notes", "Firmenkarte für Tankstellen\nNicht für private Ausgaben", "note"],
        ],
        folders: ["Shared-Büro/Karten"],
      },
      {
        type: "identity",
        title: "Anna Schmidt",
        fields: [
          ["name", "Name", "Frau Anna Schmidt", "text"],
          ["email", "Email", "anna@weber-haustechnik.example", "email"],
          ["phone", "Phone", "+49 421 123456", "text"],
          ["address", "Address", "Weber Haustechnik\nIndustriestraße 12\n28199 Bremen\nDE", "note"],
          ["field-1", "Username", "anna", "text"],
        ],
      },
      {
        type: "note",
        title: "WLAN Büro",
        fields: [
          ["field-1", "SSID", "Weber-Buero", "text"],
          ["field-2", "Password", "Heizung&Sanitaer2026", "secret"],
          ["field-3", "Connection Type", "WPA2", "text"],
          ["note", "Notes", "Gäste-WLAN ist getrennt", "note"],
        ],
      },
      {
        type: "note",
        title: "Fahrzeugschlüssel",
        fields: [
          ["note", "Notes", "Schlüsselliste:\nTransporter 1 – Max\nTransporter 2 – Sandra", "note"],
        ],
        folders: ["Fuhrpark"],
      },
      {
        type: "login",
        title: "telematik.example",
        fields: [["website", "Website", "https://telematik.example", "url"]],
      },
    ]);
  });
  it("reads a card without expiry, an unknown month and a note without notes", () => {
    const extra = (lines: string[]) => `"${lines.join("\n")}"`;
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      `http://sn,,,,${extra(["NoteType:Credit Card", "Number:1", "Expiration Date:,"])},A,,0`,
      `http://sn,,,,${extra(["NoteType:Credit Card", "Expiration Date:Smarch,2030"])},B,,0`,
      `http://sn,,,,${extra(["NoteType:Credit Card", "Expiration Date:May,"])},C,,0`,
      `http://sn,,,,${extra(["NoteType:Server", "Hostname:srv", "Private Key:k", ":leer", "Number:7"])},D,,0`,
    ].join("\n");
    expect(compact(parseLastPassCsv(csv))).toEqual([
      { type: "card", title: "A", fields: [["number", "Card number", "1", "secret"]] },
      { type: "card", title: "B", fields: [["expiry", "Expiry", "2030", "text"]] },
      { type: "card", title: "C", fields: [["expiry", "Expiry", "5", "text"]] },
      {
        type: "note",
        title: "D",
        fields: [
          ["field-1", "Hostname", "srv", "text"],
          ["field-2", "Private Key", "k", "secret"],
          ["field-3", "Number", "7", "secret"],
        ],
      },
    ]);
  });

  it("reads notes right after the kind, an expiry without year and every part of an address", () => {
    const extra = (lines: string[]) => `"${lines.join("\n")}"`;
    const address = [
      "NoteType:Address",
      "Title:Herr",
      "First Name:Max",
      "Middle Name:J.",
      "Last Name:Mustermann",
      "Address 1:Hof 1",
      "Address 2:Halle 2",
      "Address 3:Tor 3",
      "City / Town:Bremen",
      "State:HB",
      "Zip / Postal Code:28199",
      "Country:DE",
    ];
    const csv = [
      "url,username,password,totp,extra,name,grouping,fav",
      `http://sn,,,,${extra(["NoteType:Credit Card", "Notes:gleich", "Number:1"])},K,,0`,
      `http://sn,,,,${extra(["NoteType:Credit Card", "Expiration Date:May"])},M,,0`,
      `http://sn,,,,${extra(address)},A,,0`,
      "https://a.example,u,p,SEED,,L,,0",
    ].join("\n");
    expect(compact(parseLastPassCsv(csv))).toEqual([
      { type: "card", title: "K", fields: [["note", "Notes", "gleich\nNumber:1", "note"]] },
      { type: "card", title: "M", fields: [["expiry", "Expiry", "5", "text"]] },
      {
        type: "identity",
        title: "A",
        fields: [
          ["name", "Name", "Herr Max J. Mustermann", "text"],
          ["address", "Address", "Hof 1\nHalle 2\nTor 3\n28199 Bremen\nHB\nDE", "note"],
        ],
      },
      {
        type: "login",
        title: "L",
        fields: [
          ["username", "Username", "u", "text"],
          ["password", "Password", "p", "secret"],
          ["website", "Website", "https://a.example", "url"],
          ["totp", "One-time code", "SEED", "totp"],
        ],
      },
    ]);
  });

  it("reads every label that holds a secret as one", () => {
    const labels = ["Password", "Passphrase", "Private Key", "Pin", "PIN", "Number"];
    const extra = ["NoteType:Database", ...labels.map((label) => `${label}:x`)].join("\n");
    const csv = `url,username,password,extra,name,grouping\nhttp://sn,,,"${extra}",DB,`;
    const result = parseLastPassCsv(csv);
    const kinds = result.ok ? result.value[0]?.content.fields.map((f) => f.kind) : [];
    expect(kinds).toEqual(labels.map(() => "secret"));
  });

  it("refuses a CSV with other columns", () => {
    expect(parseLastPassCsv("url,username,password\na,b,c")).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });
});
