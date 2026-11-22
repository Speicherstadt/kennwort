import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import type { Warning } from "../alert/messages.ts";
import { alertView, changePasswordUrl } from "./alert-view.ts";

// K-405: what the warning shows, decided from the decrypted entries the worker named
const entry = (idText: string, ...urls: string[]): ShownEntry =>
  shown({
    idText,
    vaultIdText: "buero",
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: "Großhandel Portal",
      fields: [
        { id: "password", name: "", value: "Kupfer-Rohr-18!", kind: "secret" },
        ...urls.map((value, i) => ({ id: `u${i}`, name: "", value, kind: "url" as const })),
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  });
const warning: Warning = {
  host: "portal-weber-haustechnik.test",
  url: "https://portal-weber-haustechnik.test/login",
  entries: ["portal"],
};
const portal = entry("portal", "https://portal.weber-haustechnik.test/login");

describe("alertView", () => {
  it("waits for the entries, and closes when they could not load", () => {
    expect(alertView({ load: "loading", entries: [], warning })).toEqual({ kind: "waiting" });
    expect(alertView({ load: "failed", entries: [portal], warning })).toEqual({ kind: "close" });
    expect(alertView({ load: "untrusted", entries: [portal], warning })).toEqual({ kind: "close" });
  });

  it("names the entry and the site its password belongs to", () => {
    expect(
      alertView({ load: "ready", entries: [entry("other", "https://x.test"), portal], warning }),
    ).toEqual({
      kind: "warn",
      entry: portal,
      site: "portal.weber-haustechnik.test",
      secure: true,
    });
    const plain = entry("portal", "http://router.weber-haustechnik.test");
    expect(alertView({ load: "ready", entries: [plain], warning })).toMatchObject({
      site: "router.weber-haustechnik.test",
      secure: false,
    });
  });

  it("closes when no named entry is left, or one of them is for this very host", () => {
    expect(
      alertView({ load: "ready", entries: [entry("other", "https://x.test")], warning }),
    ).toEqual({
      kind: "close",
    });
    const both = entry(
      "portal",
      "https://portal.weber-haustechnik.test",
      "https://portal-weber-haustechnik.test",
    );
    expect(alertView({ load: "ready", entries: [both], warning })).toEqual({ kind: "close" });
    expect(alertView({ load: "ready", entries: [entry("portal")], warning })).toEqual({
      kind: "close",
    });
  });
});

describe("changePasswordUrl", () => {
  it("is the site's well-known address for changing a password", () => {
    expect(changePasswordUrl("portal.weber-haustechnik.test", true)).toBe(
      "https://portal.weber-haustechnik.test/.well-known/change-password",
    );
    expect(changePasswordUrl("router.test", false)).toBe(
      "http://router.test/.well-known/change-password",
    );
  });
});
