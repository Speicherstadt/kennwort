import { type BrowserContext, expect, type Frame, type Page, test } from "@playwright/test";
import { newDevice, PASSPHRASE, setUpCompany, unlock } from "./account.ts";
import { addEntry } from "./entries.ts";
import { extensionWorker, launchExtension, openPopup } from "./extension.ts";

// K-404: saving and updating logins, in a real Chromium with the extension loaded, against test
// pages under .test. Jonas has the portal's login in Kennwort and unlocks the extension; after a
// sign-in he submits himself the extension offers to save a new login or update a changed
// password, and offers nothing for the same password, a password field the page hides, a submit
// the page makes by script, a site on the never list, or while the page covers the prompt.
const SERVER = "http://localhost:5176";
const SITE = (host: string) => `https://${host}.weber-haustechnik.test`;
const PORTAL = SITE("portal");
const USERNAME = "jonas.weber";
const OLD_PASSWORD = "Kupfer-Rohr-17!";
const NEW_PASSWORD = "Kupfer-Rohr-18!";
const HIDDEN = "Die Leiste war verdeckt oder durchsichtig. Kennwort hat nichts gespeichert.";

/** A sign-in form that posts to /welcome, as most sign-ins do */
const loginForm = (title: string, fields = "") =>
  `<!doctype html><html lang="de"><title>${title}</title><body style="margin:16px">
  <h1>${title}</h1>
  <form method="post" action="/welcome">${
    fields ||
    `<label>Benutzername <input name="user" autocomplete="username"></label><br>
    <label>Passwort <input name="pass" type="password" autocomplete="current-password"></label>`
  }<br><button type="submit">Anmelden</button></form></body>`;

/** A sign-in by script (fetch) that removes its form once signed in, with the button beside the fields */
const scriptLogin = `<!doctype html><html lang="de"><title>Lager</title><body style="margin:16px">
  <h1>Lager</h1><div id="login" style="display:flex;gap:8px;align-items:end">
  <label>Benutzername <input name="user" autocomplete="username"></label>
  <label>Passwort <input name="pass" type="password"></label>
  <button type="button" id="go">Anmelden</button></div>
  <script>document.getElementById("go").addEventListener("click", () =>
    setTimeout(() => { document.getElementById("login").remove();
      document.body.insertAdjacentHTML("beforeend", "<p>Willkommen</p>"); }, 200));</script></body>`;

/** A page that hides the password field and fills it itself from what the user types as name */
const hiddenPassword = loginForm(
  "Newsletter",
  `<label>Benutzername <input name="user" autocomplete="username"
    oninput="this.form.pass.value = 'Abgegriffen-' + this.value"></label>
  <input name="pass" type="password" aria-label="Passwort" style="opacity:0">`,
);

/** A page that fills and submits its own form, without the user */
const scriptSubmit = (how: "submit" | "requestSubmit") =>
  `${loginForm("Automatik")}<script>setTimeout(() => { const f = document.forms[0];
    f.user.value = "${USERNAME}"; f.pass.value = "Von-Skript-1!"; f.${how}(); }, 300);</script>`;

const WELCOME = `<!doctype html><html lang="de"><title>Willkommen</title><h1>Willkommen</h1>`;

const PAGES: Record<string, string> = {
  [`${PORTAL}/login`]: loginForm("Portal"),
  [`${PORTAL}/password`]: loginForm(
    "Passwort ändern",
    `<label>Aktuelles Passwort <input name="old" type="password" autocomplete="current-password"></label>
    <label>Neues Passwort <input name="new" type="password" autocomplete="new-password"></label>
    <label>Wiederholen <input name="again" type="password" autocomplete="new-password"></label>`,
  ),
  [`${SITE("shop")}/login`]: loginForm("Shop"),
  [`${SITE("lager")}/login`]: scriptLogin,
  [`${SITE("werkstatt")}/login`]: loginForm("Werkstatt"),
  [`${SITE("bestellung")}/login`]: loginForm("Bestellung"),
  [`${SITE("newsletter")}/login`]: hiddenPassword,
  [`${SITE("automatik")}/submit`]: scriptSubmit("submit"),
  [`${SITE("automatik")}/request`]: scriptSubmit("requestSubmit"),
};

type Area = { get(keys: null): Promise<Record<string, unknown>> };
type Chrome = { storage: { session: Area; local: Area } };

const isPrompt = (frame: Frame) =>
  frame.url().startsWith("chrome-extension://") && frame.url().includes("/src/prompt/prompt.html");

/** The prompt's frame once the content script opened it */
const promptIn = async (page: Page) => {
  await expect.poll(() => page.frames().some(isPrompt), { timeout: 20_000 }).toBe(true);
  return page.frames().find(isPrompt) as Frame;
};

/** Whether the page ever showed the prompt (it starts hidden; see the init script below) */
const everShown = (page: Page) =>
  page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown === true);

