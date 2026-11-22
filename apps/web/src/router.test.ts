import { createMemoryHistory } from "@tanstack/solid-router";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "./router.ts";
import { type Route, routePath } from "./routes.ts";

const { routeAt: parseRoute } = createAppRouter(createMemoryHistory());

describe("routes", () => {
  it("reads every page from its path and writes it back", () => {
    const cases: [string, Route][] = [
      ["/entries", { page: "entries", filter: { kind: "all" } }],
      ["/entries/bank", { page: "entries", filter: { kind: "all" }, entry: "bank" }],
      ["/favorites", { page: "entries", filter: { kind: "favorites" } }],
      ["/to-change/mail", { page: "entries", filter: { kind: "to-change" }, entry: "mail" }],
      ["/shared", { page: "entries", filter: { kind: "shared" } }],
      ["/shared/bank", { page: "entries", filter: { kind: "shared" }, entry: "bank" }],
      ["/vaults/b%C3%BCro", { page: "entries", filter: { kind: "vault", id: "büro" } }],
      [
        "/vaults/office/wlan",
        { page: "entries", filter: { kind: "vault", id: "office" }, entry: "wlan" },
      ],
      ["/generator", { page: "generator" }],
      ["/groups", { page: "groups" }],
      ["/settings", { page: "settings" }],
      ["/members", { page: "members" }],
      ["/vaults", { page: "vaults" }],
      ["/import", { page: "import" }],
      ["/renew", { page: "renew" }],
      ["/setup", { page: "setup" }],
      ["/unlock", { page: "unlock" }],
      ["/recover", { page: "recover" }],
      ["/recover-company", { page: "recover-company" }],
      ["/pair", { page: "pair" }],
      ["/link", { page: "link" }],
      ["/invite/abc%2Fd", { page: "invite", id: "abc/d" }],
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
      "/vaults/x/y/z",
      "/settings/x",
      "/entries/%E0",
      "/vaults/%E0",
      "/invite",
      "/invite/a/b",
      "/invite/%E0",
      "/setup/x",
      "/unlock/x",
      "/recover/x",
      "/pair/x",
      "/link/x",
      // As case-sensitive as the paths always were
      "/Entries",
      "/SETTINGS",
    ])
      expect(parseRoute(path)).toEqual({ page: "not-found" });
    expect(routePath({ page: "not-found" })).toBe("/");
  });
});
