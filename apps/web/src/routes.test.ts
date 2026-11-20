import { describe, expect, it } from "vitest";
import { parseRoute, type Route, routePath } from "./routes.ts";

describe("routes", () => {
  it("reads every page from its path and writes it back", () => {
    const cases: [string, Route][] = [
      ["/entries", { page: "entries", filter: { kind: "all" } }],
      ["/entries/bank", { page: "entries", filter: { kind: "all" }, entry: "bank" }],
      ["/favorites", { page: "entries", filter: { kind: "favorites" } }],
      ["/to-change/mail", { page: "entries", filter: { kind: "to-change" }, entry: "mail" }],
      ["/vaults/b%C3%BCro", { page: "entries", filter: { kind: "vault", id: "büro" } }],
      [
        "/vaults/office/wlan",
        { page: "entries", filter: { kind: "vault", id: "office" }, entry: "wlan" },
      ],
      ["/generator", { page: "generator" }],
      ["/groups", { page: "groups" }],
      ["/settings", { page: "settings" }],
    ];
    for (const [path, route] of cases) {
      expect(parseRoute(path)).toEqual(route);
      expect(routePath(route)).toBe(path);
    }
  });

  it("starts at all entries", () => {
    expect(parseRoute("/")).toEqual({ page: "entries", filter: { kind: "all" } });
    expect(parseRoute("")).toEqual({ page: "entries", filter: { kind: "all" } });
  });

  it("knows no other path", () => {
    for (const path of [
      "/nope",
      "/entries/a/b",
      "/vaults",
      "/vaults/x/y/z",
      "/settings/x",
      "/entries/%E0",
      "/vaults/%E0",
    ])
      expect(parseRoute(path)).toEqual({ page: "not-found" });
    expect(routePath({ page: "not-found" })).toBe("/");
  });
});
