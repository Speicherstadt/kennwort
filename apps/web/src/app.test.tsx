import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { Frame } from "./frame/frame.tsx";
import { createNavigation, type Navigation } from "./navigation.ts";

let dispose = () => {};
let nav: Navigation | undefined;
afterEach(() => {
  dispose();
  nav?.dispose();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.theme;
});

const open = (path: string, locale: "de" | "en" = "de") => {
  setLocale(locale, { reload: false });
  window.history.replaceState(null, "", path);
  const root = document.createElement("div");
  document.body.append(root);
  const navigation = createNavigation(window);
  nav = navigation;
  dispose = render(() => <Frame nav={navigation} onLock={() => {}} />, root);
  flush();
  return root;
};
const heading = (root: ParentNode) => root.querySelector("h1")?.textContent;
const click = (el: Element | null | undefined) => {
  (el as HTMLElement).click();
  flush();
};

describe("App frame", () => {
  it("opens all entries in German and in English", () => {
    expect(heading(open("/"))).toBe("Alle Einträge");
    dispose();
    expect(heading(open("/entries", "en"))).toBe("All entries");
  });

  it("opens an entry from the list into the URL and hides its password until revealed", () => {
    const root = open("/entries");
    const option = [...root.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent?.includes("Sparkasse"),
    );
    click(option);
    expect(window.location.pathname).toBe("/entries/bank");
    expect(root.querySelectorAll("h1")[1]?.textContent).toBe("Sparkasse");
    expect(root.textContent).not.toContain("Weber-2026!");
    click(root.querySelector('button[aria-label="Passwort aufdecken"]'));
    expect(root.textContent).toContain("Weber-2026!");
    expect(
      root.querySelector('button[aria-label="Passwort verdecken"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("filters by the sidebar's lists and follows the back button", () => {
    const root = open("/entries");
    click(root.querySelector('a[href="/to-change"]'));
    expect(heading(root)).toBe("Zum Ändern");
    expect(
      [...root.querySelectorAll('[role="option"]')].map(
        (o) => o.querySelector(".font-medium")?.textContent,
      ),
    ).toEqual(["DATEV", "Mail info@"]);
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    flush();
    expect(heading(root)).toBe("Alle Einträge");
  });

  it("opens every section and says when a page or entry does not exist", () => {
    expect(heading(open("/generator"))).toBe("Generator");
    dispose();
    expect(heading(open("/groups"))).toBe("Gruppen");
    dispose();
    expect(heading(open("/settings"))).toBe("Einstellungen");
    dispose();
    expect(heading(open("/nope"))).toBe("Diese Seite gibt es nicht");
    dispose();
    expect(open("/entries/unknown").textContent).toContain("Diesen Eintrag gibt es hier nicht.");
  });

  it("switches to dark and back to the system setting in the settings", () => {
    const root = open("/settings");
    click(root.querySelector('input[value="dark"]'));
    expect(document.documentElement.dataset.theme).toBe("dark");
    click(root.querySelector('input[value="system"]'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("marks the current section in the navigation", () => {
    const root = open("/groups");
    expect(
      [...root.querySelectorAll('[aria-current="page"]')].map((a) => a.getAttribute("href")),
    ).toContain("/groups");
  });
});
