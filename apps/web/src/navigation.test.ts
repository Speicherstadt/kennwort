import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation, type Navigation, takeStartFragment } from "./navigation.ts";

let nav: Navigation | undefined;
afterEach(() => {
  nav?.dispose();
  nav = undefined;
  window.history.replaceState(null, "", "/");
});

const openAt = (address: string) => {
  window.history.replaceState(null, "", address);
  nav = createNavigation(window);
  return nav;
};
const address = () => window.location.pathname + window.location.search + window.location.hash;
const back = async () => {
  const popped = new Promise((resolve) =>
    window.addEventListener("popstate", resolve, { once: true }),
  );
  window.history.back();
  await popped;
  flush();
};

describe("navigation", () => {
  it("pushes a page into the address and the history at once", () => {
    const nav = openAt("/entries");
    const entries = window.history.length;
    nav.go("/vaults/b%C3%BCro/wlan");
    flush();
    expect(window.location.pathname).toBe("/vaults/b%C3%BCro/wlan");
    expect(window.history.length).toBe(entries + 1);
    expect(nav.route()).toEqual({
      page: "entries",
      filter: { kind: "vault", id: "büro" },
      entry: "wlan",
    });
  });

  it("adds nothing to the history for the page it is on", () => {
    const nav = openAt("/settings");
    const entries = window.history.length;
    nav.go("/settings");
    flush();
    expect(window.history.length).toBe(entries);
  });

  it("follows the back button", async () => {
    const nav = openAt("/groups");
    nav.go("/generator");
    flush();
    expect(nav.route()).toEqual({ page: "generator" });
    await back();
    expect(window.location.pathname).toBe("/groups");
    expect(nav.route()).toEqual({ page: "groups" });
  });

  it("replaces the entry, fragment included, without adding one to the history", () => {
    const nav = openAt("/unlock#account=a&secret=K1-X");
    const entries = window.history.length;
    nav.replace("/entries");
    flush();
    expect(window.location.pathname).toBe("/entries");
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(entries);
    expect(nav.route()).toEqual({ page: "entries", filter: { kind: "all" } });
  });

  it("drops the fragment and keeps the page", () => {
    const nav = openAt("/unlock?x=1#account=a&secret=K1-X");
    nav.dropFragment();
    flush();
    expect(address()).toBe("/unlock?x=1");
    expect(nav.route()).toEqual({ page: "unlock" });
  });
});

describe("the fragment the app was opened with", () => {
  it("leaves the address and the router at once on the kit's and the pairing link", () => {
    for (const page of ["/unlock", "/link"]) {
      const nav = openAt(`${page}#secret=K1-X`);
      expect(takeStartFragment(nav, window)).toBe("#secret=K1-X");
      // Before any flush: nothing may read the secret from the address in between
      expect(address()).toBe(page);
      flush();
      expect(nav.route().page).toBe(page.slice(1));
      nav.dispose();
    }
  });

  it("stays on an invitation, which reads its own, and anywhere else", () => {
    for (const path of ["/invite/abc#token=t", "/entries#x"]) {
      const nav = openAt(path);
      expect(takeStartFragment(nav, window)).toBe(path.slice(path.indexOf("#")));
      expect(address()).toBe(path);
      nav.dispose();
    }
  });

  it("is empty without one", () => {
    expect(takeStartFragment(openAt("/unlock"), window)).toBe("");
    expect(address()).toBe("/unlock");
  });
});
