import { describe, expect, it } from "vitest";
import { custom, expiry, hostOf, imported, joinFilled, joinLines, known, login } from "./entry.ts";
import { compact } from "./test/helpers.ts";

const one = (entry: ReturnType<typeof imported>) => compact({ ok: true, value: [entry] });

describe("building imported entries (K-502)", () => {
  it("gives own fields counted IDs and a taken ID a suffix, and drops empty fields", () => {
    const entry = imported({
      type: "login",
      title: "  T  ",
      fields: [
        known("website", "a"),
        custom("Eigen", "x"),
        known("website", "b"),
        custom("Leer", " "),
        known("website", "c"),
        custom("Zwei", "y", "secret"),
        { id: "field-1", name: "Fremd", value: "z", kind: "text" },
      ],
    });
    expect(one(entry)).toEqual([
      {
        type: "login",
        title: "T",
        fields: [
          ["website", "Website", "a", "url"],
          ["field-1", "Eigen", "x", "text"],
          ["website-2", "Website", "b", "url"],
          ["website-3", "Website", "c", "url"],
          ["field-2", "Zwei", "y", "secret"],
          ["field-1-2", "Fremd", "z", "text"],
        ],
      },
    ]);
  });

  it("writes every line break as LF and puts notes last", () => {
    const entry = imported({
      type: "note",
      title: "N",
      fields: [custom("A", "1\r\n2\r3")],
      notes: "x\r\ny",
    });
    expect(one(entry)).toEqual([
      {
        type: "note",
        title: "N",
        fields: [
          ["field-1", "A", "1\n2\n3", "text"],
          ["note", "Notes", "x\ny", "note"],
        ],
      },
    ]);
  });

  it("trims and sorts tags, trims folders, drops empty and repeated ones", () => {
    const entry = imported({
      type: "note",
      title: "",
      fields: [],
      tags: [" b", "a", "b", " ", "Ä"],
      folders: [" Büro ", "", "Büro", "Lager"],
      favorite: true,
    });
    expect(entry.content.tags).toEqual(["a", "Ä", "b"]);
    expect(entry.folders).toEqual(["Büro", "Lager"]);
    expect(entry.content.favorite).toBe(true);
    expect(entry.content.history).toEqual([]);
  });

  it("makes a login of only notes a note and takes a title from the link or the username", () => {
    expect(one(login({ title: "", notes: "nur Text" }))).toEqual([
      { type: "note", title: "", fields: [["note", "Notes", "nur Text", "note"]] },
    ]);
    expect(one(login({ title: "", username: "anna", urls: [" https://a.example/x "] }))).toEqual([
      {
        type: "login",
        title: "a.example",
        fields: [
          ["username", "Username", "anna", "text"],
          ["website", "Website", "https://a.example/x", "url"],
        ],
      },
    ]);
    expect(one(login({ title: " ", username: "anna", urls: ["kein Link"] }))[0]).toMatchObject({
      title: "anna",
    });
    expect(one(login({ title: "" }))).toEqual([{ type: "login", title: "", fields: [] }]);
    expect(one(login({ title: "", totp: "S", notes: "n" }))[0]).toMatchObject({ type: "login" });
  });

  it("reads the host of a link, nothing from what is none", () => {
    expect([hostOf("https://Shop.Example:8443/a"), hostOf("shop.example"), hostOf("")]).toEqual([
      "shop.example",
      "",
      "",
    ]);
  });

  it("writes an expiry as MM/YYYY or as much as there is", () => {
    expect([
      expiry("8", "2028"),
      expiry(" 12 ", " 2027 "),
      expiry("", "2028"),
      expiry("8", ""),
    ]).toEqual(["08/2028", "12/2027", "2028", "8"]);
  });

  it("joins the filled parts", () => {
    expect(joinFilled(" ", [" a ", "", " ", "b"])).toBe("a b");
    expect(joinLines("a", " ", "b ")).toBe("a\nb");
  });
});
