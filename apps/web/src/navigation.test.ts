import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation } from "./navigation.ts";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("navigation", () => {
  it("replaces the entry, fragment included, without adding one to the history", () => {
    window.history.replaceState(null, "", "/unlock#account=a&secret=K1-X");
    const nav = createNavigation(window);
    const entries = window.history.length;
    nav.replace("/entries");
    flush();
    expect(window.location.pathname).toBe("/entries");
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(entries);
    expect(nav.route()).toEqual({ page: "entries", filter: { kind: "all" } });
    nav.dispose();
  });
});
