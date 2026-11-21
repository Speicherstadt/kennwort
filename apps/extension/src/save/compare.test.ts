import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import { offerFor } from "./compare.ts";
import type { Capture } from "./messages.ts";

// K-404: a submitted login is new, a changed password or the same as an entry for the exact host
const HOST = "portal.weber-haustechnik.test";
const entry = (id: string, username: string, password: string, website: string): ShownEntry =>
  shown({
    idText: id,
    vaultIdText: "buero",
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: id,
      fields: [
        { id: "username", name: "", value: username, kind: "text" },
        { id: "password", name: "", value: password, kind: "secret" },
        { id: "website", name: "", value: website, kind: "url" },
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  });
const portal = entry("portal", "jonas.weber", "Kupfer-Rohr-17!", `https://${HOST}/login`);
const anna = entry("anna", "anna", "Ventil-9!", `https://${HOST}`);
const parent = entry("parent", "jonas.weber", "Andere-1!", "https://weber-haustechnik.test");
const capture = (extra: Partial<Capture> = {}): Capture => ({
  host: HOST,
  url: `https://${HOST}/login`,
  username: "jonas.weber",
  password: "Kupfer-Rohr-17!",
  ...extra,
});

describe("what a submitted login offers", () => {
  it("offers nothing for the same user name and password on the exact host", () => {
    expect(offerFor([portal, anna], capture())).toEqual({ kind: "same" });
    // User names compare without case and surrounding spaces
    expect(offerFor([portal], capture({ username: " Jonas.Weber " }))).toEqual({ kind: "same" });
  });

  it("offers an update for the same user name with another password", () => {
    expect(offerFor([portal, anna], capture({ password: "Kupfer-Rohr-18!" }))).toEqual({
      kind: "changed",
      entry: portal,
    });
  });

  it("offers a new login for another user name or another host", () => {
    expect(offerFor([portal], capture({ username: "sandra" }))).toEqual({ kind: "new" });
    // An entry for the parent domain is not one for this host
    expect(offerFor([parent], capture())).toEqual({ kind: "new" });
    expect(offerFor([], capture())).toEqual({ kind: "new" });
  });

  it("finds the entry of a change-password form without user name by the current password", () => {
    const change = capture({
      username: "",
      password: "Kupfer-Rohr-18!",
      previous: "Kupfer-Rohr-17!",
    });
    expect(offerFor([anna, portal], change)).toEqual({ kind: "changed", entry: portal });
    // The new password is already stored: nothing to do
    expect(offerFor([portal], capture({ username: "", previous: "alt" }))).toEqual({
      kind: "same",
    });
    // Without a user name and no entry with the current password: a new login
    expect(offerFor([portal], capture({ username: "", password: "neu" }))).toEqual({ kind: "new" });
  });

  it("among several entries of the user name prefers the one with the current password, then one it may edit", () => {
    const readOnly = { ...portal, id: "ro", password: "x", editable: false };
    const editable = { ...portal, id: "rw", password: "y" };
    const withOld = { ...portal, id: "old", password: "alt" };
    expect(
      offerFor([readOnly, editable, withOld], capture({ password: "neu", previous: "alt" })),
    ).toEqual({ kind: "changed", entry: withOld });
    expect(offerFor([readOnly, editable], capture({ password: "neu" }))).toEqual({
      kind: "changed",
      entry: editable,
    });
    expect(offerFor([readOnly], capture({ password: "neu" }))).toEqual({
      kind: "changed",
      entry: readOnly,
    });
  });
});
