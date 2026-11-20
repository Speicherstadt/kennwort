import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// K-301: every component of packages/ui can be used with the keyboard alone, and axe finds nothing,
// in light and dark, also with the floating parts open (apps/web/components.html)

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};

// The showcase's own texts are German test data; the components' texts follow the browser
test.use({ locale: "de-DE" });

test.beforeEach(async ({ page }) => {
  await page.goto("/components.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Komponenten");
});

test.describe("axe", { tag: "@phone" }, () => {
  for (const scheme of ["light", "dark"] as const)
    test(`finds nothing in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await axe(page);
    });

  test("finds nothing with the dialog, the menu and the combobox open", async ({ page }) => {
    await page.getByRole("button", { name: "Eintrag löschen …" }).click();
    await axe(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Aktionen" }).click();
    await axe(page);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Tresor" }).fill("b");
    await axe(page);
  });
});

test("a button works with Enter, and its toast stays while focused and closes from the keyboard", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Passwort kopieren" }).focus();
  await page.keyboard.press("Enter");
  const status = page.getByRole("status");
  await expect(status).toContainText("Passwort kopiert");
  // The toasts are a landmark at the end of the page; their close button is in the tab order
  const region = page.getByRole("region", { name: "Benachrichtigungen" });
  await region.getByRole("button", { name: "Schließen" }).focus();
  await page.waitForTimeout(5500);
  await expect(status).toContainText("Passwort kopiert");
  await page.keyboard.press("Enter");
  await expect(status).not.toContainText("Passwort kopiert");
});

test("the search takes the focus on /", async ({ page }) => {
  await page.locator("body").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Einträge durchsuchen" })).toBeFocused();
});

test("the dialog keeps the focus inside, closes on Esc and gives the focus back", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Eintrag löschen …" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Eintrag löschen?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    "Sparkasse wird für alle im Tresor Büro gelöscht.",
  );
  for (const key of [
    "Tab",
    "Tab",
    "Tab",
    "Tab",
    "Shift+Tab",
    "Shift+Tab",
    "Shift+Tab",
    "Shift+Tab",
  ]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("the menu opens with the first item focused, moves with arrows, Home and End, and chooses with Enter", async ({
  page,
}) => {
  const button = page.getByRole("button", { name: "Aktionen" });
  await button.focus();
  await page.keyboard.press("Enter");
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chosen")).toHaveText("Kopieren");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(button).toBeFocused();
});

test("the popover opens on Enter and closes on Esc", async ({ page }) => {
  await page.getByRole("button", { name: "Zugriff" }).focus();
  await page.keyboard.press("Enter");
  const text = page.getByText("Jonas, Anna und Sandra können diesen Eintrag sehen.");
  await expect(text).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(text).toBeHidden();
});

test("the tooltip shows on focus, describes its trigger and hides on Esc", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Geprüft" });
  await trigger.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(trigger).toHaveAccessibleDescription("Mitgliedschaft signiert · Kette geprüft");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("the combobox filters, moves with the arrows and takes an option with Enter", async ({
  page,
}) => {
  const box = page.getByRole("combobox", { name: "Tresor" });
  await box.focus();
  await page.keyboard.type("bu");
  const options = page.getByRole("listbox", { name: "Tresor" }).getByRole("option");
  await expect(options).toHaveText(["Buchhaltung"]);
  await page.keyboard.press("Backspace");
  await expect(options).toHaveText(["Büro", "Buchhaltung", "Baustellen-Tablets"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("vault")).toHaveText("Buchhaltung");
  await expect(box).toHaveValue("Buchhaltung");
  await expect(page.getByRole("listbox", { name: "Tresor" })).toBeHidden();
});

test("the list moves the selection with the arrows", async ({ page }) => {
  const list = page.getByRole("listbox", { name: "Einträge" });
  await list.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option", { selected: true })).toContainText("Mail info@");
  await page.keyboard.press("End");
  await expect(list.getByRole("option", { selected: true })).toContainText("WLAN Büro");
});

test("the tabs move with the arrows and show their panel", async ({ page }) => {
  await page.getByRole("tab", { name: "Felder" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Zugriff" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveText("Jonas, Anna, Sandra");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel")).toBeFocused();
});

// Regressions from the review of K-301
test("axe with the combobox showing no matches", async ({ page }) => {
  await page.getByRole("combobox", { name: "Tresor" }).fill("zzz");
  await expect(page.getByText("Keine Treffer")).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
});

test("a hovered tooltip hides on Esc", async ({ page }) => {
  await page.getByRole("button", { name: "Geprüft" }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("a hovered tooltip stays while the pointer moves onto it", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Geprüft" });
  await trigger.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  if (!box) throw new Error("tooltip has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await expect(tip).toBeVisible();
});
