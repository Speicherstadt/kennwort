import { describe, expect, it } from "vitest";
import { FIELD, loginContent, loginOf, shown } from "./entries.ts";

const names = { username: "Benutzername", password: "Passwort", website: "Website" };

// K-306 part 1: a login's content, with fixed field IDs whatever their names
describe("logins", () => {
  it("builds the content of a new login, trimmed, and reads it back", () => {
    const content = loginContent(
      {
        title: " Sparkasse ",
        username: "jonas",
        password: " a b ",
        website: " https://sparkasse.de ",
      },
      names,
    );
    expect(content).toEqual({
      type: "login",
      title: "Sparkasse",
      fields: [
        { id: FIELD.username, name: "Benutzername", value: "jonas", kind: "text" },
        { id: FIELD.password, name: "Passwort", value: " a b ", kind: "secret" },
        { id: FIELD.website, name: "Website", value: "https://sparkasse.de", kind: "url" },
      ],
      tags: [],
      favorite: false,
      history: [],
    });
    expect(loginOf(content)).toEqual({
      title: "Sparkasse",
      username: "jonas",
      password: " a b ",
      website: "https://sparkasse.de",
    });
  });

  it("keeps type, tags, favorite, history and unknown fields of the entry it changes", () => {
    const base = {
      type: "wifi" as const,
      title: "WLAN",
      fields: [{ id: "ssid", name: "SSID", value: "Büro", kind: "text" as const }],
      tags: ["Büro"],
      favorite: true,
      history: [{ fieldId: FIELD.password, value: "alt", replacedAt: 1 }],
    };
    const changed = loginContent(
      { title: "WLAN", username: "", password: "neu", website: "" },
      names,
      base,
    );
    expect(changed.type).toBe("wifi");
    expect(changed.tags).toEqual(["Büro"]);
    expect(changed.favorite).toBe(true);
    expect(changed.history).toEqual(base.history);
    expect(changed.fields.map((f) => f.id)).toEqual([
      FIELD.username,
      FIELD.password,
      FIELD.website,
      "ssid",
    ]);
  });

  it("reads missing fields as empty and shows who may change an entry", () => {
    const entry = {
      idText: "e1",
      vaultIdText: "v1",
      role: "read" as const,
      version: 3,
      content: {
        type: "note" as const,
        title: "Notiz",
        fields: [],
        tags: [],
        favorite: true,
        history: [],
      },
    };
    expect(shown(entry)).toMatchObject({
      id: "e1",
      title: "Notiz",
      username: "",
      password: "",
      website: "",
      vault: "v1",
      favorite: true,
      editable: false,
    });
    expect(shown({ ...entry, role: "edit" }).editable).toBe(true);
  });
});
