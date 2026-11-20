import { describe, expect, it } from "vitest";
import { type DemoEntry, entries } from "./demo.ts";
import { shownEntries, toChangeCount } from "./filter.ts";

const titles = (list: { title: string }[]) => list.map((entry) => entry.title);

describe("shownEntries", () => {
  it("filters by list and search, sorted by title", () => {
    expect(titles(shownEntries(entries, { kind: "all" }, ""))).toEqual([
      "DATEV",
      "Mail info@",
      "Sparkasse",
      "Tablet Baustelle 1",
      "WLAN Büro",
    ]);
    expect(titles(shownEntries(entries, { kind: "favorites" }, ""))).toEqual([
      "Mail info@",
      "Sparkasse",
    ]);
    expect(titles(shownEntries(entries, { kind: "to-change" }, ""))).toEqual([
      "DATEV",
      "Mail info@",
    ]);
    expect(titles(shownEntries(entries, { kind: "vault", id: "office" }, ""))).toEqual([
      "Mail info@",
      "WLAN Büro",
    ]);
    expect(titles(shownEntries(entries, { kind: "all" }, "  SPARKASSE.test "))).toEqual([
      "Sparkasse",
    ]);
    expect(titles(shownEntries(entries, { kind: "all" }, "jonas."))).toEqual(["DATEV"]);
    expect(titles(shownEntries(entries, { kind: "favorites" }, "datev"))).toEqual([]);
  });
});

describe("entries shared with this account (P-10)", () => {
  const [first, second] = entries;
  const shared = { ...(first as (typeof entries)[number]), id: "geteilt", sharedBy: "Jonas" };
  const list = [shared, second as (typeof entries)[number]];

  it("show under their own filter only, not among the vaults' entries", () => {
    expect(shownEntries(list, { kind: "shared" }, "").map((e) => e.id)).toEqual(["geteilt"]);
    for (const filter of [
      { kind: "all" },
      { kind: "favorites" },
      { kind: "to-change" },
      { kind: "vault", id: shared.vault },
    ] as const)
      expect(shownEntries(list, filter, "").map((e) => e.id)).not.toContain("geteilt");
  });
});

// K-306 part 5: „Zum Ändern“ also for a reused password; the count leaves shared entries out
describe("Zum Ändern in the list", () => {
  const [first, second, third] = entries as [DemoEntry, DemoEntry, DemoEntry];
  const list = [
    { ...first, weak: false, reused: 2 },
    { ...second, weak: false, reused: 0 },
    { ...third, weak: true, reused: 0, sharedBy: "Anna" },
  ];

  it("lists and counts reused and weak entries of the vaults", () => {
    expect(shownEntries(list, { kind: "to-change" }, "").map((e) => e.id)).toEqual([first.id]);
    expect(toChangeCount(list)).toBe(1);
    expect(toChangeCount(entries)).toBe(2);
  });

  it("finds an entry by its tags", () => {
    const tagged = [{ ...first, tags: ["Werkstatt"] }, second];
    expect(shownEntries(tagged, { kind: "all" }, "werk").map((e) => e.id)).toEqual([first.id]);
  });
});
