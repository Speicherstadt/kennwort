import { describe, expect, it } from "vitest";
import { EntryContent, mergeContent } from "./content.ts";
import { bank, withField } from "./sync.test-helpers.ts";

const now = 1_800_000_000;
const merge = (mine: EntryContent, theirs: EntryContent) => mergeContent(bank, mine, theirs, now);

describe("mergeContent", () => {
  it("takes what only one side changed", () => {
    const mine = withField(bank, "user", "anna");
    const theirs = withField(bank, "password", "neu");
    const merged = merge(mine, theirs);
    expect(merged.fields.map((f) => f.value)).toEqual(["anna", "neu", "https://sparkasse.test"]);
    expect(merged.history).toEqual([]);
  });

  it("keeps theirs where both changed a field and puts mine into the history", () => {
    const merged = merge(
      withField(bank, "password", "mine"),
      withField(bank, "password", "theirs"),
    );
    expect(merged.fields.find((f) => f.id === "password")?.value).toBe("theirs");
    expect(merged.history).toEqual([{ fieldId: "password", value: "mine", replacedAt: now }]);
  });

  it("does not record anything when both made the same change", () => {
    const same = withField(bank, "password", "same");
    expect(merge(same, same)).toEqual({ ...same, history: [] });
  });

  it("keeps an edit over a deletion on the other side", () => {
    const deleted = { ...bank, fields: bank.fields.filter((f) => f.id !== "url") };
    const edited = withField(bank, "url", "https://neu.test");
    expect(merge(deleted, edited).fields.find((f) => f.id === "url")?.value).toBe(
      "https://neu.test",
    );
    const merged = merge(edited, deleted);
    expect(merged.fields.find((f) => f.id === "url")?.value).toBe("https://neu.test");
    expect(merged.history).toEqual([]);
  });

  it("deletes a field that one side deleted and the other left alone", () => {
    const deleted = { ...bank, fields: bank.fields.filter((f) => f.id !== "url") };
    expect(merge(deleted, bank).fields.map((f) => f.id)).toEqual(["user", "password"]);
    expect(merge(bank, deleted).fields.map((f) => f.id)).toEqual(["user", "password"]);
  });

  it("adds fields both sides added", () => {
    const pin = { id: "pin", name: "PIN", value: "1234", kind: "secret" as const };
    const note = { id: "note", name: "Notiz", value: "Filiale Mitte", kind: "note" as const };
    const merged = merge(
      { ...bank, fields: [...bank.fields, pin] },
      { ...bank, fields: [...bank.fields, note] },
    );
    expect(merged.fields.map((f) => f.id)).toEqual(["user", "password", "url", "note", "pin"]);
  });

  it("merges title, type and favorite like fields; a lost title goes into the history", () => {
    expect(merge({ ...bank, title: "Mine" }, bank).title).toBe("Mine");
    expect(merge(bank, { ...bank, favorite: true }).favorite).toBe(true);
    expect(merge({ ...bank, type: "note" }, bank).type).toBe("note");
    const both = merge({ ...bank, title: "Mine" }, { ...bank, title: "Theirs" });
    expect(both.title).toBe("Theirs");
    expect(both.history).toEqual([{ fieldId: "title", value: "Mine", replacedAt: now }]);
  });

  it("adds tags from both sides and removes a tag either side removed", () => {
    const mine = { ...bank, tags: ["Bank", "Büro"] };
    const theirs = { ...bank, tags: [] };
    expect(merge(mine, theirs).tags).toEqual(["Büro"]);
    expect(merge({ ...bank, tags: ["Bank", "A"] }, { ...bank, tags: ["Bank", "B"] }).tags).toEqual([
      "A",
      "B",
      "Bank",
    ]);
  });

  it("keeps both histories once", () => {
    const old = { fieldId: "password", value: "alt", replacedAt: 1 };
    const merged = merge({ ...bank, history: [old] }, { ...bank, history: [old] });
    expect(merged.history).toEqual([old]);
  });

  it("does not put an empty lost value into the history", () => {
    const merged = merge(withField(bank, "password", ""), withField(bank, "password", "theirs"));
    expect(merged.history).toEqual([]);
  });
});

describe("EntryContent", () => {
  it("refuses an unknown type or field kind", () => {
    expect(EntryContent.safeParse({ ...bank, type: "bitcoin" }).success).toBe(false);
    expect(
      EntryContent.safeParse({ ...bank, fields: [{ ...bank.fields[0], kind: "pdf" }] }).success,
    ).toBe(false);
  });
});

describe("merging fields that differ in one property", () => {
  it("sees a change of name or kind alone", () => {
    const renamed = {
      ...bank,
      fields: bank.fields.map((f) => (f.id === "user" ? { ...f, name: "Login" } : f)),
    };
    const rekinded = {
      ...bank,
      fields: bank.fields.map((f) => (f.id === "user" ? { ...f, kind: "email" as const } : f)),
    };
    expect(mergeContent(bank, renamed, bank, now).fields[0]?.name).toBe("Login");
    expect(mergeContent(bank, rekinded, bank, now).fields[0]?.kind).toBe("email");
    expect(mergeContent(bank, bank, renamed, now).fields[0]?.name).toBe("Login");
  });

  it("does not mix up name and value split differently", () => {
    const a = { ...bank, fields: [{ id: "x", name: "ab", value: "", kind: "text" as const }] };
    const b = { ...bank, fields: [{ id: "x", name: "a", value: "b", kind: "text" as const }] };
    expect(mergeContent(a, b, a, now).fields[0]).toEqual(b.fields[0]);
  });
});

describe("EntryContent accepts every type and kind", () => {
  it.each(["login", "note", "wifi", "card", "ssh-key", "api-key", "identity"])(
    "type %s",
    (type) => {
      expect(EntryContent.safeParse({ ...bank, type }).success).toBe(true);
    },
  );

  it.each(["text", "secret", "url", "email", "totp", "note"])("kind %s", (kind) => {
    expect(EntryContent.safeParse({ ...bank, fields: [{ ...bank.fields[0], kind }] }).success).toBe(
      true,
    );
  });
});
