import type { EntryContent, ImportedEntry } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { contentsToImport, countByType, previewRows } from "./preview.ts";

// K-501: the preview shows what the file holds without a secret, marks duplicates of what the
// target vault already has and weak passwords by K-306's rule, and builds what gets written
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

const existing = [
  { title: "DATEV", username: "anna@weber-haustechnik.test", website: "https://datev.example/" },
];

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
  const rows = previewRows(entries, []);

  it("leaves out duplicates unless taken anyway", () => {
    expect(contentsToImport(entries, rows, { take: new Set(), foldersAsTags: false })).toHaveLength(
      2,
    );
    expect(
      contentsToImport(entries, rows, { take: new Set([2]), foldersAsTags: false }),
    ).toHaveLength(3);
  });

  it("adds the folders as tags when asked", () => {
    const [, wlan] = contentsToImport(entries, rows, { take: new Set(), foldersAsTags: true });
    expect(wlan?.tags).toEqual(["Büro"]);
    const [, plain] = contentsToImport(entries, rows, { take: new Set(), foldersAsTags: false });
    expect(plain?.tags).toEqual([]);
  });

  it("keeps the newest ten earlier passwords of a field, as a change does", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      fieldId: "password",
      value: `alt-${i}`,
      replacedAt: i,
    }));
    const old = login("Mail", "info", "x");
    const withHistory = { ...old, content: { ...old.content, history } };
    const [written] = contentsToImport([withHistory], previewRows([withHistory], []), {
      take: new Set(),
      foldersAsTags: false,
    });
    expect(written?.history.map((h) => h.value)).toEqual(history.slice(2).map((h) => h.value));
  });
});
