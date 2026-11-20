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
