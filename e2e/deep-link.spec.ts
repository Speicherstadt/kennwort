import { expect } from "@playwright/test";
import { test, unlock } from "./account.ts";
import { createVault, heading } from "./company.ts";

// K-604: another app opens a vault by its ID; the link carries no secret and opens nothing locked
test.use({ locale: "de-DE" });

test("a deep link of another app opens a vault by its ID, after unlocking @phone", async ({
  page,
  open,
}) => {
  await open("/vaults");
  const url = await createVault(page, "Büro");
  const id = url.split("/").at(-1) ?? "";
  expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  await page.goto(`/open?link=${encodeURIComponent(`web+kennwort://vault/${id}`)}`);
  await expect(heading(page, "Kennwort ist gesperrt")).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/vaults/${id}`);
  await unlock(page);
  await expect(heading(page, "Büro")).toBeVisible();
  // Anything that is no deep link leads to all entries
  await page.goto(`/open?link=${encodeURIComponent("https://evil.test/x")}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/entries");
});
