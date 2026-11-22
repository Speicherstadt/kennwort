import { expect, type Frame, type Page, test } from "@playwright/test";
import { type Build, buildOf, EXTENSION_ORIGIN } from "./engine.ts";
import { EXTENSION_PORT } from "./serve.ts";

// K-407: the fill flow's checks in each engine (apps/extension/harness/engine-harness.ts): the
// menu opens only on the user's own focus and only where the frame may fill, the worker fills only
// the exact host and only the frame the menu belongs to, the content script writes nothing while the page covers the
// menu or into a field the page hides. Firefox and Safari have no IntersectionObserver v2, so
// their menu page never arms and fills nothing (menu/visibility.ts); these checks are what still
// stands between a page and a login there, and they must hold in Gecko and WebKit too.
const PAGE = `http://localhost:${EXTENSION_PORT}/harness`;
const HERE = `http://localhost:${EXTENSION_PORT}/login`;
const LOGIN = { username: "jonas.weber", password: "Kupfer-Rohr-17!" };
const TOP = /localhost:\d+\/harness\/(top|hidden)\.html$/;
const SAME = /localhost:\d+\/harness\/frame\.html$/;

type Answer = { ok: boolean; error?: string };
type Harness = {
  fill(addresses: string[], origin: string): Promise<Answer>;
  frames(): number;
  menuIn(): string | undefined;
  menuClear(): boolean;
  tracksVisibility(): boolean;
};

/** Calls the harness in the top frame of the page */
const call = <K extends keyof Harness>(page: Page, method: K, ...args: Parameters<Harness[K]>) =>
  page.evaluate(
    ([name, params]) => {
      const h = (
        window as unknown as { kennwortHarness: Record<string, (...a: unknown[]) => unknown> }
      ).kennwortHarness;
      return h[name]?.(...params);
    },
    [method, args] as const,
  ) as Promise<Awaited<ReturnType<Harness[K]>>>;

const fill = (page: Page, build: Build, addresses = [HERE]) =>
  call(page, "fill", addresses, EXTENSION_ORIGIN[build]);

const values = (frame: Page | Frame) =>
  frame.evaluate(() => Array.from(document.querySelectorAll("input"), (input) => input.value));

const openTop = async (page: Page, path = "top.html") => {
  await page.goto(`${PAGE}/${path}`);
  if (path === "top.html") await expect.poll(() => call(page, "frames")).toBe(2);
};

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on("pageerror", (error) => seen.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("knows whether this engine reports visibility (IntersectionObserver v2)", async ({
  page,
}, info) => {
  await openTop(page);
  // Only Chromium has v2: elsewhere the menu page never arms, shows its entries and fills nothing
  expect(await call(page, "tracksVisibility")).toBe(buildOf(info) === "chrome");
});

test("fills the exact host after the user's click into the field", async ({ page }, info) => {
  await openTop(page);
  await page.locator("#login input[name=username]").click();
  await expect.poll(() => call(page, "menuIn")).toMatch(TOP);
  await expect.poll(() => call(page, "menuClear")).toBe(true);
  expect(await fill(page, buildOf(info))).toEqual({ ok: true });
  expect(await values(page)).toEqual([LOGIN.username, LOGIN.password]);
});

test("fills nothing on another host or into http with a password stored for https", async ({
  page,
}, info) => {
  await openTop(page);
  await page.locator("#login input[name=password]").click();
  await expect.poll(() => call(page, "menuIn")).toMatch(TOP);
  for (const addresses of [
    [`http://127.0.0.1:${EXTENSION_PORT}/login`],
    [`http://localhost.evil.test:${EXTENSION_PORT}/`],
    [`https://localhost:${EXTENSION_PORT}/login`],
  ]) {
    expect(await fill(page, buildOf(info), addresses)).toEqual({ ok: false, error: "no-match" });
  }
  expect(await values(page)).toEqual(["", ""]);
});

test("opens no menu on a focus the page makes up", async ({ page }) => {
  await openTop(page);
  await page.evaluate(() => {
    const field = document.querySelector("#login input[name=username]") as HTMLInputElement;
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
  });
  await page.waitForTimeout(300);
  expect(await call(page, "menuIn")).toBeUndefined();
});

test("fills a frame of the page's own origin, never one of another origin", async ({
  page,
}, info) => {
  await openTop(page);
  const same = page.frameLocator("#same");
  await same.locator("input[name=username]").click();
  await expect.poll(() => call(page, "menuIn")).toMatch(SAME);
  expect(await fill(page, buildOf(info), [`http://localhost:${EXTENSION_PORT}/`])).toEqual({
    ok: true,
  });
  const sameFrame = page.frame({ url: SAME });
  expect(sameFrame && (await values(sameFrame))).toEqual([LOGIN.username, LOGIN.password]);

  // The foreign frame's content script does not even open a menu there (same-origin.ts)
  await page.frameLocator("#foreign").locator("input[name=username]").click();
  await page.waitForTimeout(300);
  expect(await call(page, "menuIn")).toMatch(SAME);
  const foreign = page.frame({ url: /127\.0\.0\.1:\d+\/harness\/frame\.html/ });
  expect(foreign && (await values(foreign))).toEqual(["", ""]);
});

test("writes nothing while the page covers the menu", async ({ page }, info) => {
  await openTop(page);
  await page.locator("#login input[name=username]").click();
  await expect.poll(() => call(page, "menuClear")).toBe(true);
  // A popover of the page after the menu lies above it in the top layer
  await page.evaluate(() => {
    const cover = document.createElement("div");
    cover.popover = "manual";
    cover.style.cssText = "inset:0;width:100vw;height:100vh;background:white;pointer-events:none";
    document.body.append(cover);
    cover.showPopover();
  });
  expect(await call(page, "menuClear")).toBe(false);
  expect(await fill(page, buildOf(info))).toEqual({ ok: false, error: "menu-hidden" });
  expect(await values(page)).toEqual(["", ""]);
});

test("writes nothing while the page sees through the menu", async ({ page }, info) => {
  await openTop(page);
  await page.locator("#login input[name=username]").click();
  await expect.poll(() => call(page, "menuClear")).toBe(true);
  await page.evaluate(() => document.documentElement.style.setProperty("opacity", "0.01"));
  expect(await fill(page, buildOf(info))).toEqual({ ok: false, error: "menu-hidden" });
  expect(await values(page)).toEqual(["", ""]);
});

test("fills only the fields the page shows", async ({ page }, info) => {
  await openTop(page, "hidden.html");
  await page.locator("input[name=username]").click();
  await expect.poll(() => call(page, "menuIn")).toMatch(TOP);
  expect(await fill(page, buildOf(info))).toEqual({ ok: true });
  // The password field off the page gets nothing
  expect(await values(page)).toEqual([LOGIN.username, ""]);
});
