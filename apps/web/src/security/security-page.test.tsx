import { createHash } from "node:crypto";
import { type ShownEntry, shown } from "@kennwort/client/entries/entries.ts";
import { createLeakCheck, type FetchRange } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { markToChange } from "../entries/to-change.ts";
import { createNavigation } from "../navigation.ts";
import { createLeaks } from "./leaks.ts";
import { type SecurityDeps, SecurityPage } from "./security-page.tsx";

// K-603: „Sicherheit“ in the web app
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    flush();
  }
};

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex").toUpperCase();
const LEAKED = "Kessel-Pumpe-Rohr-7!";
const SHARED = "Heizung-Wasser-Licht-42";

const login = (id: string, password: string, website: string): ShownEntry =>
  shown({
    idText: id,
    vaultIdText: "buero",
    role: "edit",
    version: 1,
    content: {
      type: "login",
      title: id,
      fields: [
        { id: "username", name: "", value: `${id.toLowerCase()}@weber.test`, kind: "text" },
        { id: "password", name: "", value: password, kind: "secret" },
        { id: "website", name: "", value: website, kind: "url" },
      ],
      tags: [],
      favorite: false,
      history: [],
    },
  });

const entries = markToChange([
  login("Sparkasse", LEAKED, "https://www.sparkasse.test/login"),
  login("Mail", "sommer2019", "javascript:alert(1)"),
  login("Router", SHARED, "http://192.168.178.1/"),
  login("NAS", SHARED, "nas.weber.test:5001"),
]);

const setup = (options: { on?: boolean; report?: string } = {}) => {
  const asked: string[] = [];
  const fetchRange: FetchRange = async (prefix) => {
    asked.push(prefix);
    const line = sha1(LEAKED).startsWith(prefix) ? `${sha1(LEAKED).slice(5)}:42\r\n` : "";
    return { ok: true, value: `${line}${"0".repeat(35)}:0` };
  };
  const [on, setOn] = createSignal(options.on ?? false);
  const [report, setReport] = createSignal(options.report);
  const choices: boolean[] = [];
  const deps: SecurityDeps = {
    nav: createNavigation(window),
    entries: () => entries,
    vaultName: () => "Büro",
    leakCheckOn: on,
    setLeakCheck: async (next) => {
      choices.push(next);
      setOn(next);
      return true;
    },
    leaks: createLeaks(createLeakCheck(fetchRange)),
    reportMonth: report,
    onReportSeen: async () => {
      setReport(undefined);
      return true;
    },
  };
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <SecurityPage deps={deps} />, root);
  flush();
  return { root, asked, choices };
};

const list = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`ul[aria-label="${name}"]`);
const titles = (root: HTMLElement, name: string) =>
  [...(list(root, name)?.querySelectorAll(`li a[href^="/entries/"] span:first-child`) ?? [])].map(
    (e) => e.textContent,
  );
const changeLinks = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLAnchorElement>("a")].filter((a) =>
    a.textContent?.includes("Jetzt ändern"),
  );

describe("SecurityPage", () => {
  it("lists the weak and the reused entries and asks nothing while the check is off", async () => {
    const { root, asked } = setup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    flush();
    expect(titles(root, "Schwach")).toEqual(["Mail"]);
    expect(titles(root, "Mehrfach verwendet")).toEqual(["NAS", "Router"]);
    expect(list(root, "In Datenlecks")).toBeNull();
    expect(root.textContent).toContain("Aus. Ohne dein Einschalten geht keine Anfrage hinaus.");
    expect(asked).toEqual([]);
  });

  it("never shows a password", () => {
    const { root } = setup({ on: true });
    for (const password of [LEAKED, SHARED, "sommer2019"])
      expect(root.innerHTML).not.toContain(password);
  });

  it("opens the well-known address in a new tab without opener or referrer, the start page for an IP, none for another scheme", () => {
    const { root } = setup();
    const links = changeLinks(root);
    const byLabel = Object.fromEntries(links.map((a) => [a.getAttribute("aria-label"), a]));
    expect(byLabel["NAS: jetzt ändern"]?.href).toBe(
      "https://nas.weber.test:5001/.well-known/change-password",
    );
    expect(byLabel["Router: jetzt ändern"]?.href).toBe("http://192.168.178.1/");
    expect(byLabel["Mail: jetzt ändern"]).toBeUndefined();
    for (const a of links) {
      expect(a.target).toBe("_blank");
      expect(a.rel).toBe("noopener noreferrer");
    }
  });

  it("switches the check on only by the person's choice, then finds the leaked password", async () => {
    const { root, asked, choices } = setup();
    const box = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.checked).toBe(false);
    box?.click();
    await until(() => list(root, "In Datenlecks") !== null);
    expect(choices).toEqual([true]);
    expect(titles(root, "In Datenlecks")).toEqual(["Sparkasse"]);
    expect(root.textContent).toContain("In Datenlecks gesehen: 42");
    for (const prefix of asked) expect(prefix).toMatch(/^[0-9A-F]{5}$/);
    expect(asked).toContain(sha1(LEAKED).slice(0, 5));
  });

  it("shows the monthly report as counts per vault, without titles, until it is read", async () => {
    const { root } = setup({ report: "2026-11" });
    const card = root.querySelector<HTMLElement>('[aria-labelledby="security-report"]');
    expect(card?.textContent).toContain("Monatsbericht November 2026");
    expect(card?.textContent).toContain("Büro");
    expect(card?.textContent).not.toMatch(/Sparkasse|Router|Mail|NAS/);
    [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Gelesen")?.click();
    await until(() => root.querySelector('[aria-labelledby="security-report"]') === null);
    expect(root.querySelector('[aria-labelledby="security-report"]')).toBeNull();
  });

  it("shows no report when none is due", () => {
    const { root } = setup();
    expect(root.querySelector('[aria-labelledby="security-report"]')).toBeNull();
  });
});
