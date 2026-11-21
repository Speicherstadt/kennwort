import type { EntryContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { afterEach, describe, expect, it } from "vitest";
import { newLogin, withPassword } from "./contents.ts";

// K-404: what the save prompt writes, in the web app's shape
const HOST = "portal.weber-haustechnik.test";

afterEach(() => setLocale("de", { reload: false }));

describe("the content the save prompt writes", () => {
  it("makes a new login titled with the host, pointing at the page's origin", () => {
    setLocale("de", { reload: false });
    expect(
      newLogin({
        host: HOST,
        url: `https://${HOST}:8443/login?next=/start#top`,
        username: " jonas.weber ",
        password: "Kupfer-Rohr-17!",
      }),
    ).toEqual({
      type: "login",
      title: HOST,
      fields: [
        { id: "username", name: "Benutzername", value: "jonas.weber", kind: "text" },
        { id: "password", name: "Passwort", value: "Kupfer-Rohr-17!", kind: "secret" },
        { id: "website", name: "Website", value: `https://${HOST}:8443`, kind: "url" },
        { id: "totp", name: "Einmalcode", value: "", kind: "totp" },
      ],
      tags: [],
      favorite: false,
      history: [],
    });
  });

  it("keeps an empty website for an address it cannot read", () => {
    const login = newLogin({ host: HOST, url: "nonsense", username: "", password: "x" });
    expect(login.fields.find((f) => f.id === "website")?.value).toBe("");
  });

  const stored: EntryContent = {
    type: "login",
    title: "Großhandel Portal",
    fields: [
      { id: "username", name: "Benutzername", value: "jonas.weber", kind: "text" },
      { id: "password", name: "Passwort", value: "Kupfer-Rohr-17!", kind: "secret" },
    ],
    tags: ["Büro"],
    favorite: true,
    history: [],
  };

  it("replaces the password and puts the old one into the history", () => {
    expect(withPassword(stored, "Kupfer-Rohr-18!", 1_700_000_000_500)).toEqual({
      ...stored,
      fields: [
        stored.fields[0],
        { id: "password", name: "Passwort", value: "Kupfer-Rohr-18!", kind: "secret" },
      ],
      history: [{ fieldId: "password", value: "Kupfer-Rohr-17!", replacedAt: 1_700_000_000 }],
    });
  });

  it("gives an entry without a password field one", () => {
    const without = { ...stored, fields: [stored.fields[0] as EntryContent["fields"][number]] };
    expect(withPassword(without, "neu", 0).fields).toEqual([
      stored.fields[0],
      { id: "password", name: "Passwort", value: "neu", kind: "secret" },
    ]);
    expect(withPassword(without, "neu", 0).history).toEqual([]);
  });
});
