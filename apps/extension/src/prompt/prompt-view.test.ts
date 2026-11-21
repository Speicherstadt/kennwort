import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { describe, expect, it } from "vitest";
import type { Capture } from "../save/messages.ts";
import { promptView, type ViewInput } from "./prompt-view.ts";

// K-404: what the save prompt shows for a submitted login
const HOST = "portal.weber-haustechnik.test";
const vault = (idText: string, role: Vault["role"], rotationDue = false, name?: string) =>
  ({ idText, name, role, log: { rotationDue } }) as unknown as Vault;
const entry = (vaultIdText: string, password: string): ShownEntry =>
  shown({
    idText: "portal",
    vaultIdText,
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: "Großhandel Portal",
      fields: [
        { id: "username", name: "", value: "jonas.weber", kind: "text" },
        { id: "password", name: "", value: password, kind: "secret" },
        { id: "website", name: "", value: `https://${HOST}`, kind: "url" },
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  });
const capture: Capture = {
  host: HOST,
  url: `https://${HOST}/login`,
  username: "jonas.weber",
  password: "Kupfer-Rohr-18!",
};
const input = (extra: Partial<ViewInput> = {}): ViewInput => ({
  phase: "open",
  load: "ready",
  entries: [],
  vaults: [
    vault("buero", "edit", false, "Büro"),
    vault("kunden", "read"),
    vault("bau", "manage", true),
  ],
  neverSave: [],
  capture,
  ...extra,
});

describe("what the save prompt shows", () => {
  it("offers to unlock while locked or not connected, and waits while loading", () => {
    expect(promptView(input({ phase: "locked" }))).toEqual({ kind: "locked" });
    expect(promptView(input({ phase: "connect" }))).toEqual({ kind: "locked" });
    expect(promptView(input({ phase: "starting" }))).toEqual({ kind: "waiting" });
    expect(promptView(input({ load: "loading" }))).toEqual({ kind: "waiting" });
  });

  it("offers a new login only into vaults it may write", () => {
    expect(promptView(input())).toEqual({
      kind: "new",
      vaults: [{ idText: "buero", name: "Büro" }],
    });
    expect(
      promptView(input({ vaults: [vault("kunden", "read"), vault("bau", "edit", true)] })),
    ).toEqual({ kind: "no-vault" });
  });

  it("offers an update for a changed password, unless the vault takes no write", () => {
    const changed = entry("buero", "Kupfer-Rohr-17!");
    expect(promptView(input({ entries: [changed] }))).toEqual({ kind: "changed", entry: changed });
    expect(promptView(input({ entries: [entry("kunden", "alt")] }))).toEqual({
      kind: "read-only",
    });
    expect(promptView(input({ entries: [entry("bau", "alt")] }))).toEqual({ kind: "rotation-due" });
    expect(promptView(input({ entries: [entry("weg", "alt")] }))).toEqual({ kind: "read-only" });
  });

  it("closes for the same login and for a site on the never list", () => {
    expect(promptView(input({ entries: [entry("buero", "Kupfer-Rohr-18!")] }))).toEqual({
      kind: "close",
    });
    expect(promptView(input({ neverSave: ["other.test", HOST] }))).toEqual({ kind: "close" });
    // The never list counts even when the entries could not load
    expect(promptView(input({ neverSave: [HOST], load: "failed" }))).toEqual({ kind: "close" });
  });

  it("says when the entries could not load or were not trusted", () => {
    expect(promptView(input({ load: "failed" }))).toEqual({ kind: "failed" });
    expect(promptView(input({ load: "untrusted" }))).toEqual({ kind: "failed" });
  });
});
