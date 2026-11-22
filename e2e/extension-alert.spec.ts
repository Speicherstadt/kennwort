import { type BrowserContext, expect, type Frame, type Page, test } from "@playwright/test";
import { newDevice, PASSPHRASE, setUpCompany } from "./account.ts";
import { addEntry } from "./entries.ts";
import { extensionWorker, launchExtension, openPopup } from "./extension.ts";

// K-405: the phishing warning, in a real Chromium with the extension loaded, against test pages
// under .test. Jonas has the portal's login in Kennwort and unlocks the extension; typing its
// password himself on a look-alike domain warns, on the portal itself, with another password, in a
// hidden field, for a value the page sets itself and while locked nothing warns; the page cannot
// cover the warning away, and neither the password nor a host lands in a storage area in plain text.
const SERVER = "http://localhost:5176";
const SITE = "portal.weber-haustechnik.test";
const PASSWORD = "Kupfer-Rohr-18!";
const CONTINUE = `Das ist nicht ${SITE} – trotzdem fortfahren`;
const HIDDEN =
  "Die Warnung war verdeckt oder durchsichtig. Klick noch einmal, sobald du sie ganz siehst.";

/** A sign-in form, as on the portal and on the pages that imitate it */
const loginForm = (title: string, fields = "") =>
  `<!doctype html><html lang="de"><title>${title}</title><body style="margin:16px">
  <h1>${title}</h1>
  <form method="post" action="/welcome">${
    fields ||
    `<label>Benutzername <input name="user" autocomplete="username"></label><br>
    <label>Passwort <input name="pass" type="password" autocomplete="current-password"></label>`
  }<br><button type="submit">Anmelden</button></form></body>`;

/** A look-alike page whose password field the user cannot see */
const hiddenField = loginForm(
  "Portal",
  `<label>Benutzername <input name="user" autocomplete="username"></label>
  <input name="pass" type="password" aria-label="Passwort" style="opacity:0">`,
);

/** A look-alike page that puts a guessed password into the field itself and leaves it */
const scriptValue = `${loginForm("Portal")}<script>setTimeout(() => { const f = document.forms[0].pass;
  f.focus(); f.value = "${PASSWORD}"; f.dispatchEvent(new Event("input", { bubbles: true })); f.blur();
  document.title = "fertig"; }, 300);</script>`;

const PAGES: Record<string, string> = {
  [`https://${SITE}/login`]: loginForm("Portal"),
  "https://portal-weber-haustechnik.test/login": loginForm("Portal"),
  // Each check below on a host of its own: a warning comes once per page host and password
  "https://hidden-weber-haustechnik.test/login": hiddenField,
  "https://script-weber-haustechnik.test/login": scriptValue,
  "https://login-weber-haustechnik.test/login": loginForm("Portal"),
  "https://weber-haustechnik-portal.test/login": loginForm("Portal"),
  "https://portal.weber-haustechnik-login.test/login": loginForm("Portal"),
};

type Area = { get(keys: null | string): Promise<Record<string, unknown>> };
type Chrome = { storage: { session: Area; local: Area } };

const isPrompt = (frame: Frame) =>
  frame.url().startsWith("chrome-extension://") && frame.url().includes("/src/prompt/prompt.html");

/** The warning's frame once the content script opened it */
const warningIn = async (page: Page) => {
  await expect.poll(() => page.frames().some(isPrompt), { timeout: 20_000 }).toBe(true);
  const frame = page.frames().find(isPrompt) as Frame;
  await expect(frame.getByText(`Ist das wirklich ${SITE}?`)).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator("main")).toHaveAttribute("data-armed", "true");
  return frame;
};

/** Whether the page ever showed the prompt frame (it starts hidden; see the init script below) */
const everShown = (page: Page) =>
  page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown === true);

/** Waits long enough for a warning to come, then checks that none was shown */
const expectNoWarning = async (page: Page) => {
  await page.waitForTimeout(4_000);
  expect(await everShown(page)).toBe(false);
};

/** Types a password into the page's field as a person does, then leaves the field */
const typePassword = async (page: Page, url: string, password: string) => {
  await page.goto(url);
  await page.getByLabel("Benutzername").fill("jonas.weber");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.keyboard.press("Tab");
};

