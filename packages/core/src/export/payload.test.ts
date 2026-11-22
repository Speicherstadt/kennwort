import { describe, expect, it } from "vitest";
import { ExportPayload, exportVaults } from "./payload.ts";
import { BUERO } from "./test/weber.ts";

describe("exportVaults", () => {
  it("keeps every field, the history, tags and favorites, and drops the change marks", () => {
    const [entry] = BUERO.entries;
    const marked = { ...entry, toChange: [{ account: "AAAA", at: 1, fields: ["password"] }] };
    const [vault] = exportVaults([{ name: "Büro", entries: [marked as never] }]);
    expect(vault).toEqual({ name: "Büro", entries: [entry] });
    expect(vault?.entries[0]).not.toHaveProperty("toChange");
  });

  it("refuses content that is no entry", () => {
    expect(() => exportVaults([{ name: "x", entries: [{ title: "kaputt" } as never] }])).toThrow();
  });
});

describe("ExportPayload", () => {
  it("is version 1 with the time and the vaults", () => {
    const payload = { version: 1, exportedAt: 5, vaults: [BUERO] };
    expect(ExportPayload.parse(payload)).toEqual(payload);
    expect(ExportPayload.safeParse({ ...payload, version: 2 }).success).toBe(false);
    expect(ExportPayload.safeParse({ ...payload, exportedAt: -1 }).success).toBe(false);
    expect(ExportPayload.safeParse({ ...payload, exportedAt: 1.5 }).success).toBe(false);
  });
});
