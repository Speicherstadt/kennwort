import { describe, expect, it } from "vitest";
import { entries } from "./demo.ts";
import { shownEntries } from "./filter.ts";

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
