import { createBrowserHistory } from "@tanstack/solid-router";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation, type Navigation, takeStartFragment } from "./navigation.ts";
import { type AppRouter, createAppRouter } from "./router.ts";

let nav: Navigation | undefined;
afterEach(() => {
  nav?.dispose();
  nav = undefined;
  window.history.replaceState(null, "", "/");
});

let app: AppRouter | undefined;
const openAt = (address: string) => {
  window.history.replaceState(null, "", address);
  app = createAppRouter(createBrowserHistory({ window }));
  nav = createNavigation(window, app);
  return nav;
};
/** Everything the router and the history hold about where the app is */
const remembered = () => {
  const router = app?.router;
  return JSON.stringify([
    window.history.state,
    router?.history.location,
    router?.stores.location.get(),
    router?.state.location,
    router?.state.resolvedLocation,
  ]);
};
/** The user opens a link to the page the tab is on: the browser changes only the fragment */
const followFragment = async (hash: string) => {
  const changed = new Promise((resolve) =>
    window.addEventListener("hashchange", resolve, { once: true }),
  );
  window.location.hash = hash;
  await changed;
  flush();
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

  it("leaves the address, the history entry and the router at once on an invitation (P-08)", async () => {
    const nav = openAt("/invite/abc#token=T0K3N&s=S3CR3T&root=R00T");
    expect(takeStartFragment(nav, window)).toBe("#token=T0K3N&s=S3CR3T&root=R00T");
    expect(address()).toBe("/invite/abc");
    expect(remembered()).not.toMatch(/T0K3N|S3CR3T|R00T/);
    await app?.router.load();
    flush();
    expect(remembered()).not.toMatch(/T0K3N|S3CR3T|R00T/);
    expect(nav.route()).toEqual({ page: "invite", id: "abc" });
  });

  it("leaves the address, the history entry and the router at once on a one-time link (K-601)", async () => {
    const nav = openAt("/s/AQEBAQEBAQEBAQEBAQEBAQ#S3CR3T-L1NK");
    expect(takeStartFragment(nav, window)).toBe("#S3CR3T-L1NK");
    expect(address()).toBe("/s/AQEBAQEBAQEBAQEBAQEBAQ");
    expect(remembered()).not.toContain("S3CR3T");
    await app?.router.load();
    flush();
    expect(remembered()).not.toContain("S3CR3T");
    expect(nav.route()).toEqual({ page: "secret", id: "AQEBAQEBAQEBAQEBAQEBAQ" });
  });

  it("stays anywhere else", () => {
    const nav = openAt("/entries#x");
    expect(takeStartFragment(nav, window)).toBe("#x");
    expect(address()).toBe("/entries#x");
  });

  it("is empty without one", () => {
    expect(takeStartFragment(openAt("/unlock"), window)).toBe("");
    expect(address()).toBe("/unlock");
  });
});

describe("a fragment that arrives while the app is open", () => {
  it("is taken and dropped on the pairing, the kit's and the invitation's page", async () => {
    for (const [path, page] of [
      ["/link", "link"],
      ["/unlock", "unlock"],
      ["/invite/abc", "invite"],
      ["/s/AQEBAQEBAQEBAQEBAQEBAQ", "secret"],
    ] as const) {
      const nav = openAt(path);
      const taken: unknown[] = [];
      nav.onFragment((fragment) => taken.push(fragment));
      await followFragment("#id=i&fp=f&r=S3CR3T");
      expect(taken).toEqual([{ page, hash: "#id=i&fp=f&r=S3CR3T" }]);
      expect(address()).toBe(path);
      await app?.router.load();
      expect(remembered()).not.toContain("S3CR3T");
      expect(nav.route().page).toBe(page);
      nav.dispose();
    }
  });

  it("is taken from the popstate a browser fires first, before the router loads the address", async () => {
    const nav = openAt("/link");
    const taken: unknown[] = [];
    nav.onFragment((fragment) => taken.push(fragment));
    const loaded: string[] = [];
    app?.router.subscribe("onLoad", (event) => loaded.push(event.toLocation.href));
    // What Chromium does on a fragment navigation, which happy-dom leaves out
    window.history.pushState(null, "", "/link#r=S3CR3T");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    expect(taken).toEqual([{ page: "link", hash: "#r=S3CR3T" }]);
    expect(address()).toBe("/link");
    await app?.router.load();
    expect(loaded.join()).not.toContain("S3CR3T");
    expect(remembered()).not.toContain("S3CR3T");
  });

  it("stays on any other page", async () => {
    const nav = openAt("/entries");
    const taken: unknown[] = [];
    nav.onFragment((fragment) => taken.push(fragment));
    await followFragment("#x");
    expect(taken).toEqual([]);
    expect(address()).toBe("/entries#x");
  });

  it("is no longer watched once the navigation is gone", async () => {
    const watched = openAt("/link");
    const taken: unknown[] = [];
    watched.onFragment((fragment) => taken.push(fragment));
    watched.dispose();
    nav = undefined;
    await followFragment("#r=x");
    expect(taken).toEqual([]);
  });
});
