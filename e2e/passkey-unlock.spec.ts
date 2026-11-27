import { expect, type Page, type Request } from "@playwright/test";
import { setUpCompany, test, unlock } from "./account.ts";

test.use({ locale: "de-DE" });

// K-707: unlocking with a passkey (WebAuthn PRF) against the real server, with Chromium's virtual
// authenticator (CDP WebAuthn domain) standing in for the laptop's or phone's own

/** A platform authenticator that signs without a prompt, with or without the PRF extension */
const authenticator = async (page: Page, hasPrf: boolean) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf,
    },
  });
};

const toSettings = async (page: Page, tab = "Geräte und Anmeldung") => {
  const link = page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true });
  await link.first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  await page.getByRole("tab", { name: tab }).click();
};

const lock = async (page: Page) => {
  const button = page
    .getByRole("button", { name: "Sperren", exact: true })
    .filter({ visible: true });
  if ((await button.count()) === 0) await toSettings(page, "Gefahrenzone");
  await button.first().click();
  await expect(page.getByRole("heading", { name: "Kennwort ist gesperrt" })).toBeVisible();
};

/** Every request body the page sends, to show what reached the server */
const recordBodies = (page: Page) => {
  const bodies: { url: string; body: string }[] = [];
  page.on("request", (request: Request) =>
    bodies.push({ url: request.url(), body: request.postData() ?? "" }),
  );
  return bodies;
};

const setUpPasskey = async (page: Page) => {
  await toSettings(page);
  await page.getByRole("button", { name: "Passkey zum Entsperren einrichten" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "entsperrt Kennwort jetzt" }),
  ).toBeVisible();
  await expect(page.getByTestId("passkeys").getByRole("listitem")).toHaveCount(1);
};

test.describe("unlocking with a passkey @phone", () => {
  test("sets up a passkey, locks, unlocks with it, the passphrase still works, removes it", async ({
    page,
  }) => {
    await setUpCompany(page);
    await authenticator(page, true);
    const bodies = recordBodies(page);
    await setUpPasskey(page);

    await lock(page);
    await expect(page.locator("input[type=password]")).toBeVisible();
    await page.getByRole("button", { name: "Mit Passkey entsperren" }).click();
    await expect(page.locator("input[type=password]")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("navigation").first()).toBeAttached();

    // Nothing the authenticator's PRF gave reached the server: no extension results at all
    const ceremonies = bodies.filter((b) => b.url.includes("/auth/passkey/verify-"));
    expect(ceremonies.map((b) => new URL(b.url).pathname)).toEqual([
      "/auth/passkey/verify-registration",
      "/auth/passkey/verify-authentication",
    ]);
    for (const { body } of ceremonies) {
      expect(JSON.parse(body).response.clientExtensionResults).toEqual({});
      expect(body).not.toContain("prf");
    }

    await lock(page);
    await unlock(page);

    await toSettings(page);
    await page.getByTestId("passkeys").getByRole("button", { name: "Entfernen" }).click();
    await expect(page.getByTestId("passkeys")).toHaveCount(0);
    await lock(page);
    await expect(page.getByRole("button", { name: "Mit Passkey entsperren" })).toHaveCount(0);
  });

  test("an authenticator without PRF gets a clear message and no half setup", async ({ page }) => {
    const owner = await setUpCompany(page);
    await authenticator(page, false);
    const bodies = recordBodies(page);
    await toSettings(page);
    await page.getByRole("button", { name: "Passkey zum Entsperren einrichten" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "PRF-Erweiterung" })).toBeVisible();
    await expect(page.getByTestId("passkeys")).toHaveCount(0);
    expect(bodies.some((b) => b.url.includes("/auth/passkey/verify-registration"))).toBe(false);
    expect(bodies.some((b) => b.url.includes("/api/account/unlock-passkeys"))).toBe(false);
    const keys = await page.request.get("/api/account/keys", {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(((await keys.json()) as { unlock: { passkeys: unknown[] } }).unlock.passkeys).toEqual(
      [],
    );
    await lock(page);
    await expect(page.getByRole("button", { name: "Mit Passkey entsperren" })).toHaveCount(0);
  });
});

test.describe("unlocking with a passkey against a lying server", () => {
  test("a tampered sealed account key opens nothing", async ({ page }) => {
    await setUpCompany(page);
    await authenticator(page, true);
    await setUpPasskey(page);
    await lock(page);
    // The server flips one byte of the sealed AK it serves (E-01)
    await page.route("**/api/account/keys", async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as {
        unlock: { passkeys: { credentialId: string; sealed: string }[] };
      };
      for (const way of json.unlock.passkeys) {
        const bytes = Buffer.from(way.sealed, "base64url");
        bytes[30] = (bytes[30] ?? 0) ^ 1;
        way.sealed = bytes.toString("base64url");
      }
      await route.fulfill({ response, json });
    });
    await page.getByRole("button", { name: "Mit Passkey entsperren" }).click();
    await expect(page.getByText("Der Passkey konnte Kennwort nicht entsperren")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
    await page.unroute("**/api/account/keys");
    await unlock(page);
  });
});