/** Waits long enough for a prompt to come, then checks that none was shown */
const expectNoPrompt = async (page: Page) => {
  await page.waitForTimeout(4_000);
  expect(await everShown(page)).toBe(false);
};

/** Signs in on a form page the way a person does: types, then Enter in the password field */
const signIn = async (page: Page, url: string, username: string, password: string) => {
  await page.goto(url);
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Willkommen" })).toBeVisible();
};

/** Waits until the shown prompt takes clicks */
const armedPrompt = async (page: Page, title: string) => {
  const prompt = await promptIn(page);
  await expect(prompt.getByText(title)).toBeVisible({ timeout: 30_000 });
  await expect(prompt.locator("main")).toHaveAttribute("data-armed", "true");
  return prompt;
};

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

/** The entries the popup lists for the tab's host */
const popupForHost = async (context: BrowserContext, host: string) => {
  const popup = await openPopup(context);
  const region = popup.getByRole("region", { name: `Für ${host}` });
  await expect(region).toBeVisible({ timeout: 30_000 });
  return { popup, region, items: region.getByRole("listitem") };
};

test.describe
  .serial("saving and updating logins", () => {
    let context: BrowserContext;
    let close = async () => {};
    let tab: Page;
    let device = "";

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      const web = await newDevice(browser);
      const owner = await setUpCompany(web);
      await addEntry(web, {
        title: "Großhandel Portal",
        username: USERNAME,
        password: OLD_PASSWORD,
        website: `${PORTAL}/login`,
      });
      await web.context().close();
      device = owner.device;
      const { accountId } = JSON.parse(owner.device) as { accountId: string };

      ({ context, close } = await launchExtension("de-DE", "light", "e2e"));
      await context.route("https://*.test/**", (route) => {
        const url = new URL(route.request().url());
        const body = url.pathname === "/welcome" ? WELCOME : PAGES[`${url.origin}${url.pathname}`];
        return body
          ? route.fulfill({ contentType: "text/html", body })
          : route.fulfill({ status: 404, body: "" });
      });
      // What the page itself can see: whether the prompt's element was ever shown. The document,
      // not its root element: an init script runs before the parser has made that
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

    test("offers a new login after a sign-in, saves it, and the popup shows it", async () => {
      await signIn(tab, `${SITE("shop")}/login`, USERNAME, "Shop-Kessel-1!");
      const prompt = await armedPrompt(tab, "Login speichern?");
      await expect(prompt.locator("header")).toContainText("shop.weber-haustechnik.test");
      await expect(prompt.getByText(USERNAME)).toBeVisible();
      // What the tests that expect no prompt read sees this one (expectNoPrompt)
      expect(await everShown(tab)).toBe(true);
      // The page sees neither the prompt's content nor its frame
      expect(
        await tab.evaluate(() => [
          document.querySelector("kennwort-save")?.shadowRoot ?? null,
          document.querySelectorAll("iframe").length,
          document.documentElement.outerHTML.includes("Shop-Kessel-1!"),
        ]),
      ).toEqual([null, 0, false]);
      await prompt.getByRole("button", { name: "Speichern" }).click();
      await expect(prompt.getByText("Gespeichert.")).toBeVisible();
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);

      const { popup, items } = await popupForHost(context, "shop.weber-haustechnik.test");
      await expect(items).toHaveText([/shop\.weber-haustechnik\.test/], { timeout: 30_000 });
      await popup.close();
    });

    test("offers a new login after a sign-in by script on a page that stays", async () => {
      await tab.goto(`${SITE("lager")}/login`);
      await tab.getByLabel("Benutzername").fill("lager");
      await tab.getByLabel("Passwort", { exact: true }).fill("Regal-Palette-3!");
      await tab.keyboard.press("Escape");
      await tab.getByRole("button", { name: "Anmelden" }).click();
      await expect(tab.getByText("Willkommen")).toBeVisible();
      const prompt = await armedPrompt(tab, "Login speichern?");
      await expect(prompt.getByText("lager", { exact: true })).toBeVisible();
    });

    test("does not save while the page covers the prompt", async () => {
      // The prompt of the page that stays (above) is still open
      const prompt = await armedPrompt(tab, "Login speichern?");
      const save = prompt.getByRole("button", { name: "Speichern" });
      await tab.evaluate(() => {
        const box = document.querySelector("kennwort-save")?.getBoundingClientRect();
        if (!box) throw new Error("no prompt");
        const cover = document.createElement("div");
        cover.id = "cover";
        cover.popover = "manual";
        cover.textContent = "Gewinnspiel: Jetzt klicken!";
        cover.style.cssText = `position:fixed;inset:auto;margin:0;border:0;padding:0;
          background:#fff;pointer-events:none;left:${box.left}px;top:${box.top}px;
          width:${box.width}px;height:${box.height}px`;
        document.body.append(cover);
        cover.showPopover();
      });
      await expect(prompt.locator("main")).toHaveAttribute("data-armed", "false");
      const box = await save.boundingBox();
      if (!box) throw new Error("the button has no box");
      await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(prompt.getByRole("alert")).toHaveText(HIDDEN);
      const { popup, region } = await popupForHost(context, "lager.weber-haustechnik.test");
      await expect(region).toContainText("Keine Einträge für diese Seite.");
      await popup.close();

      // Once the page stops, the same click saves: the defences refused, nothing else did
      await tab.evaluate(() => document.getElementById("cover")?.remove());
      await expect(prompt.locator("main")).toHaveAttribute("data-armed", "true");
      await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(prompt.getByText("Gespeichert.")).toBeVisible();
    });

    test("offers to update a changed password and keeps the old one in the history", async ({
      browser,
    }) => {
      await signIn(tab, `${PORTAL}/login`, USERNAME, NEW_PASSWORD);
      const prompt = await armedPrompt(tab, "Passwort aktualisieren?");
      await expect(prompt.getByText("Großhandel Portal")).toBeVisible();
      await prompt.getByRole("button", { name: "Aktualisieren" }).click();
      await expect(prompt.getByText(/^Aktualisiert\./)).toBeVisible();

      // In the web app the old password is under Frühere Passwörter
      const web = await newDevice(browser);
      await web.addInitScript((known) => localStorage.setItem("kennwort-device", known), device);
      await web.goto("/");
      await unlock(web);
      await web
        .getByRole("option", { name: /Großhandel Portal/ })
        .first()
        .click();
      const earlier = web.getByRole("region", { name: "Frühere Passwörter" });
      await expect(earlier).toContainText("Passwort bis");
      await earlier.getByRole("button", { name: /^Passwort bis .+ aufdecken$/ }).click();
      await expect(earlier).toContainText(OLD_PASSWORD);
      await web.context().close();
    });

    test("offers nothing for the same password", async () => {
      await signIn(tab, `${PORTAL}/login`, USERNAME, NEW_PASSWORD);
      await expectNoPrompt(tab);
    });

    test("offers an update from a change-password form, also without a user name", async () => {
      await tab.goto(`${PORTAL}/password`);
      await tab.getByLabel("Aktuelles Passwort").fill(NEW_PASSWORD);
      await tab.getByLabel("Neues Passwort").fill("Kupfer-Rohr-19!");
      await tab.getByLabel("Wiederholen").fill("Kupfer-Rohr-19!");
      await tab.getByLabel("Wiederholen").press("Enter");
      await expect(tab.getByRole("heading", { name: "Willkommen" })).toBeVisible();
      const prompt = await armedPrompt(tab, "Passwort aktualisieren?");
      await expect(prompt.getByText("Großhandel Portal")).toBeVisible();
      await prompt.getByRole("button", { name: "Schließen" }).click();
      await expect.poll(() => tab.frames().some(isPrompt)).toBe(false);
    });

    test("does not capture a password field the page hides", async () => {
      await tab.goto(`${SITE("newsletter")}/login`);
      await tab.getByLabel("Benutzername").fill(USERNAME);
      await tab.getByLabel("Benutzername").press("Enter");
      await expect(tab.getByRole("heading", { name: "Willkommen" })).toBeVisible();
      await expectNoPrompt(tab);
    });

    test("does not capture a submit the page makes by script", async () => {
      for (const path of ["/submit", "/request"]) {
        await tab.goto(`${SITE("automatik")}${path}`);
        await expect(tab.getByRole("heading", { name: "Willkommen" })).toBeVisible();
        await expectNoPrompt(tab);
      }
    });

    test("never offers again for a site put on the never list, kept in the account state", async () => {
      const site = `${SITE("werkstatt")}/login`;
      await signIn(tab, site, USERNAME, "Werkbank-Hobel-4!");
      const prompt = await armedPrompt(tab, "Login speichern?");
      await prompt.getByRole("button", { name: "Nie für diese Seite" }).click();
      await expect.poll(() => tab.frames().some(isPrompt), { timeout: 10_000 }).toBe(false);

      await signIn(tab, site, USERNAME, "Werkbank-Hobel-5!");
      await expectNoPrompt(tab);
      // Another site still gets the offer
      await signIn(tab, `${SITE("bestellung")}/login`, USERNAME, "Bestell-Liste-6!");
      await armedPrompt(tab, "Login speichern?");

      // Nothing on the disk, and neither the site nor a password in plain text in the session area
      const areas = await (await extensionWorker(context)).evaluate(async () => {
        const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
        return {
          session: JSON.stringify(await chrome.storage.session.get(null)),
          local: await chrome.storage.local.get(null),
        };
      });
      expect(areas.local).toEqual({});
      for (const secret of ["werkstatt", "Werkbank-Hobel", "Bestell-Liste", NEW_PASSWORD])
        expect(areas.session).not.toContain(secret);
    });
  });
