import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { forPage, listed } from "./view.ts";

beforeEach(() => setLocale("de", { reload: false }));

const login = (title: string, website: string, password: string, favorite = false): ShownEntry =>
  shown({
    idText: title,
    vaultIdText: "v",
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title,
      fields: [
        { id: "username", name: "", value: "jonas", kind: "text" },
        { id: "password", name: "", value: password, kind: "secret" },
        { id: "website", name: "", value: website, kind: "url" },
      ],
      tags: [],
      favorite,
      history: [],
    },
  });

const entries = [
  login("Großhandel Portal", "https://portal.weber-haustechnik.test/login", "Kupfer-Rohr-17", true),
  login("Bank", "https://bank.test", "Heizung-Wasser-42"),
  login("Altes Portal", "portal.weber-haustechnik.test", "Ventil-9"),
];

describe("the popup's lists", () => {
  it("shows the entries for the page's host, by title", () => {
    expect(forPage(entries, "portal.weber-haustechnik.test").map((e) => e.title)).toEqual([
      "Altes Portal",
      "Großhandel Portal",
    ]);
    expect(forPage(entries, "www.portal.weber-haustechnik.test")).toEqual([]);
    expect(forPage(entries, undefined)).toEqual([]);
  });

  it("searches titles and addresses without regard to case or accents", () => {
    expect(listed(entries, "grosshandel", false).map((e) => e.title)).toEqual([
      "Großhandel Portal",
    ]);
    expect(listed(entries, "BANK.test", false).map((e) => e.title)).toEqual(["Bank"]);
  });

  it("never finds an entry by its password", () => {
    expect(listed(entries, "Heizung-Wasser-42", false)).toEqual([]);
  });

  it("filters the favorites, with the search too", () => {
    expect(listed(entries, "", true).map((e) => e.title)).toEqual(["Großhandel Portal"]);
    expect(listed(entries, "bank", true)).toEqual([]);
    expect(listed(entries, "", false)).toHaveLength(3);
  });
});
