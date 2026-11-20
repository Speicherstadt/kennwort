import { setLocale } from "@kennwort/ui";
import { describe, expect, it } from "vitest";
import { FIELD, loginContent } from "./entries.test-kit.ts";
import { loginOf, shown } from "./entries.ts";

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

// K-306 part 2: every type, with the labels of the app's language
describe("shown types", () => {
  const entry = (content: Parameters<typeof shown>[0]["content"]) =>
    shown({ idText: "e2", vaultIdText: "v1", role: "edit", version: 1, content });
  const base = { tags: [], favorite: false, history: [] };

  it("labels the type's fields in the app's language and own fields by their name", () => {
    setLocale("de", { reload: false });
    const wifi = entry({
      ...base,
      type: "wifi",
      title: "Büro-WLAN",
      fields: [
        { id: "ssid", name: "Network name", value: "Weber-Buero", kind: "text" },
        { id: "password", name: "Password", value: "Rohr-2026", kind: "secret" },
        { id: "c-1", name: "Router", value: "192.168.1.1", kind: "url" },
      ],
    });
    expect(wifi.type).toBe("wifi");
    expect(wifi.fields).toEqual([
      { id: "ssid", label: "Netzwerkname", value: "Weber-Buero", kind: "text" },
      { id: "password", label: "Passwort", value: "Rohr-2026", kind: "secret" },
      { id: "c-1", label: "Router", value: "192.168.1.1", kind: "url" },
    ]);
    expect(wifi.subtitle).toBe("Weber-Buero");
  });

  it("shows under the title the first filled field that is not secret or long", () => {
    const card = entry({
      ...base,
      type: "card",
      title: "Firmenkarte",
      fields: [
        { id: "holder", name: "", value: "", kind: "text" },
        { id: "number", name: "", value: "4111 1111 1111 1111", kind: "secret" },
        { id: "c-n", name: "Notiz", value: "Tresor im Büro", kind: "note" },
        { id: "c-e", name: "Bank", value: "info@bank.test", kind: "email" },
      ],
    });
    expect(card.subtitle).toBe("info@bank.test");
    expect(entry({ ...base, type: "note", title: "Alarm", fields: [] }).subtitle).toBe("");
  });
});

// K-306 part 5: the earlier passwords and the tags an entry shows
describe("shown history and tags", () => {
  it("shows the earlier values of the secret fields there are now, newest first", () => {
    setLocale("de", { reload: false });
    const login = shown({
      idText: "e3",
      vaultIdText: "v1",
      role: "edit",
      version: 3,
      content: {
        type: "login",
        title: "Sparkasse",
        fields: [
          { id: "username", name: "", value: "weber", kind: "text" },
          { id: "password", name: "", value: "neu", kind: "secret" },
          { id: "c-pin", name: "PIN", value: "9876", kind: "secret" },
          { id: "totp", name: "", value: "JBSWY3DP", kind: "totp" },
        ],
        tags: ["Bank"],
        favorite: true,
        history: [
          { fieldId: "password", value: "alt-1", replacedAt: 10 },
          { fieldId: "c-pin", value: "1234", replacedAt: 30 },
          { fieldId: "password", value: "alt-2", replacedAt: 20 },
          // Kept by the merge, but no earlier password: a title, a username, a TOTP key, a
          // field that is gone
          { fieldId: "title", value: "Spk", replacedAt: 40 },
          { fieldId: "username", value: "anna", replacedAt: 40 },
          { fieldId: "totp", value: "OLDKEY", replacedAt: 40 },
          { fieldId: "c-gone", value: "x", replacedAt: 40 },
        ],
      },
    });
    expect(login.history).toEqual([
      { fieldId: "c-pin", label: "PIN", value: "1234", replacedAt: 30 },
      { fieldId: "password", label: "Passwort", value: "alt-2", replacedAt: 20 },
      { fieldId: "password", label: "Passwort", value: "alt-1", replacedAt: 10 },
    ]);
    expect(login.tags).toEqual(["Bank"]);
    expect(login.favorite).toBe(true);
    expect([login.weak, login.reused]).toEqual([false, 0]);
  });
});
