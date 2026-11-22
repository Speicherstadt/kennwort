import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import { describe, expect, it } from "vitest";
import {
  type AlertList,
  alertListOf,
  alertSources,
  matchesOf,
  recordOf,
  reusableRecords,
  sameSite,
} from "./alert-list.ts";
import { fromHex, hex } from "./hex.ts";

// K-405: the alert list the extension keeps while unlocked: per saved password a short tag and the
// tags of its exact hosts, nothing in plain text
const login = (idText: string, password: string, ...urls: string[]): StoredEntry => ({
  idText,
  vaultIdText: "buero",
  role: "edit",
  version: 3,
  content: {
    type: "login",
    title: "Großhandel Portal",
    fields: [
      { id: "username", name: "", value: "jonas.weber", kind: "text" },
      { id: "password", name: "", value: password, kind: "secret" },
      ...urls.map((value, i) => ({ id: `url${i}`, name: "", value, kind: "url" as const })),
    ],
    tags: [],
    favorite: false,
    history: [],
  },
});

// Stand-ins for F-10, so these tests stay fast; packages/crypto tests the real ones
const hashers = {
  tag: (password: string, salt: Uint8Array) =>
    Uint8Array.from([password.length, salt[0] ?? 0, 0xab, password.charCodeAt(0)]),
  hostTag: (host: string, salt: Uint8Array) => new TextEncoder().encode(`${salt[0]}:${host}`),
};

describe("alertSources", () => {
  it("takes every entry with a password and a web address, with its exact hosts once", () => {
    const entries = [
      login(
        "portal",
        "Kupfer-Rohr-18!",
        "https://portal.weber-haustechnik.test/login",
        "PORTAL.weber-haustechnik.test",
      ),
      login("wlan", "Funk-Netz-1!"),
      login("leer", "", "https://shop.test/"),
    ];
    expect(alertSources(entries)).toEqual([
      {
        id: "portal",
        version: 3,
        password: "Kupfer-Rohr-18!",
        hosts: ["portal.weber-haustechnik.test"],
      },
    ]);
  });
});

describe("records", () => {
  const salt = new Uint8Array(16).fill(7);
  const source = { id: "portal", version: 3, password: "Kupfer", hosts: ["portal.test", "p.test"] };

  it("keeps only tags: no password and no host in plain text", () => {
    const record = recordOf(source, salt, hashers);
    expect(record).toEqual({
      id: "portal",
      version: 3,
      tag: "0607ab4b",
      hosts: [hex(hashers.hostTag("portal.test", salt)), hex(hashers.hostTag("p.test", salt))],
    });
    expect(JSON.stringify(record)).not.toMatch(/Kupfer|portal\.test/);
  });

  it("finds the records of a tag and whether one of them is for the host", () => {
    const list: AlertList = {
      salt: hex(salt),
      records: [
        recordOf(source, salt, hashers),
        { id: "x", version: 1, tag: "ffffffff", hosts: [] },
      ],
    };
    expect(matchesOf(list, "0607ab4b").map((r) => r.id)).toEqual(["portal"]);
    expect(matchesOf(list, "00000000")).toEqual([]);
    const records = matchesOf(list, "0607ab4b");
    expect(sameSite(records, hex(hashers.hostTag("p.test", salt)))).toBe(true);
    expect(sameSite(records, hex(hashers.hostTag("portal-test.test", salt)))).toBe(false);
  });

  it("reuses a record only under the same salt and for the same version of the entry", () => {
    const list: AlertList = { salt: hex(salt), records: [recordOf(source, salt, hashers)] };
    expect(reusableRecords(list, hex(salt)).get("portal/3")).toEqual(list.records[0]);
    expect(reusableRecords(list, hex(salt)).get("portal/4")).toBeUndefined();
    expect(reusableRecords(list, "00".repeat(16)).size).toBe(0);
    expect(reusableRecords(undefined, hex(salt)).size).toBe(0);
  });
});

describe("alertListOf", () => {
  const good = {
    salt: "0".repeat(32),
    records: [{ id: "portal", version: 3, tag: "0607ab4b", hosts: ["a".repeat(32)] }],
  };

  it("reads a list of the stored shape", () => {
    expect(alertListOf(good)).toEqual(good);
  });

  it("refuses anything else", () => {
    for (const bad of [
      undefined,
      "list",
      { ...good, salt: "zz" },
      { ...good, records: "none" },
      { ...good, records: [{ ...good.records[0], tag: "Kupfer-Rohr" }] },
      { ...good, records: [{ ...good.records[0], hosts: ["portal.test"] }] },
      { ...good, records: [{ ...good.records[0], version: "3" }] },
      { ...good, records: [{ ...good.records[0], id: 3 }] },
      { ...good, records: [null] },
    ])
      expect(alertListOf(bad)).toBeUndefined();
  });
});

describe("hex", () => {
  it("goes there and back", () => {
    expect(hex(Uint8Array.from([0, 15, 255]))).toBe("000fff");
    expect(Array.from(fromHex("000fff"))).toEqual([0, 15, 255]);
  });
});
