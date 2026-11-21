import {
  type BrowserContext,
  expect,
  type Frame,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { newDevice, PASSPHRASE, setUpCompany } from "./account.ts";
import { addEntry } from "./entries.ts";
import { launchExtension, openPopup } from "./extension.ts";

// K-403: the inline menu and filling in, in a real Chromium with the extension loaded, against
// test pages under .test. Jonas saves two logins in the web app and unlocks the extension; the menu
// fills on a click or Enter on the exact host, and defends against a phishing domain, a foreign
// iframe on a matching page and a covered or transparent menu (P-17; DOM-based extension
// clickjacking, Marek Tóth, DEF CON 33, 2025).
const SERVER = "http://localhost:5176";
const PORTAL = "https://portal.weber-haustechnik.test/login";
const PORTAL_WITH_WIDGET = "https://portal.weber-haustechnik.test/start";
const WIDGET = "https://sparkasse.test/widget";
const PHISHING = "https://portal-weber-haustechnik.test/login";
const USERNAME = "jonas.weber";
const PASSWORD = "Kupfer-Rohr-17!";
const FILL = "Großhandel Portal ausfüllen";
const HIDDEN = "Das Menü war verdeckt oder durchsichtig. Kennwort hat nichts ausgefüllt.";

const loginForm = (title: string, extra = "") =>
  `<!doctype html><html lang="de"><title>${title}</title><body style="margin:16px">
  <h1>${title}</h1>
  <form><label>Benutzername <input name="user" autocomplete="username"></label><br>
  <label>Passwort <input name="pass" type="password" autocomplete="current-password"></label><br>
  <button type="button">Anmelden</button></form>${extra}</body>`;

/**
 * A page of the exact host that shows only a user name field and hides a password field after it,
 * each in its own way, so its script reads a password the user never saw going in
 */
const HIDDEN_PASSWORD: Record<string, string> = {
  "off-screen": "position:absolute;left:-9999px;top:-9999px",
  transparent: "opacity:0",
  tiny: "width:1px;height:1px;padding:0;border:0",
};
const hiddenPasswordPage = (trick: string) => `${PORTAL}?hidden=${trick}`;
const hiddenPasswordPages = () =>
  Object.fromEntries(
    Object.entries(HIDDEN_PASSWORD).map(([trick, style]) => [
      hiddenPasswordPage(trick),
      `<!doctype html><html lang="de"><title>Newsletter</title><body style="margin:16px">
      <form><label>Benutzername <input name="user" autocomplete="username"></label>
      <input name="pass" type="password" aria-label="Passwort" style="${style}">
      <button type="button">Weiter</button></form></body>`,
    ]),
  );

const PAGES: Record<string, string> = {
  [PORTAL]: loginForm("Portal"),
  // A matching page with its own login and a login form of another origin in an iframe
  [PORTAL_WITH_WIDGET]: loginForm(
    "Portal",
    `<iframe src="${WIDGET}" title="Sparkasse" style="width:320px;height:220px"></iframe>`,
  ),
  [WIDGET]: loginForm("Sparkasse"),
  // The look-alike: a hyphen instead of a dot
  [PHISHING]: loginForm("Portal"),
  ...hiddenPasswordPages(),
};

type Chrome = { runtime: { sendMessage(message: object): Promise<unknown> } };

const isMenu = (frame: Frame) =>
  frame.url().startsWith("chrome-extension://") && frame.url().includes("/src/menu/menu.html");

/** The menu frame inside a page (or inside one of its frames), once the content script opened it */
const menuIn = async (page: Page, parent?: Frame) => {
  const find = () =>
    page.frames().find((frame) => isMenu(frame) && (!parent || frame.parentFrame() === parent));
  await expect.poll(() => find() !== undefined, { timeout: 15_000 }).toBe(true);
  return find() as Frame;
};

const fields = (page: Page | Frame) => ({
  username: page.getByLabel("Benutzername"),
  password: page.getByLabel("Passwort"),
});

const expectEmpty = async (page: Page | Frame) => {
  const { username, password } = fields(page);
  await expect(username).toHaveValue("");
  await expect(password).toHaveValue("");
};

/** What the service worker answers a menu that asks to fill anyway (the gate behind the menu) */
const forceFill = (menu: Frame, addresses: string[]) =>
  menu.evaluate(
    ([addresses, username, password]) =>
      (globalThis as unknown as { chrome: Chrome }).chrome.runtime.sendMessage({
        type: "menu-fill",
        nonce: location.hash.slice(1),
        addresses,
        username,
        password,
      }),
    [addresses, USERNAME, PASSWORD] as const,
  );

/** Connects the extension to Jonas's account through the popup, as K-402 does */
const connect = async (context: BrowserContext, accountId: string, secretKey: string) => {
  const popup = await openPopup(context);
  await popup.getByLabel("Server", { exact: true }).fill(SERVER);
  await popup.getByLabel("Konto-ID", { exact: true }).fill(accountId);
  await popup.getByLabel("Secret Key", { exact: true }).fill(secretKey);
  await popup.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await popup.getByRole("button", { name: "Verbinden und entsperren" }).click();
  await expect(popup.getByRole("searchbox")).toBeVisible({ timeout: 30_000 });
  await popup.close();
};

test.describe
  .serial("the inline menu", () => {
    let context: BrowserContext;
    let close = async () => {};
    let tab: Page;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      const web = await newDevice(browser);
      const owner = await setUpCompany(web);
      await addEntry(web, {
        title: "Großhandel Portal",
        username: USERNAME,
        password: PASSWORD,
        website: PORTAL,
      });
      await addEntry(web, {
        title: "Sparkasse",
        username: "weber",
        password: "Rohr-Ventil-2026!",
        website: "https://sparkasse.test",
      });
      await web.context().close();
      const { accountId } = JSON.parse(owner.device) as { accountId: string };

      ({ context, close } = await launchExtension("de-DE", "light", "e2e"));
      await context.route("https://*.test/**", (route) => {
        const body = PAGES[route.request().url()];
        return body
          ? route.fulfill({ contentType: "text/html", body })
          : route.fulfill({ status: 404, body: "" });
      });
      await connect(context, accountId, owner.secretKey);
      tab = context.pages()[0] ?? (await context.newPage());
    });

    test.afterAll(() => close());

    test("fills on a click and on Enter on the exact host", async () => {
      await tab.goto(PORTAL);
      await fields(tab).username.click();
      const menu = await menuIn(tab);
      await expect(menu.getByRole("button", { name: FILL })).toBeVisible({ timeout: 30_000 });
      await expect(menu.getByRole("button", { name: "Sparkasse ausfüllen" })).toHaveCount(0);
      await expect(menu.locator("header")).toContainText("portal.weber-haustechnik.test");
      // The page sees neither the menu's content nor where its frame points
      expect(
        await tab.evaluate(() => {
          const host = document.querySelector("kennwort-menu");
          return [host?.shadowRoot ?? null, document.querySelectorAll("iframe").length];
        }),
      ).toEqual([null, 0]);
      await expect(menu.locator("main")).toHaveAttribute("data-armed", "true");
      await menu.getByRole("button", { name: FILL }).click();
      await expect(fields(tab).username).toHaveValue(USERNAME);
      await expect(fields(tab).password).toHaveValue(PASSWORD);

      // ↓ moves into the menu, Enter fills
      await tab.reload();
      await fields(tab).password.click();
      const again = await menuIn(tab);
      await expect(again.getByRole("button", { name: FILL })).toBeVisible({ timeout: 30_000 });
      await expect(again.locator("main")).toHaveAttribute("data-armed", "true");
      await tab.keyboard.press("ArrowDown");
      await expect(again.getByRole("button", { name: FILL })).toBeFocused();
      await tab.keyboard.press("Enter");
      await expect(fields(tab).password).toHaveValue(PASSWORD);
      await expect(fields(tab).username).toHaveValue(USERNAME);
    });

    test("gives a phishing look-alike domain no matches and no fill", async () => {
      await tab.goto(PHISHING);
      await fields(tab).username.click();
      const menu = await menuIn(tab);
      await expect(menu.locator("header")).toContainText("portal-weber-haustechnik.test");
      await expect(menu.getByText("Keine Einträge für diese Seite.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(menu.locator("button[data-entry]")).toHaveCount(0);
      // Even a menu that asks for the portal's login gets nothing from the service worker
      expect(await forceFill(menu, [PORTAL])).toEqual({ ok: false, error: "no-match" });
      await expectEmpty(tab);
    });

    test("fills nothing into a foreign iframe on a matching page", async () => {
      await tab.goto(PORTAL_WITH_WIDGET);
      const widget = tab.frame({ url: WIDGET }) as Frame;
      await expect(fields(widget).username).toBeVisible();

      // The content script in the foreign frame opens no menu
      await fields(widget).username.click();
      await tab.waitForTimeout(1_500);
      expect(tab.frames().filter(isMenu)).toEqual([]);

      // The page's own login gets the menu; asked for the foreign frame's login (an entry for
      // sparkasse.test exists), the service worker refuses: it judges the frame the menu belongs to
      await fields(tab).username.click();
      const own = await menuIn(tab, tab.mainFrame());
      await expect(own.getByRole("button", { name: FILL })).toBeVisible({ timeout: 30_000 });
      await expect(own.getByRole("button", { name: "Sparkasse ausfüllen" })).toHaveCount(0);
      expect(await forceFill(own, ["https://sparkasse.test"])).toEqual({
        ok: false,
        error: "no-match",
      });
      const menuUrl = own.url().split("#")[0] as string;
      await tab.keyboard.press("Escape");
      await expect.poll(() => tab.frames().filter(isMenu).length).toBe(0);

      // Nor can the foreign frame frame the menu page itself: Chrome serves it only under the
      // session's dynamic address (use_dynamic_url), which no page learns
      await widget.evaluate((src) => {
        const frame = document.createElement("iframe");
        frame.src = `${src}#${"cd".repeat(16)}`;
        document.body.append(frame);
      }, menuUrl);
      await expect
        .poll(() => widget.childFrames().map((frame) => frame.url()))
        .toEqual(["chrome-error://chromewebdata/"]);
      await expectEmpty(widget);
      await expectEmpty(tab);
    });

    test("fills nothing while the page covers the menu or makes it transparent", async () => {
      await tab.goto(PORTAL);
      /** Opens the menu on the user name field and waits until it takes clicks */
      const openMenu = async () => {
        await fields(tab).username.click();
        const menu = await menuIn(tab);
        const entry = menu.getByRole("button", { name: FILL });
        await expect(entry).toBeVisible({ timeout: 30_000 });
        await expect(menu.locator("main")).toHaveAttribute("data-armed", "true");
        return { menu, entry, armed: menu.locator("main") };
      };
      /** A real click where the entry is now, whatever lies over it */
      const clickOn = async (entry: Locator) => {
        const box = await entry.boundingBox();
        if (!box) throw new Error("the menu entry has no box");
        await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      };
      /** The page lays its own element over the menu, in the top layer above it */
      const cover = (pointerEvents: "auto" | "none") =>
        tab.evaluate((events) => {
          const menuBox = document.querySelector("kennwort-menu")?.getBoundingClientRect();
          if (!menuBox) throw new Error("no menu");
          document.getElementById("cover")?.remove();
          const element = document.createElement("div");
          element.id = "cover";
          element.popover = "manual";
          element.textContent = "Gewinnspiel: Jetzt klicken!";
          element.style.cssText = `position:fixed;inset:auto;margin:0;border:0;padding:0;
            background:#fff;pointer-events:${events};left:${menuBox.left}px;top:${menuBox.top}px;
            width:${menuBox.width}px;height:${menuBox.height}px`;
          element.addEventListener("click", () => {
            element.dataset.clicks = String(Number(element.dataset.clicks ?? 0) + 1);
          });
          document.body.append(element);
          element.showPopover();
        }, pointerEvents);

      // 1. An opaque cover over the menu: the click lands on the page, which closes the menu
      const first = await openMenu();
      await cover("auto");
      await expect(first.armed).toHaveAttribute("data-armed", "false");
      await clickOn(first.entry);
      await expect(tab.locator("#cover")).toHaveAttribute("data-clicks", "1");
      await expect.poll(() => tab.frames().filter(isMenu).length).toBe(0);
      await expectEmpty(tab);

      // 2. A look-alike cover that lets the click through to the menu (pointer-events: none)
      const { menu, entry, armed } = await openMenu();
      await cover("none");
      await expect(armed).toHaveAttribute("data-armed", "false");
      await clickOn(entry);
      await expect(menu.getByRole("alert")).toHaveText(HIDDEN);
      await expectEmpty(tab);

      // 3. No cover, but the menu made nearly transparent, on its element or on the whole page.
      // Chromium's IntersectionObserver v2 in the menu's frame does not see opacity set in the
      // page (it does see covers), so the content script's own check refuses these (menu-frame.ts)
      await tab.evaluate(() => document.getElementById("cover")?.remove());
      for (const trick of ["menu", "page"] as const) {
        await expect(armed).toHaveAttribute("data-armed", "true");
        await tab.evaluate((on) => {
          const element =
            on === "menu" ? document.querySelector("kennwort-menu") : document.documentElement;
          (element as HTMLElement).style.setProperty("opacity", "0.01", "important");
        }, trick);
        await clickOn(entry);
        await expect(menu.getByRole("alert")).toHaveText(HIDDEN);
        await tab.waitForTimeout(500);
        await expectEmpty(tab);
        await tab.evaluate(() => {
          document
            .querySelector<HTMLElement>("kennwort-menu")
            ?.style.setProperty("opacity", "1", "important");
          document.documentElement.style.removeProperty("opacity");
        });
      }

      // Once the page stops, the same click fills: the defences above refused, nothing else did
      await expect(armed).toHaveAttribute("data-armed", "true");
      await clickOn(entry);
      await expect(fields(tab).password).toHaveValue(PASSWORD);
      await expect(fields(tab).username).toHaveValue(USERNAME);
    });

    test("fills no password into a field the page hides", async () => {
      for (const trick of Object.keys(HIDDEN_PASSWORD)) {
        await tab.goto(hiddenPasswordPage(trick));
        await fields(tab).username.click();
        const menu = await menuIn(tab);
        const entry = menu.getByRole("button", { name: FILL });
        await expect(entry).toBeVisible({ timeout: 30_000 });
        await expect(menu.locator("main")).toHaveAttribute("data-armed", "true");
        await entry.click();
        // The user name the user sees goes in, the password into the hidden field does not
        await expect(fields(tab).username, trick).toHaveValue(USERNAME);
        await tab.waitForTimeout(500);
        await expect(fields(tab).password, trick).toHaveValue("");
      }
    });
  });
