import type { EntryContent, ImportedEntry } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import {
  type Comparable,
  contentsToImport,
  countByType,
  type ImportChoices,
  previewRows,
} from "./preview.ts";

// K-501: the preview shows what the file holds without a secret, marks duplicates of what the
// target vault already has and weak passwords by K-306's rule, and builds what gets written.
// K-503 Teil 2: a code from an authenticator app is offered to the matching login of the vault
const field = (id: string, value: string, kind: EntryContent["fields"][number]["kind"]) => ({
  id,
  name: id,
  value,
  kind,
});
const login = (title: string, username: string, password: string, url = ""): ImportedEntry => ({
  content: {
    type: "login",
    title,
    fields: [
      field("username", username, "text"),
      field("password", password, "secret"),
      ...(url ? [field("website", url, "url")] : []),
    ],
    tags: [],
    favorite: false,
    history: [],
  },
  folders: [],
});
const note = (title: string): ImportedEntry => ({
  content: { type: "note", title, fields: [], tags: [], favorite: false, history: [] },
  folders: ["Büro"],
});

/** An entry of the target vault, as the app shows it */
const inVault = (
  id: string,
  title: string,
  username: string,
  website = "",
  totp = "",
): Comparable => ({
  id,
  type: "login",
  title,
  username,
  website,
  fields: [
    field("username", username, "text"),
    field("website", website, "url"),
    field("totp", totp, "totp"),
  ],
});
const existing = [inVault("d1", "DATEV", "anna@weber-haustechnik.test", "https://datev.example/")];
const choices = (more: Partial<ImportChoices> = {}): ImportChoices => ({
  take: new Set(),
  foldersAsTags: false,
  targets: new Map(),
  ...more,
});
/** The contents of the new entries among the writes */
const newContents = (entries: readonly ImportedEntry[], chosen: Partial<ImportChoices> = {}) =>
  contentsToImport(entries, previewRows(entries, []), choices(chosen)).flatMap((w) =>
    w.kind === "new" ? [w.content] : [],
  );

describe("preview rows", () => {
  it("show title, username and address, never a secret", () => {
    const [row] = previewRows(
      [login("Sparkasse", "jonas", "Rohr-Ventil-2026!", "https://sparkasse.example")],
      [],
    );
    expect(row).toEqual({
      index: 0,
      type: "login",
      title: "Sparkasse",
      username: "jonas",
      url: "https://sparkasse.example",
      folders: [],
      duplicate: false,
      weak: false,
      targets: [],
    });
    expect(JSON.stringify(row)).not.toContain("Rohr-Ventil");
  });

  it("mark an entry with the title, username and address of one in the vault as a duplicate", () => {
    const rows = previewRows(
      [
        login(" datev ", "Anna@weber-haustechnik.test", "x", "https://DATEV.example"),
        login("DATEV", "max@weber-haustechnik.test", "x", "https://datev.example/"),
        login("DATEV", "anna@weber-haustechnik.test", "x", "https://datev.example/login"),
      ],
      existing,
    );
    expect(rows.map((r) => r.duplicate)).toEqual([true, false, false]);
  });

  it("mark a repeat within the file as a duplicate of its first row", () => {
    const rows = previewRows([note("WLAN"), note("WLAN"), note("Alarmanlage")], []);
    expect(rows.map((r) => r.duplicate)).toEqual([false, true, false]);
  });

  it("mark weak passwords by the rule of Zum Ändern", () => {
    const rows = previewRows(
      [
        login("Router", "admin", "sommer2019"),
        login("NAS", "admin", "Kessel-Pumpe-Rohr-Ventil-7!"),
        login("Kamera", "admin", ""),
      ],
      [],
    );
    expect(rows.map((r) => r.weak)).toEqual([true, false, false]);
  });
});

describe("counts per type", () => {
  it("count each type once, the most frequent first", () => {
    expect(countByType([note("A"), login("B", "", ""), note("C")])).toEqual([
      ["note", 2],
      ["login", 1],
    ]);
  });
});

describe("what gets written", () => {
  const entries = [login("Router", "admin", "sommer2019"), note("WLAN"), note("WLAN")];

  it("leaves out duplicates unless taken anyway", () => {
    expect(newContents(entries)).toHaveLength(2);
    expect(newContents(entries, { take: new Set([2]) })).toHaveLength(3);
  });

  it("adds the folders as tags when asked", () => {
    expect(newContents(entries, { foldersAsTags: true })[1]?.tags).toEqual(["Büro"]);
    expect(newContents(entries)[1]?.tags).toEqual([]);
  });

  it("keeps the newest ten earlier passwords of a field, as a change does", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      fieldId: "password",
      value: `alt-${i}`,
      replacedAt: i,
    }));
    const old = login("Mail", "info", "x");
    const withHistory = { ...old, content: { ...old.content, history } };
    const [written] = newContents([withHistory]);
    expect(written?.history.map((h) => h.value)).toEqual(history.slice(2).map((h) => h.value));
  });
});

