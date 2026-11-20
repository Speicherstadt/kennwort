/**
 * Offline lesbar (K-308 part b, P-22): after a sync the device keeps the wrapped account key, the
 * account state and the vaults' ciphertexts in IndexedDB. Without the server – the browser offline,
 * the app from the service worker – it unlocks with the passphrase, reads an entry, says that it is
 * offline and only reads, and syncs again once the server answers. Nothing in IndexedDB is plain
 * text, and signing this device out deletes the copy.
 */
import { expect, type Page, test } from "@playwright/test";
import { PASSPHRASE, setUpCompany, unlock } from "./account.ts";
import { addEntry, goInApp, unique } from "./entries.ts";

test.use({ locale: "de-DE", serviceWorkers: "allow" });

/** Everything in the offline copy, key by key, read with the plain IndexedDB API */
const kept = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve, reject) => {
        const request = indexedDB.open("kennwort-offline", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("copy");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("copy", "readonly");
          const store = transaction.objectStore("copy");
          const keys = store.getAllKeys();
          const values = store.getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve(
              Object.fromEntries(
                keys.result.map((key, i) => [String(key), String(values.result[i])]),
              ),
            );
          };
        };
      }),
  );

/** No known plain text in the copy: not the entry, not the vault's name, not passphrase or key */
const expectOnlyCiphertext = async (page: Page, plaintexts: string[]) => {
  const all = Object.values(await kept(page)).join("\n");
  expect(all.length).toBeGreaterThan(0);
  for (const plain of plaintexts) expect(all).not.toContain(plain);
};

const offlineNotice = (page: Page) => page.getByText("Offline – nur lesen.");

test("unlocks and reads offline from the copy, and logout deletes it", {
  tag: "@phone",
}, async ({ page, context }) => {
  test.slow();
  const owner = await setUpCompany(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const login = {
    title: unique("Stadtwerke"),
    username: "jonas@weber-haustechnik.de",
    password: "Kessel-Rohr-2026!",
    website: "https://stadtwerke-hamburg.de",
  };
  const id = await addEntry(page, login);
  const plaintexts = [
    login.title,
    login.username,
    login.password,
    login.website,
    PASSPHRASE,
    owner.secretKey,
    owner.recoveryKey,
    "Persönlich",
  ];

  await test.step("keeps the checked ciphertexts, and nothing in plain text", async () => {
    await expect
      .poll(async () => Object.keys(await kept(page)).sort())
      .toEqual(expect.arrayContaining(["keys", "state", "read:/api/vaults", "synced"]));
    await expect
      .poll(async () => Object.keys(await kept(page)).some((key) => key.startsWith("records:")))
      .toBe(true);
    await expectOnlyCiphertext(page, plaintexts);
  });

  await test.step("unlocks without the server and reads the entry", async () => {
    await context.setOffline(true);
    const answer = await page.reload();
    expect(answer?.fromServiceWorker()).toBe(true);
    await unlock(page);
    await expect(offlineNotice(page)).toBeVisible();
    await expect(page.getByText(/Letzter Abgleich: /)).toBeVisible();
    await goInApp(page, `/entries/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: login.title })).toBeVisible();
    await page.getByRole("button", { name: "Passwort aufdecken" }).click();
    await expect(page.getByText(login.password)).toBeVisible();
    // Only reading: no change while the server cannot take it
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeDisabled();
    await expectOnlyCiphertext(page, plaintexts);
  });

  await test.step("syncs again once the server answers", async () => {
    await context.setOffline(false);
    await expect(offlineNotice(page)).toBeHidden({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeEnabled();
  });

  await test.step("signing this device out deletes the copy", async () => {
    await page
      .getByRole("link", { name: "Einstellungen" })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("region", { name: "Angemeldete Geräte" })
      .getByRole("button", { name: "Dieses Gerät abmelden" })
      .click();
    await expect(
      page.getByRole("button", { name: "Mit einem anderen Gerät verbinden" }),
    ).toBeVisible();
    await expect.poll(() => kept(page)).toEqual({});
  });
});

test("says the server is unreachable when a device without a copy unlocks offline", async ({
  page,
  context,
}) => {
  await setUpCompany(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(async () => Object.keys(await kept(page))).toContain("state");
  // A copy the browser lost: the account is known, its ciphertexts are not
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("kennwort-offline", 1);
        request.onsuccess = () => {
          const transaction = request.result.transaction("copy", "readwrite");
          const store = transaction.objectStore("copy");
          store.delete("keys");
          store.delete("state");
          transaction.oncomplete = () => resolve();
        };
      }),
  );
  await context.setOffline(true);
  await page.reload();
  await page.locator("input[type=password]").fill(PASSPHRASE);
  await page.locator("input[type=password]").press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Der Server ist nicht erreichbar, und dieses Gerät hat noch keine Kopie zum Entsperren ohne Server.",
    { timeout: 20_000 },
  );
});
