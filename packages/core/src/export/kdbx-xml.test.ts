import { describe, expect, it } from "vitest";
import { fromBase64 } from "../import/base64.ts";
import { parseXml } from "../import/xml.ts";
import { flatEntry } from "./flat.ts";
import { kdbxTime, kdbxXml, protectXml, toBase64, xmlText } from "./kdbx-xml.ts";
import { BUERO } from "./test/weber.ts";

const counter = () => {
  let n = 0;
  return (length: number) => new Uint8Array(length).fill(++n);
};
const zeros = (length: number) => new Uint8Array(length);
const textOf = (parts: ReturnType<typeof kdbxXml>) =>
  new TextDecoder().decode(protectXml(parts, zeros));

describe("xmlText", () => {
  it("escapes the five specials, keeps a CR as a reference and drops what XML 1.0 forbids", () => {
    expect(xmlText(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    expect(xmlText("a\r\nb\tc")).toBe("a&#13;\nb\tc");
    expect(xmlText("\u0000\u0001\u0008\u000b\u000c\u000e\u001fx￾￿\ud800y")).toBe("xy");
    expect(xmlText("Wärme 🔥")).toBe("Wärme 🔥");
    expect(xmlText("\u0009\u000a \u007f�")).toBe("\t\n \u007f�");
    // Lone surrogates at both ends of the range go, the characters around them stay
    const char = (code: number) => String.fromCharCode(code);
    expect(xmlText(`a${char(0xdfff)}b${char(0xd800)}c${char(0xd7ff)}${char(0xe000)}`)).toBe(
      `abc${char(0xd7ff)}${char(0xe000)}`,
    );
  });
});

describe("toBase64 and kdbxTime", () => {
  it("writes standard Base64 with padding, also for long values", () => {
    expect(toBase64(Uint8Array.of(0xfb, 0xff))).toBe("+/8=");
    expect(toBase64(new Uint8Array())).toBe("");
    const long = new Uint8Array(200_000).fill(0x41);
    expect(fromBase64(toBase64(long))).toEqual(long);
  });

  it("writes seconds since 0001-01-01 as uint64 LE, nothing before 1970", () => {
    const seconds = (text: string) =>
      new DataView((fromBase64(text) as Uint8Array).buffer).getBigUint64(0, true);
    expect(seconds(kdbxTime(0))).toBe(62_135_596_800n);
    expect(seconds(kdbxTime(1_760_000_000.9))).toBe(62_135_596_800n + 1_760_000_000n);
    expect(seconds(kdbxTime(-5))).toBe(62_135_596_800n);
  });
});

describe("kdbxXml", () => {
  const banking = flatEntry(BUERO.entries[0] as (typeof BUERO.entries)[0]);
  const parts = kdbxXml([{ name: "Büro", entries: [banking] }], counter(), 1_800_000_000);
  const text = textOf(parts);

  it("is a KeePassFile with a root group Kennwort and a group per vault", () => {
    const xml = parseXml(text);
    expect(xml.ok).toBe(true);
    expect(
      text.startsWith('<?xml version="1.0" encoding="utf-8" standalone="yes"?><KeePassFile>'),
    ).toBe(true);
    expect(text).toContain(
      "<Meta><Generator>Kennwort</Generator><DatabaseName>Kennwort</DatabaseName></Meta><Root><Group><UUID>AQEBAQEBAQEBAQEBAQEBAQ==</UUID><Name>Kennwort</Name><Group><UUID>AgICAgICAgICAgICAgICAg==</UUID><Name>Büro</Name><Entry><UUID>AwMDAwMDAwMDAwMDAwMDAw==</UUID>",
    );
    expect(text.endsWith("</Entry></Group></Group></Root></KeePassFile>")).toBe(true);
  });

  it("writes the standard strings, the code, more links and own fields, secrets protected", () => {
    expect(text).toContain(
      `<Times><CreationTime>${kdbxTime(1_800_000_000)}</CreationTime><LastModificationTime>${kdbxTime(1_800_000_000)}</LastModificationTime></Times><Tags>Bank;Büro</Tags>`,
    );
    // The title in plain text: once for the entry, once for each earlier state
    expect(
      text.split("<String><Key>Title</Key><Value>Online-Banking Sparkasse</Value></String>"),
    ).toHaveLength(4);
    expect(text).toContain("<String><Key>UserName</Key><Value>jonas.weber</Value></String>");
    expect(text).toContain(
      `<String><Key>Password</Key><Value Protected="True">${toBase64(new TextEncoder().encode("Sp@rkasse-2026!"))}</Value></String>`,
    );
    expect(text).toContain(
      "<String><Key>URL</Key><Value>https://banking.sparkasse.example</Value></String>",
    );
    expect(text).toContain(
      "<String><Key>Notes</Key><Value>TAN per App\nKontakt: Filiale &quot;Mitte&quot;</Value></String>",
    );
    expect(text).toContain('<String><Key>otp</Key><Value Protected="True">');
    expect(text).toContain(
      "<String><Key>KP2A_URL</Key><Value>https://app.sparkasse.example</Value></String>",
    );
    expect(text).toContain("<String><Key>Kundennummer</Key><Value>7788-1</Value></String>");
    expect(text).toContain(
      `<String><Key>PIN</Key><Value Protected="True">${toBase64(new TextEncoder().encode("4711"))}</Value></String>`,
    );
  });

  it("keeps each earlier password as a history entry with its time", () => {
    expect(text).toContain(
      `<History><Entry><UUID>AwMDAwMDAwMDAwMDAwMDAw==</UUID><Times><CreationTime>${kdbxTime(1_730_000_000)}</CreationTime>`,
    );
    expect(text).toContain(
      `<LastModificationTime>${kdbxTime(1_760_000_000)}</LastModificationTime></Times><String><Key>Title</Key><Value>Online-Banking Sparkasse</Value></String><String><Key>Password</Key><Value Protected="True">${toBase64(new TextEncoder().encode("Sp@rkasse-2025!"))}</Value></String></Entry></History>`,
    );
    const plain = { ...banking, passwords: [], totp: "", urls: [] };
    const bare = textOf(kdbxXml([{ name: "x", entries: [plain] }], counter(), 0));
    expect(bare).not.toContain("History");
    expect(bare).not.toContain("otp");
    expect(bare).not.toContain("KP2A_URL");
    expect(bare).toContain(
      "<String><Key>URL</Key><Value></Value></String><String><Key>Notes</Key><Value>TAN per App\nKontakt: Filiale &quot;Mitte&quot;</Value></String><String><Key>Kundennummer</Key>",
    );
    const nothing = { ...plain, fields: [] };
    expect(textOf(kdbxXml([{ name: "x", entries: [nothing] }], counter(), 0))).toContain(
      "&quot;Mitte&quot;</Value></String></Entry></Group>",
    );
  });

  it("numbers further links and gives every own field a key of its own", () => {
    const entry = {
      ...banking,
      urls: ["https://a", "https://b", "https://c"],
      fields: [
        { name: "Title", value: "1", secret: false },
        { name: "otp", value: "2", secret: false },
        { name: "PIN", value: "3", secret: false },
        { name: "PIN", value: "4", secret: false },
        { name: "PIN (2)", value: "5", secret: false },
        { name: "PIN", value: "8", secret: false },
        { name: "UserName", value: "9", secret: false },
        { name: "Password", value: "10", secret: false },
        { name: "URL", value: "11", secret: false },
        { name: "Notes", value: "12", secret: false },
        { name: "KP2A_URL_7", value: "6", secret: false },
        { name: "KP2A_URL_7", value: "7", secret: false },
      ],
    };
    const keys = [
      ...textOf(kdbxXml([{ name: "x", entries: [entry] }], counter(), 0)).matchAll(
        /<Key>([^<]*)<\/Key>/g,
      ),
    ].map((m) => m[1]);
    expect(keys).toEqual([
      "Title",
      "UserName",
      "Password",
      "URL",
      "Notes",
      "otp",
      "KP2A_URL",
      "KP2A_URL_1",
      "Title (2)",
      "otp (2)",
      "PIN",
      "PIN (2)",
      "PIN (2) (2)",
      "PIN (3)",
      "UserName (2)",
      "Password (2)",
      "URL (2)",
      "Notes (2)",
      "(KP2A_URL_7)",
      "(KP2A_URL_7) (2)",
      "Title",
      "Password",
      "Title",
      "Password",
    ]);
  });

  // Review of K-504: KeePassXC refuses the whole database on a key twice ("Duplicate custom
  // attribute found"), so a key must be unique as written, after what XML 1.0 forbids is dropped
  it("keeps keys unique as written, also when a name holds characters XML drops", () => {
    const entry = {
      ...banking,
      fields: [
        { name: "Password\u0001", value: "1", secret: false },
        { name: "PIN", value: "2", secret: false },
        { name: "PIN\u0002", value: "3", secret: false },
        { name: "\u0003", value: "4", secret: false },
      ],
    };
    const text = textOf(kdbxXml([{ name: "x", entries: [entry] }], counter(), 0));
    const keys = [...text.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => m[1]);
    // The entry's own keys, before its two history entries
    const own = keys.slice(0, 11);
    expect(own).toEqual([
      "Title",
      "UserName",
      "Password",
      "URL",
      "Notes",
      "otp",
      "KP2A_URL",
      "Password (2)",
      "PIN",
      "PIN (2)",
      "Field",
    ]);
  });
});

describe("protectXml", () => {
  it("XORs the values with one stream in document order and writes Base64", () => {
    const lengths: number[] = [];
    const stream = (length: number) => {
      lengths.push(length);
      return Uint8Array.from({ length }, (_, i) => i + 1);
    };
    const bytes = protectXml(
      [
        "<a>",
        { protect: Uint8Array.of(0, 0) },
        "</a><b>",
        { protect: Uint8Array.of(0xff) },
        "</b>",
      ],
      stream,
    );
    expect(lengths).toEqual([3]);
    expect(new TextDecoder().decode(bytes)).toBe(
      `<a>${toBase64(Uint8Array.of(1, 2))}</a><b>${toBase64(Uint8Array.of(0xff ^ 3))}</b>`,
    );
  });
});
