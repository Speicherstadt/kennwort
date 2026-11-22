import { describe, expect, it } from "vitest";
import { parseKeePassXml } from "./keepass-xml.ts";
import { compact, fixture } from "./test/helpers.ts";

describe("KeePass XML (K-502)", () => {
  it("reads a real export: groups, protected values, history, CDATA, the recycle bin", () => {
    expect(compact(parseKeePassXml(fixture("keepass.xml")))).toEqual([
      {
        type: "login",
        title: "Online-Banking Sparkasse",
        fields: [
          ["username", "Username", "jonas.weber", "text"],
          ["password", "Password", "Sp@rkasse<2026>!", "secret"],
          ["website", "Website", "https://banking.sparkasse.example", "url"],
          ["website-2", "Website", "https://app.sparkasse.example", "url"],
          [
            "totp",
            "One-time code",
            "otpauth://totp/Sparkasse:jonas.weber?secret=JBSWY3DPEHPK3PXP",
            "totp",
          ],
          ["field-1", "Kundennummer", "7788-1", "text"],
          ["field-2", "Online-PIN", "90210", "secret"],
          ["note", "Notes", 'TAN per App\nKontakt: Filiale "Mitte" & Online', "note"],
        ],
        tags: ["Bank", "Büro"],
        history: [
          ["password", "Sp@rkasse-2025!", 1762157700000],
          ["password", "Sp@rkasse-2024!", 0],
        ],
      },
      {
        type: "login",
        title: "Schlüsseltresor Baustelle",
        fields: [
          ["password", "Password", "4711", "secret"],
          ["totp", "One-time code", "KRSXG5CTMVRXEZLU", "totp"],
          ["note", "Notes", "Code für den <Schlüsselkasten>\nGültig bis Bauende", "note"],
        ],
        tags: ["Baustelle", "Schlüssel"],
        folders: ["Baustellen/Musterstraße 5"],
      },
      {
        type: "login",
        title: "Wärmepumpen-Portal 🔥 ü",
        fields: [["username", "Username", "max@weber-haustechnik.example", "text"]],
        folders: ["Technik"],
      },
    ]);
  });
  it("keeps every group when the file names no recycle bin", () => {
    const xml = `<KeePassFile><Root><Group><Name>R</Name>
      <Entry><String><Key>Title</Key><Value>Oben</Value></String></Entry>
      <Group><Name>Unter</Name><Entry><String><Key>Title</Key><Value>Tief</Value></String></Entry></Group>
    </Group></Root></KeePassFile>`;
    expect(compact(parseKeePassXml(xml))).toEqual([
      { type: "login", title: "Oben", fields: [] },
      { type: "login", title: "Tief", fields: [], folders: ["Unter"] },
    ]);
  });

  it("reads a String without a value and an attribute that says no", () => {
    const xml = `<KeePassFile><Root><Group>
      <Entry><String><Key>Title</Key></String><String><Key>X</Key><Value ProtectInMemory="False">y</Value></String><String><Key>V</Key><Value ProtectInMemory="untrue">v</Value></String><String><Key>W</Key><Value ProtectInMemory="10">w</Value></String></Entry>
      <Entry><String><Key>TOTP Seed</Key><Value>S</Value></String></Entry>
    </Group></Root></KeePassFile>`;
    expect(compact(parseKeePassXml(xml))).toEqual([
      {
        type: "login",
        title: "",
        fields: [
          ["field-1", "X", "y", "text"],
          ["field-2", "V", "v", "text"],
          ["field-3", "W", "w", "text"],
        ],
      },
      { type: "login", title: "", fields: [["totp", "One-time code", "S", "totp"]] },
    ]);
  });

  it("leaves history versions without a password out", () => {
    const xml = `<KeePassFile><Root><Group><Entry>
      <String><Key>Password</Key><Value>neu</Value></String>
      <History><Entry><String><Key>UserName</Key><Value>u</Value></String></Entry></History>
    </Entry></Group></Root></KeePassFile>`;
    expect(compact(parseKeePassXml(xml))).toEqual([
      { type: "login", title: "", fields: [["password", "Password", "neu", "secret"]] },
    ]);
  });

  it("reads KDBX 4's times: Base64 of the seconds since 0001-01-01", () => {
    const since1 = (unix: number, length = 8) => {
      const bytes = Buffer.alloc(Math.max(8, length));
      bytes.writeBigUInt64LE(BigInt(unix + 62_135_596_800));
      return bytes.subarray(0, length).toString("base64");
    };
    const times = [
      since1(1_762_157_700),
      since1(1_762_157_701, 12),
      since1(-1),
      since1(1_700_000_000, 6),
      "AQ==",
    ];
    const xml = `<KeePassFile><Root><Group><Entry>
      <String><Key>Password</Key><Value>neu</Value></String><History>${times
        .map(
          (time, i) =>
            `<Entry><Times><LastModificationTime>${time}</LastModificationTime></Times><String><Key>Password</Key><Value>alt${i}</Value></String></Entry>`,
        )
        .join("")}</History>
    </Entry></Group></Root></KeePassFile>`;
    const result = parseKeePassXml(xml);
    expect(result.ok && result.value[0]?.content.history.map((h) => h.replacedAt)).toEqual([
      1_762_157_700_000,
      1_762_157_701_000,
      0,
      (Number(BigInt(1_700_000_000 + 62_135_596_800) & 0xffffffffffffn) - 62_135_596_800) * 1000,
      0,
    ]);
  });

  it("refuses XML that is not a KeePass file and text that is no XML", () => {
    expect(parseKeePassXml("<KeePassFile><Root/></KeePassFile>")).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseKeePassXml("<Andere><Root><Group/></Root></Andere>")).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseKeePassXml("<KeePassFile>")).toEqual({ ok: false, error: "bad-xml" });
    expect(parseKeePassXml(new Uint8Array([0xfe]))).toEqual({ ok: false, error: "not-text" });
  });
});
