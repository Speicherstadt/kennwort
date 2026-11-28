import { NOTIFICATION_KINDS, type Notification } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { kindLabels, notificationText } from "./notification-text.ts";

// K-602: what a notification says, with the names this device knows, and where it leads
const note = (over: Partial<Notification>): Notification => ({
  id: "n1",
  kind: "access-requested",
  subject: "buero",
  actor: "anna",
  createdAt: 1,
  read: false,
  ...over,
});
const names = {
  person: (id: string) => ({ anna: "Anna", jonas: "Jonas" })[id],
  vault: (id: string) => ({ buero: "Büro" })[id],
};

beforeEach(() => setLocale("de", { reload: false }));

describe("notificationText", () => {
  it("names the person and the vault this device knows", () => {
    expect(notificationText(note({}), names)).toEqual({
      text: "Anna bittet um Zugriff auf Büro.",
      href: "/vaults",
    });
    expect(notificationText(note({ kind: "vault-added", actor: "jonas" }), names)).toEqual({
      text: "Jonas hat dich in Büro aufgenommen.",
      href: "/vaults/buero",
    });
  });

  it("names no one it does not know, whatever ID the server sends", () => {
    const shown = notificationText(note({ actor: "max", subject: "Tresor des Servers" }), names);
    expect(shown.text).toBe("Jemand bittet um Zugriff auf einen Tresor.");
    expect(notificationText(note({ actor: null, subject: null }), names).text).toBe(
      "Jemand bittet um Zugriff auf einen Tresor.",
    );
  });

  it("leads each kind to the page where the person checks it", () => {
    const hrefs = Object.fromEntries(
      NOTIFICATION_KINDS.map((kind) => [kind, notificationText(note({ kind }), names).href]),
    );
    expect(hrefs).toEqual({
      "access-requested": "/vaults",
      "vault-added": "/vaults/buero",
      "share-received": "/shared",
      "invitation-accepted": "/members",
      "member-renewed": "/members",
      "root-changed": "/members",
      "emergency-requested": "/emergency",
      "emergency-answered": "/emergency",
      "emergency-granted": "/emergency",
      "account-recovered": "/settings",
      "link-opened": "/links",
      "security-report": "/security",
      "member-enrolled": "/members",
      "update-available": "/notifications",
    });
    expect(notificationText(note({ kind: "vault-added", subject: null }), names).href).toBe(
      "/vaults",
    );
    expect(notificationText(note({ kind: "vault-added", subject: "a/b" }), names).href).toBe(
      "/vaults/a%2Fb",
    );
  });

  it("has a text in German and English for every kind, and a label for the settings", () => {
    for (const locale of ["de", "en"] as const) {
      setLocale(locale, { reload: false });
      for (const kind of NOTIFICATION_KINDS) {
        expect(notificationText(note({ kind }), names).text.length).toBeGreaterThan(10);
        expect(kindLabels[kind]().length).toBeGreaterThan(3);
      }
    }
    expect(notificationText(note({}), names).text).toBe("Anna asks for access to Büro.");
  });
});