describe("codes from an authenticator app", () => {
  const DATEV = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";
  const OTHER = "otpauth://totp/DATEV:jonas?secret=KRUGKIDROVUWG2ZAMJZG653OEBTG66BA&issuer=DATEV";
  /** An account as the authenticator parsers read it: the issuer as title, no password */
  const code = (title: string, account: string, totp = DATEV): ImportedEntry => ({
    content: {
      type: "login",
      title,
      fields: [field("username", account, "text"), field("totp", totp, "totp")],
      tags: [],
      favorite: false,
      history: [],
    },
    folders: [],
  });
  const vault = [
    inVault("datev", "DATEV", "jonas", "https://www.datev.de"),
    inVault("portal", "Portal", "sandra", "https://grosshandel.example", OTHER),
    inVault("bank-1", "Sparkasse", "max"),
    inVault("bank-2", "sparkasse", "max"),
    inVault("mail", "Mail", "anna", "", DATEV),
  ];
  const entries = [
    code("DATEV", "jonas"),
    code("grosshandel.example", "sandra"),
    code("Sparkasse", "max"),
    code("Mail", "anna"),
    code("Werkstatt", "max"),
  ];
  const rows = previewRows(entries, vault);

  it("offer each code the logins with the same service and username, never its key", () => {
    expect(rows.map((r) => r.targets)).toEqual([
      [{ id: "datev", title: "DATEV", username: "jonas", state: "free" }],
      [{ id: "portal", title: "Portal", username: "sandra", state: "conflict" }],
      [
        { id: "bank-1", title: "Sparkasse", username: "max", state: "free" },
        { id: "bank-2", title: "sparkasse", username: "max", state: "free" },
      ],
      [{ id: "mail", title: "Mail", username: "anna", state: "same" }],
      [],
    ]);
    expect(JSON.stringify(rows)).not.toContain("JBSWY3DP");
  });

  it("count a login that has the code already as a duplicate, and nothing else", () => {
    expect(rows.map((r) => r.duplicate)).toEqual([false, false, false, true, false]);
  });

  it("count a match not as a duplicate even with the same title, username and address", () => {
    const [row] = previewRows([code("DATEV", "jonas")], [inVault("d", "DATEV", "jonas")]);
    expect(row?.duplicate).toBe(false);
  });

  it("count a repeat within the file as a duplicate even when it matches", () => {
    const twice = [code("DATEV", "jonas"), code("DATEV", "jonas", OTHER)];
    expect(previewRows(twice, vault).map((r) => r.duplicate)).toEqual([false, true]);
  });

  it("go into the one free login by themselves, else become logins of their own", () => {
    expect(contentsToImport(entries, rows, choices())).toEqual([
      { kind: "code", entryIdText: "datev", totp: DATEV },
      { kind: "new", content: entries[1]?.content },
      { kind: "new", content: entries[2]?.content },
      { kind: "new", content: entries[4]?.content },
    ]);
  });

  it("go where the person chose: their own login, or one of several", () => {
    const targets = new Map([
      [0, ""],
      [2, "bank-2"],
    ]);
    expect(contentsToImport(entries, rows, choices({ targets })).slice(0, 3)).toEqual([
      { kind: "new", content: entries[0]?.content },
      { kind: "new", content: entries[1]?.content },
      { kind: "code", entryIdText: "bank-2", totp: DATEV },
    ]);
  });

  it("never go into a login with another code or one not offered, even when chosen", () => {
    const targets = new Map([
      [1, "portal"],
      [4, "datev"],
    ]);
    const writes = contentsToImport(entries, rows, choices({ targets }));
    expect(writes.filter((w) => w.kind === "code")).toEqual([
      { kind: "code", entryIdText: "datev", totp: DATEV },
    ]);
  });

  it("put a duplicate taken anyway into a login of its own", () => {
    const writes = contentsToImport(entries, rows, choices({ take: new Set([3]) }));
    expect(writes[3]).toEqual({ kind: "new", content: entries[3]?.content });
  });

  it("put only the first of two codes into the same login, the second into its own", () => {
    // Not a repeat within the file: another title, the same service
    const two = [code("Sparkasse", "max"), code("SPARKASSE!", "max", OTHER)];
    const twoRows = previewRows(two, vault);
    expect(twoRows.map((r) => r.duplicate)).toEqual([false, false]);
    const targets = new Map([
      [0, "bank-1"],
      [1, "bank-1"],
    ]);
    expect(contentsToImport(two, twoRows, choices({ targets }))).toEqual([
      { kind: "code", entryIdText: "bank-1", totp: DATEV },
      { kind: "new", content: two[1]?.content },
    ]);
  });
});
