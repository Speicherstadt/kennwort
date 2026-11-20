import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { contentOf, inputOf, newInput, withType } from "./entry-input.ts";

// K-306 part 2: every type with its fields, and fields of the owner's own
beforeEach(() => setLocale("de", { reload: false }));

const wifi: EntryContent = {
  type: "wifi",
  title: "Büro-WLAN",
  fields: [
    { id: "ssid", name: "Network name", value: "Weber-Buero", kind: "text" },
    { id: "password", name: "Password", value: "Rohr-2026", kind: "secret" },
    { id: "security", name: "Security", value: "WPA3", kind: "text" },
    { id: "c-router", name: "Router", value: "192.168.1.1", kind: "url" },
    // A field another app wrote, with a kind this app shows as it is
    { id: "x-totp", name: "Einmalcode", value: "otpauth://totp/x", kind: "totp" },
  ],
  tags: ["Büro"],
  favorite: true,
  history: [{ fieldId: "password", value: "alt", replacedAt: 5 }],
};

describe("entry input", () => {
  it("starts a new entry with the fields of its type, empty, labelled in the app's language", () => {
    expect(newInput("card")).toEqual({
      type: "card",
      title: "",
      fields: [
        { id: "holder", name: "Karteninhaber", value: "", kind: "text", own: false },
        { id: "number", name: "Kartennummer", value: "", kind: "secret", own: false },
        { id: "expiry", name: "Gültig bis", value: "", kind: "text", own: false },
        { id: "cvc", name: "Prüfnummer", value: "", kind: "secret", own: false },
        { id: "pin", name: "PIN", value: "", kind: "secret", own: false },
      ],
    });
    expect(newInput("note").fields).toEqual([
      { id: "note", name: "Notiz", value: "", kind: "note", own: false },
    ]);
  });

  it("reads a stored entry: the type's fields first, in its order, then the owner's own", () => {
    expect(inputOf(wifi)).toEqual({
      type: "wifi",
      title: "Büro-WLAN",
      fields: [
        { id: "ssid", name: "Netzwerkname", value: "Weber-Buero", kind: "text", own: false },
        { id: "password", name: "Passwort", value: "Rohr-2026", kind: "secret", own: false },
        { id: "security", name: "Sicherheit", value: "WPA3", kind: "text", own: false },
        { id: "c-router", name: "Router", value: "192.168.1.1", kind: "url", own: true },
        { id: "x-totp", name: "Einmalcode", value: "otpauth://totp/x", kind: "totp", own: true },
      ],
    });
  });

  it("gives a stored entry the type's fields it lacks, empty", () => {
    const bare: EntryContent = { ...wifi, fields: [wifi.fields[1] as never] };
    expect(inputOf(bare).fields.map((f) => [f.id, f.value])).toEqual([
      ["ssid", ""],
      ["password", "Rohr-2026"],
      ["security", ""],
    ]);
  });

  it("writes the content back with the shown names, trimmed title, URLs and e-mails", () => {
    const input = inputOf(wifi);
    const changed = {
      ...input,
      title: "  Büro-WLAN 2 ",
      fields: input.fields.map((f) =>
        f.id === "c-router" ? { ...f, value: " https://router.lan " } : f,
      ),
    };
    expect(contentOf(changed, wifi)).toEqual({
      ...wifi,
      title: "Büro-WLAN 2",
      fields: [
        { id: "ssid", name: "Netzwerkname", value: "Weber-Buero", kind: "text" },
        { id: "password", name: "Passwort", value: "Rohr-2026", kind: "secret" },
        { id: "security", name: "Sicherheit", value: "WPA3", kind: "text" },
        { id: "c-router", name: "Router", value: "https://router.lan", kind: "url" },
        { id: "x-totp", name: "Einmalcode", value: "otpauth://totp/x", kind: "totp" },
      ],
    });
  });

  it("keeps tags, favorite and history of the stored entry, and starts a new one without", () => {
    const fresh = contentOf({ ...newInput("note"), title: "Alarmcode" });
    expect(fresh).toEqual({
      type: "note",
      title: "Alarmcode",
      fields: [{ id: "note", name: "Notiz", value: "", kind: "note" }],
      tags: [],
      favorite: false,
      history: [],
    });
    expect(contentOf(inputOf(wifi), wifi)).toMatchObject({
      tags: ["Büro"],
      favorite: true,
      history: wifi.history,
    });
  });

  it("drops an own field the owner removed, and one added without a name", () => {
    const input = inputOf(wifi);
    const fields = [
      ...input.fields.filter((f) => f.id !== "c-router"),
      { id: "c-new", name: "  ", value: "x", kind: "text" as const, own: true, added: true },
    ];
    expect(contentOf({ ...input, fields }, wifi).fields.map((f) => f.id)).toEqual([
      "ssid",
      "password",
      "security",
      "x-totp",
    ]);
  });

  it("changes the type of a new entry: the new type's fields, own fields and the title stay", () => {
    const started = {
      ...newInput("login"),
      title: "Router",
      fields: [
        ...newInput("login").fields.map((f) =>
          f.id === "password"
            ? { ...f, value: "pw" }
            : f.id === "website"
              ? { ...f, value: "https://r.lan" }
              : f,
        ),
        { id: "c-1", name: "Seriennummer", value: "123", kind: "text" as const, own: true },
      ],
    };
    expect(withType(started, "wifi")).toEqual({
      type: "wifi",
      title: "Router",
      fields: [
        { id: "ssid", name: "Netzwerkname", value: "", kind: "text", own: false },
        // Same ID in both types: the value goes along
        { id: "password", name: "Passwort", value: "pw", kind: "secret", own: false },
        { id: "security", name: "Sicherheit", value: "", kind: "text", own: false },
        // A filled field the new type lacks becomes an own one; an empty one (username) goes
        { id: "website", name: "Website", value: "https://r.lan", kind: "url", own: true },
        { id: "c-1", name: "Seriennummer", value: "123", kind: "text", own: true },
      ],
    });
  });
});
