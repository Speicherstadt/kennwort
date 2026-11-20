import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { contentOf, inputOf, newInput, withType } from "./entry-input.ts";

beforeEach(() => setLocale("de", { reload: false }));

describe("review: entry input", () => {
  it("keeps a stored field without a name when an entry is saved unchanged", () => {
    // Field.name is z.string(): an empty name is valid content another app or an import may write
    const stored: EntryContent = {
      type: "login",
      title: "Router",
      fields: [
        { id: "username", name: "Username", value: "admin", kind: "text" },
        { id: "x-1", name: "", value: "Seriennummer 4711", kind: "text" },
      ],
      tags: [],
      favorite: false,
      history: [],
    };
    const saved = contentOf(inputOf(stored), stored);
    expect(saved.fields.map((f) => [f.id, f.value])).toContainEqual(["x-1", "Seriennummer 4711"]);
  });

  it("does not duplicate a field when a new entry's type changes there and back", () => {
    const login = newInput("login");
    const typed = {
      ...login,
      title: "Router",
      fields: login.fields.map((f) => (f.id === "website" ? { ...f, value: "https://r.lan" } : f)),
    };
    const back = withType(withType(typed, "wifi"), "login");
    const ids = back.fields.map((f) => f.id);
    expect(ids).toEqual([...new Set(ids)]);
    const saved = contentOf(back).fields.map((f) => f.id);
    expect(saved).toEqual([...new Set(saved)]);
  });

  it("keeps the kind another app stored for a field with a template ID", () => {
    const stored: EntryContent = {
      type: "login",
      title: "Shop",
      fields: [{ id: "username", name: "Username", value: "jonas@weber.de", kind: "email" }],
      tags: [],
      favorite: false,
      history: [],
    };
    const saved = contentOf(inputOf(stored), stored);
    expect(saved.fields.find((f) => f.id === "username")?.kind).toBe("email");
  });
});