const session = async (context: BrowserContext) =>
  (await extensionWorker(context)).evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    return {
      all: JSON.stringify(await chrome.storage.session.get(null)),
      alert: (await chrome.storage.session.get("kennwort-alert"))["kennwort-alert"] as
        | { records: unknown[] }
        | undefined,
      local: await chrome.storage.local.get(null),
    };
  });

/** Connects and unlocks in the popup and waits until it listed the entries and made the alert list */
const connect = async (context: BrowserContext, accountId: string, secretKey: string) => {
  const popup = await openPopup(context);
  await popup.getByLabel("Server", { exact: true }).fill(SERVER);
  await popup.getByLabel("Konto-ID", { exact: true }).fill(accountId);
  await popup.getByLabel("Secret Key", { exact: true }).fill(secretKey);
  await popup.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
  await popup.getByRole("button", { name: "Verbinden und entsperren" }).click();
  await expect(popup.getByRole("listitem")).toHaveText([/Großhandel Portal/], { timeout: 30_000 });
  await expect
    .poll(async () => (await session(context)).alert?.records.length, { timeout: 20_000 })
    .toBe(1);
  await popup.close();
};

test.describe
  .serial("the phishing warning", () => {
    let context: BrowserContext;
    let close = async () => {};
    let tab: Page;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      const web = await newDevice(browser);
      const owner = await setUpCompany(web);
      await addEntry(web, {
        title: "Großhandel Portal",
        username: "jonas.weber",
        password: PASSWORD,
        website: `https://${SITE}/login`,
      });
      await web.context().close();
      const { accountId } = JSON.parse(owner.device) as { accountId: string };

      ({ context, close } = await launchExtension("de-DE", "light", "e2e"));
      await context.route("https://*.test/**", (route) => {
        const url = new URL(route.request().url());
        const body = PAGES[`${url.origin}${url.pathname}`];
        return body
          ? route.fulfill({ contentType: "text/html", body })
          : route.fulfill({ status: 404, body: "" });
      });
      // What the page itself can see: whether the prompt's element was ever shown
      await context.addInitScript(() => {
        new MutationObserver(() => {
          const host = document.querySelector("kennwort-save") as HTMLElement | null;
          if (host?.style.display === "block")
            (window as unknown as { promptShown: boolean }).promptShown = true;
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["style"],
        });
      });
      await connect(context, accountId, owner.secretKey);
      tab = context.pages()[0] ?? (await context.newPage());
    });

    test.afterAll(() => close());

    test("warns when the saved password is typed on a look-alike domain", async () => {
      await typePassword(tab, "https://portal-weber-haustechnik.test/login", PASSWORD);
      const warning = await warningIn(tab);
      await expect(warning.locator("header")).toContainText("portal-weber-haustechnik.test");
      await expect(warning.getByText(/„Großhandel Portal“/)).toBeVisible();
      await expect(warning.getByRole("link", { name: "Passwort ändern" })).toHaveAttribute(
        "href",
        `https://${SITE}/.well-known/change-password`,
      );
      await expect(warning.getByRole("link", { name: "Eintrag öffnen" })).toHaveAttribute(
        "href",
        new RegExp(`^${SERVER}/entries/[^/]+$`),
      );
      // The page sees neither the warning's content nor its frame, and stays usable
      expect(
        await tab.evaluate(() => [
          document.querySelector("kennwort-save")?.shadowRoot ?? null,
          document.querySelectorAll("iframe").length,
          document.documentElement.outerHTML.includes("Kupfer-Rohr"),
        ]),
      ).toEqual([null, 0, false]);
      await tab.getByLabel("Benutzername").fill("noch tippbar");
      await expect(tab.getByLabel("Benutzername")).toHaveValue("noch tippbar");

      // The inline menu that opened on the field went into the top layer after the warning, which
      // raised itself above it again; once it is armed again, "continue anyway" closes it
      await tab.keyboard.press("Escape");
      await expect(warning.locator("main")).toHaveAttribute("data-armed", "true");
      await warning.getByRole("button", { name: CONTINUE }).click();
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);
    });

    test("does not warn on the portal itself", async () => {
      await typePassword(tab, `https://${SITE}/login`, PASSWORD);
      await expectNoWarning(tab);
    });

    test("does not warn for another password", async () => {
      await typePassword(
        tab,
        "https://portal.weber-haustechnik-login.test/login",
        "Ganz-anders-7!",
      );
      await expectNoWarning(tab);
    });

    test("does not warn for a hidden field or a value the page sets itself", async () => {
      await typePassword(tab, "https://hidden-weber-haustechnik.test/login", PASSWORD);
      await expectNoWarning(tab);
      await tab.goto("https://script-weber-haustechnik.test/login");
      await expect(tab).toHaveTitle("fertig");
      await expectNoWarning(tab);
    });

    test("the page cannot cover the warning or click it away", async () => {
      await typePassword(tab, "https://weber-haustechnik-portal.test/login", PASSWORD);
      const warning = await warningIn(tab);
      const button = warning.getByRole("button", { name: CONTINUE });
      const box = await button.boundingBox();
      if (!box) throw new Error("the button has no box");
      // A cover in the top layer that the page keeps putting back on top, letting clicks through
      await tab.evaluate(() => {
        const host = document.querySelector("kennwort-save")?.getBoundingClientRect();
        if (!host) throw new Error("no warning");
        const cover = document.createElement("div");
        cover.id = "cover";
        cover.popover = "manual";
        cover.textContent = "Alles in Ordnung";
        cover.style.cssText = `position:fixed;inset:auto;margin:0;border:0;padding:0;
          background:#fff;pointer-events:none;left:${host.left}px;top:${host.top}px;
          width:${host.width}px;height:${host.height}px`;
        document.body.append(cover);
        cover.showPopover();
        (window as unknown as { fight: number }).fight = window.setInterval(() => {
          cover.hidePopover();
          cover.showPopover();
        }, 50);
      });
      await expect(warning.locator("main")).toHaveAttribute("data-armed", "false");
      await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(warning.getByRole("alert")).toHaveText(HIDDEN);
      expect(tab.frames().some(isPrompt)).toBe(true);

      // Once the page stops fighting, the warning is on top again, over the cover still there
      await tab.evaluate(() => clearInterval((window as unknown as { fight: number }).fight));
      const onTop = () =>
        tab.evaluate(() => {
          const host = document.querySelector("kennwort-save") as HTMLElement;
          const r = host.getBoundingClientRect();
          return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === host;
        });
      await expect.poll(onTop, { timeout: 5_000 }).toBe(true);
      // Made transparent, it is restyled at once
      await tab.evaluate(() =>
        (document.querySelector("kennwort-save") as HTMLElement).style.setProperty(
          "opacity",
          "0.05",
          "important",
        ),
      );
      await expect
        .poll(() =>
          tab.evaluate(
            () => getComputedStyle(document.querySelector("kennwort-save") as HTMLElement).opacity,
          ),
        )
        .toBe("1");
      await expect(warning.locator("main")).toHaveAttribute("data-armed", "true");
      // The note moved the button down: the same click, where it is now
      const now = await button.boundingBox();
      if (!now) throw new Error("the button has no box");
      await tab.mouse.click(now.x + now.width / 2, now.y + now.height / 2);
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);
    });

    test("keeps nothing on the disk and no password or host in plain text in the session area", async () => {
      const areas = await session(context);
      expect(areas.local).toEqual({});
      expect(areas.alert?.records).toHaveLength(1);
      for (const plain of ["Kupfer-Rohr", "weber-haustechnik", "portal"])
        expect(areas.all).not.toContain(plain);
    });

    test("does not warn while locked, and the alert list is gone", async () => {
      const popup = await openPopup(context);
      await popup.getByRole("button", { name: "Sperren", exact: true }).click();
      await expect(popup.getByRole("heading", { level: 1 })).toHaveText("Kennwort ist gesperrt");
      await popup.close();
      await expect.poll(async () => (await session(context)).alert).toBeUndefined();
      await typePassword(tab, "https://login-weber-haustechnik.test/login", PASSWORD);
      await expectNoWarning(tab);
    });
  });
