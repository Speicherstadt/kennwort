import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import { markToChange } from "../entries/to-change.ts";
import { leakedByEntry, overviewOf, passwordsToCheck, reportOf } from "./overview.ts";

// K-603: the security overview's lists and the monthly report, from the marked entries
const login = (id: string, vault: string, password: string, extra: Partial<ShownEntry> = {}) => ({
  ...shown({
    idText: id,
    vaultIdText: vault,
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: id,
      fields: [{ id: "password", name: "", value: password, kind: "secret" }],
      tags: [],
      favorite: false,
      history: [],
    },
  }),
  ...extra,
});

const shared = "Heizung-Wasser-Licht-42";
const entries = markToChange([
  login("Sparkasse", "buero", "Kessel-Pumpe-Rohr-7!"),
  login("Router", "technik", shared),
  login("NAS", "technik", shared),
  login("Mail info@", "buero", "sommer2019"),
  login("DATEV", "buero", "Ventil-Flansch-Muffe-3", {
    marks: [{ account: "max", at: 1, fields: ["Passwort"] }],
  }),
  login("Geteilt", "fremd", "Hallo123", { sharedBy: "Anna" }),
]);
const ids = (list: ShownEntry[]) => list.map((entry) => entry.id);

describe("overviewOf", () => {
  it("lists weak, reused, leaked and marked entries by title, without shared ones", () => {
    const leaked = new Map([["Sparkasse", 3]]);
    const overview = overviewOf(entries, leaked);
    expect(ids(overview.weak)).toEqual(["Mail info@"]);
    expect(ids(overview.reused)).toEqual(["NAS", "Router"]);
    expect(ids(overview.leaked)).toEqual(["Sparkasse"]);
    expect(ids(overview.marked)).toEqual(["DATEV"]);
  });

  it("lists nothing leaked before a check", () => {
    expect(overviewOf(entries, new Map()).leaked).toEqual([]);
  });
});

describe("leakedByEntry and passwordsToCheck", () => {
  it("checks the account's own entries only, never a shared one's", () => {
    expect(passwordsToCheck(entries).sort()).toEqual(
      ["Kessel-Pumpe-Rohr-7!", shared, shared, "sommer2019", "Ventil-Flansch-Muffe-3"].sort(),
    );
  });

  it("names each entry whose password leaked with its count, not a shared one", () => {
    const counts = new Map([
      ["sommer2019", 412],
      [shared, 2],
      ["Hallo123", 77],
    ]);
    expect([...leakedByEntry(entries, counts)].sort()).toEqual([
      ["Mail info@", 412],
      ["NAS", 2],
      ["Router", 2],
    ]);
  });

  it("takes the highest count when an entry has two checked passwords", () => {
    const wifi = {
      ...login("WLAN", "buero", "a"),
      fields: [
        { id: "password", label: "", value: "a", kind: "secret" as const },
        { id: "passphrase", label: "", value: "b", kind: "secret" as const },
      ],
    };
    const counts = new Map([
      ["a", 2],
      ["b", 9],
    ]);
    expect(leakedByEntry([wifi], counts).get("WLAN")).toBe(9);
  });
});

describe("reportOf", () => {
  const names: Record<string, string> = { buero: "Büro", technik: "Technik" };
  const name = (id: string) => names[id] ?? id;

  it("counts per vault, sorted by name, with no title in it", () => {
    const report = reportOf(entries, new Map([["Sparkasse", 3]]), name);
    expect(report).toEqual([
      { vault: "buero", name: "Büro", entries: 3, weak: 1, reused: 0, leaked: 1, marked: 1 },
      { vault: "technik", name: "Technik", entries: 2, weak: 0, reused: 2, leaked: 0, marked: 0 },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/Sparkasse|Router|Mail|DATEV|sommer/);
  });

  it("leaves leaked open while the check is off", () => {
    expect(reportOf(entries, undefined, name).map((row) => row.leaked)).toEqual([
      undefined,
      undefined,
    ]);
  });
});
