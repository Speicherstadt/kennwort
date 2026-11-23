import { createHmac } from "node:crypto";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { addEntry, goInApp } from "./entries.ts";
import { QR, qrPng } from "./qr.ts";

// K-501: Jonas brings the company's logins from Bitwarden, Chrome and a spreadsheet into Kennwort;
// K-502: and KeePassXC's database and a password-protected Bitwarden export; K-503: and the
// one-time codes from Google Authenticator and 2FAS, into the logins they belong to (K-503 Teil 2)
test.use({ locale: "de-DE" });

const fixture = (name: string) => join(import.meta.dirname, "fixtures", name);
/** The ZIP containers of K-502 Teil 2, as the parsers' own tests read them */
const coreFixture = (name: string) =>
  join(import.meta.dirname, "..", "packages", "core", "src", "import", "fixtures", name);

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const visibleLink = (page: Page, name: string | RegExp) =>
  page.getByRole("link", { name }).filter({ visible: true }).first();
const option = (page: Page, title: string) => page.getByRole("option", { name: new RegExp(title) });
const rows = (page: Page) => page.getByRole("list", { name: "Einträge in der Datei" });

/** Settings, then „Importieren“, then the vendor and the file */
const importFile = async (page: Page, vendor: string, file: string) => {
  await visibleLink(page, "Einstellungen").click();
  await page.getByRole("button", { name: "Importieren" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Importieren" })).toBeVisible();
  await page.getByRole("button", { name: vendor, exact: true }).click();
  await expect(page.getByText("So kommst du an die Exportdatei")).toBeVisible();
  await page.getByLabel("Exportdatei wählen").setInputFiles(file);
};

/** Everything the page sent to the server, as text */
const recordRequests = (page: Page) => {
  const bodies: string[] = [];
  page.on("request", (request) => bodies.push(`${request.url()} ${request.postData() ?? ""}`));
  return bodies;
};

// The key of the DATEV account in the 2FAS backup, JBSWY3DPEHPK3PXP in Base32
const DATEV_KEY = "otpauth://totp/DATEV:jonas?secret=JBSWY3DPEHPK3PXP&issuer=DATEV";
const DATEV_SECRET = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

/** RFC 6238 with SHA-1 and six digits, on Node's own HMAC, as in totp.spec.ts */
const expectedCode = (key: Buffer, ms: number) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(ms / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = (mac.at(-1) as number) & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
};

/** A login with a one-time code, through the app's own dialog; gives its ID */
const addLoginWithCode = async (page: Page, title: string, username: string, key: string) => {
  // A phone shows the detail of the last entry made: back to the list first
  await visibleLink(page, "Einträge").click();
  await page
    .getByRole("button", { name: "Neu", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("form", { name: "Neuer Eintrag" });
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByLabel("Benutzername").fill(username);
  await dialog.getByLabel("Einmalcode", { exact: true }).fill(key);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop() ?? "";
};

const finish = async (page: Page, count: string) => {
  await page.getByRole("button", { name: count }).click();
  await expect(page.getByText("Import fertig")).toBeVisible();
  await expect(page.getByRole("note")).toContainText(
    "Lösche jetzt die Exportdatei, auch aus Downloads und Papierkorb",
  );
};

test.describe("import", { tag: "@phone" }, () => {
  test("Jonas imports a Bitwarden export; the weak password ends up under Zum Ändern", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await importFile(page, "Bitwarden (JSON)", fixture("import-bitwarden.json"));
    await expect(page.getByText("3 Einträge in der Datei")).toBeVisible();
    await expect(page.getByRole("list", { name: "Arten" })).toContainText("Login: 2");
    const router = rows(page).getByRole("listitem").filter({ hasText: "Router Lager" });
    await expect(router).toContainText("schwach");
    await expect(rows(page)).not.toContainText("sommer2019");
    await page.getByLabel("Ordner als Tags übernehmen").check();
    await axe(page);
    await finish(page, "3 Einträge importieren");
    await expect(page.getByText("3 Einträge importiert.")).toBeVisible();
    await axe(page);

    // Only ciphertext went to the server
    expect(sent.join("\n")).not.toContain("Steuer-Kessel-Rohr-2026!");
    expect(sent.join("\n")).not.toContain("Alarmanlage");

    await page
      .getByRole("link", { name: "Schwache Passwörter unter „Zum Ändern“ ansehen" })
      .click();
    await expect(option(page, "Router Lager")).toBeVisible();
    await expect(option(page, "DATEV")).toHaveCount(0);
    await visibleLink(page, "Einträge").click();
    await option(page, "DATEV Unternehmen online").click();
    await expect(page.getByRole("list", { name: "Tags" })).toHaveText("Büro");
  });

  test("Jonas imports his Chrome passwords and skips the login he already has", async ({
    page,
  }) => {
    await setUpCompany(page);
    await addEntry(page, {
      title: "Sparkasse",
      username: "weber",
      password: "Rohr-Ventil-Pumpe-2026!",
      website: "https://sparkasse.test",
    });
    await importFile(page, "Chrome / Edge / Brave / Opera (CSV)", fixture("import-chrome.csv"));
    const sparkasse = rows(page).getByRole("listitem").filter({ hasText: "Sparkasse" });
    await expect(sparkasse).toContainText("doppelt");
    await expect(page.getByText("1 Eintrag gibt es schon und wird übersprungen.")).toBeVisible();
    await finish(page, "1 Eintrag importieren");
    await expect(
      page.getByRole("link", { name: "Schwache Passwörter unter „Zum Ändern“ ansehen" }),
    ).toHaveCount(0);

    await visibleLink(page, "Einträge").click();
    await expect(option(page, "grosshandel.test")).toBeVisible();
    await expect(option(page, "Sparkasse")).toHaveCount(1);
  });

  test("Jonas maps the columns of a spreadsheet and imports it", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "Andere Tabelle (CSV)", fixture("import-table.csv"));
    await expect(page.getByRole("heading", { name: "Spalten zuordnen" })).toBeVisible();
    await page.getByLabel("Titel").selectOption("Bezeichnung");
    await page.getByLabel("Benutzername").selectOption("Kennung");
    await page.getByLabel("Passwort").selectOption("Geheimwort");
    await axe(page);
    await page.getByRole("button", { name: "Weiter" }).click();
    const nas = rows(page).getByRole("listitem").filter({ hasText: "NAS Büro" });
    await expect(nas).toContainText("admin");
    await finish(page, "1 Eintrag importieren");

    await visibleLink(page, "Einträge").click();
    await option(page, "NAS Büro").click();
    await expect(page.getByRole("heading", { level: 1, name: "NAS Büro" })).toBeVisible();
  });

  test("Jonas imports the company's 1PUX from 1Password, unpacked in the browser", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await importFile(page, "1Password (1PUX)", coreFixture("onepassword.1pux"));
    await expect(page.getByText("12 Einträge in der Datei")).toBeVisible();
    await expect(rows(page)).toContainText("Großhandel-Portal");
    await expect(rows(page)).not.toContainText("Sommer2026!Heizung");
    await finish(page, "12 Einträge importieren");
    expect(sent.join("\n")).not.toContain("Sommer2026!Heizung");

    await visibleLink(page, "Einträge").click();
    await option(page, "Werkstatt-WLAN").click();
    await expect(page.getByRole("heading", { level: 1, name: "Werkstatt-WLAN" })).toBeVisible();
  });

  // K-502 Teil 5: Team Password Manager's CSV, its projects as folders and then as tags
  test("Jonas imports the Team Password Manager export with its projects as tags", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await importFile(page, "Team Password Manager (CSV)", coreFixture("teampasswordmanager.csv"));
    await expect(page.getByText("5 Einträge in der Datei")).toBeVisible();
    await expect(rows(page)).toContainText("DATEV Unternehmen online");
    await expect(rows(page)).not.toContainText("Kessel-Rohr-Ventil-26");
    await page.getByLabel("Ordner als Tags übernehmen").check();
    await axe(page);
    await finish(page, "5 Einträge importieren");
    expect(sent.join("\n")).not.toContain("Kessel-Rohr-Ventil-26");

    await visibleLink(page, "Einträge").click();
    await option(page, "DATEV Unternehmen online").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "DATEV Unternehmen online" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Tags" })).toContainText("Büro");
    await expect(page.getByRole("list", { name: "Tags" })).toContainText("Steuern");
  });

  // A copy of the KeePassXC database with a cheap KDF (Argon2id, 1 MiB): KeePassXC's own AES-KDF
  // of a second per attempt takes several in a browser on CI; the Vitest tests open that one
  test("Jonas opens the company's KeePass database with password and key file", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await visibleLink(page, "Einstellungen").click();
    await page.getByRole("button", { name: "Importieren" }).click();
    await page.getByRole("button", { name: "KeePass / KeePassXC (KDBX)", exact: true }).click();
    await page
      .getByLabel("Datenbank (.kdbx) wählen")
      .setInputFiles(coreFixture("kdbx-keyfile-v1.kdbx"));
    const password = page.getByLabel("Master-Passwort");
    await password.fill("Weber-Haustechnik-2026");
    await axe(page);
    // Without the key file the database does not open
    await page.getByRole("button", { name: "Datenbank öffnen" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Passwort oder Schlüsseldatei passen nicht zu dieser Datenbank.",
    );
    await expect(password).toHaveValue("");

    await page
      .getByLabel("Datenbank (.kdbx) wählen")
      .setInputFiles(coreFixture("kdbx-keyfile-v1.kdbx"));
    await page
      .getByLabel("Schlüsseldatei (nur wenn die Datenbank eine hat)")
      .setInputFiles(coreFixture("kdbx-key-v1.key"));
    await password.fill("Weber-Haustechnik-2026");
    await page.getByRole("button", { name: "Datenbank öffnen" }).click();
    await expect(page.getByText("4 Einträge in der Datei")).toBeVisible();
    await expect(rows(page)).toContainText("Wärmepumpen-Portal");
    await expect(rows(page)).not.toContainText("Gelöschter Zugang");
    await expect(rows(page)).not.toContainText("Bilanz#2026-Anna");
    await finish(page, "4 Einträge importieren");
    // Neither the master password nor a secret of the database went to the server
    expect(sent.join("\n")).not.toContain("Weber-Haustechnik-2026");
    expect(sent.join("\n")).not.toContain("Bilanz#2026-Anna");

    await visibleLink(page, "Einträge").click();
    await option(page, "Lohnbüro Sandra").click();
    await expect(page.getByRole("heading", { level: 1, name: "Lohnbüro Sandra" })).toBeVisible();
  });

  // K-502 Teil 4: a password-protected Bitwarden export, with the cheapest PBKDF2 Bitwarden
  // imports (5 000 iterations) so the browser stays quick; the Vitest tests take the costlier ones
  test("Jonas opens a password-protected Bitwarden export, after a wrong password", async ({
    page,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await importFile(page, "Bitwarden (JSON)", fixture("import-bitwarden-protected.json"));
    await expect(page.getByText("Gewählte Datei: import-bitwarden-protected.json")).toBeVisible();
    const password = page.getByLabel("Export-Passwort");
    await password.fill("Weber-Haustechnik");
    await axe(page);
    await page.getByRole("button", { name: "Export öffnen" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Das Passwort passt nicht zu dieser Datei. Prüfe es und versuche es noch einmal.",
    );
    await expect(password).toHaveValue("");

    await password.fill("Weber-Haustechnik-2026");
    await page.getByRole("button", { name: "Export öffnen" }).click();
    await expect(page.getByText("3 Einträge in der Datei")).toBeVisible();
    await expect(rows(page)).toContainText("DATEV Unternehmen online");
    await expect(rows(page)).not.toContainText("Steuer-Kessel-Rohr-2026!");
    await finish(page, "3 Einträge importieren");
    // Neither the export password nor a secret of the export went to the server
    expect(sent.join("\n")).not.toContain("Weber-Haustechnik-2026");
    expect(sent.join("\n")).not.toContain("Steuer-Kessel-Rohr-2026!");
  });

  test("Jonas brings the team's one-time codes from Google Authenticator's two export QR codes", async ({
    page,
    browser,
  }) => {
    await setUpCompany(page);
    const sent = recordRequests(page);
    await visibleLink(page, "Einstellungen").click();
    await page.getByRole("button", { name: "Importieren" }).click();
    await page.getByRole("button", { name: "Google Authenticator (QR-Code)", exact: true }).click();
    // The app has other live regions (notifications); this one counts the codes
    const progress = page.getByRole("status").filter({ hasText: "QR-Code" });
    await expect(progress).toHaveText("Noch kein QR-Code gelesen.");
    await axe(page);
    const scan = page.getByRole("dialog", { name: "QR-Code scannen" });
    for (const [code, read] of [
      [QR.google1, "1 von 2 QR-Codes gelesen"],
      [QR.google2, "2 von 2 QR-Codes gelesen"],
    ] as const) {
      await page.getByRole("button", { name: "QR-Code scannen" }).click();
      await scan.getByLabel("Bild wählen").setInputFiles({
        name: "export.png",
        mimeType: "image/png",
        buffer: await qrPng(browser, code.rows, 6),
      });
      await expect(scan).toBeHidden();
      await expect(progress).toHaveText(read);
    }
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByText("3 Einträge in der Datei")).toBeVisible();
    await expect(page.getByText("1 Code übernimmt Kennwort nicht")).toBeVisible();
    await expect(rows(page)).not.toContainText("JBSWY3DPEHPK3PXP");
    await axe(page);
    await finish(page, "3 Einträge importieren");
    expect(sent.join("\n")).not.toContain("JBSWY3DPEHPK3PXP");

    await visibleLink(page, "Einträge").click();
    await option(page, "DATEV").click();
    await expect(page.getByRole("region", { name: "Felder" })).toContainText(/\d{3} \d{3}/);
  });

  test("Jonas imports a 2FAS backup; an encrypted one says so", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "2FAS (.2fas)", coreFixture("twofas-encrypted.2fas"));
    await expect(page.getByRole("alert")).toHaveText(
      "Diese Datei ist verschlüsselt – exportiere unverschlüsselt.",
    );
    await page.getByLabel("Exportdatei wählen").setInputFiles(coreFixture("twofas.2fas"));
    await expect(page.getByText("3 Einträge in der Datei")).toBeVisible();
    await expect(page.getByText("2 Codes übernimmt Kennwort nicht")).toBeVisible();
    await finish(page, "3 Einträge importieren");
    await visibleLink(page, "Einträge").click();
    await expect(option(page, "Großhandel-Portal")).toBeVisible();
  });

  test("Jonas puts the 2FAS codes into the logins he has; another code is not overwritten", async ({
    page,
  }) => {
    await setUpCompany(page);
    const datev = await addEntry(page, {
      title: "DATEV",
      username: "jonas@weber-haustechnik.example",
      password: "Steuer-Kessel-Rohr-2026!",
      website: "https://www.datev.de",
    });
    // Sandra's portal login has a code already, another one than the backup's
    const portal = await addLoginWithCode(page, "Großhandel-Portal", "sandra.becker", DATEV_KEY);
    await importFile(page, "2FAS (.2fas)", coreFixture("twofas.2fas"));
    const into = page.getByRole("radio", {
      name: "Zu »DATEV« (jonas@weber-haustechnik.example) hinzufügen",
    });
    await expect(into).toBeChecked();
    await expect(page.getByText("1 Code kommt in einen vorhandenen Login.")).toBeVisible();
    const conflict = rows(page).getByRole("listitem").filter({ hasText: "anderer Code" });
    await expect(conflict).toContainText(
      "»Großhandel-Portal« (sandra.becker) hat schon einen anderen Einmalcode. Kennwort überschreibt ihn nicht",
    );
    await expect(conflict.getByRole("radio")).toHaveCount(0);
    await axe(page);
    await finish(page, "3 Einträge importieren");

    await visibleLink(page, "Einträge").click();
    await expect(option(page, "DATEV")).toHaveCount(1);
    await expect(option(page, "Großhandel-Portal")).toHaveCount(2);
    const at = (Math.floor(Date.now() / 30_000) + 1) * 30_000 + 5_000;
    await page.clock.setFixedTime(at);
    const code = expectedCode(DATEV_SECRET, at);
    const fields = page.getByRole("region", { name: "Felder" });
    // The code went into the DATEV login, beside its password
    await goInApp(page, `/entries/${datev}`);
    await expect(fields).toContainText(`${code.slice(0, 3)} ${code.slice(3)}`);
    // Sandra's login still shows its own code, not the backup's seven digits
    await goInApp(page, `/entries/${portal}`);
    await expect(fields).toContainText(`${code.slice(0, 3)} ${code.slice(3)}`);
  });

  test("a loose CSV chosen as a ZIP says it is not one", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "Dashlane (ZIP)", fixture("import-chrome.csv"));
    await expect(page.getByRole("alert")).toHaveText(
      "Das ist keine lesbare ZIP-Datei, oder sie ist beschädigt. Lade den Export neu herunter und wähle ihn, ohne ihn zu entpacken.",
    );
  });

  test("a file of another vendor says what is wrong", async ({ page }) => {
    await setUpCompany(page);
    await importFile(page, "Bitwarden (JSON)", fixture("import-chrome.csv"));
    await expect(page.getByRole("alert")).toHaveText(
      "Das ist keine gültige JSON-Datei. Hast du das richtige Format gewählt?",
    );
  });
});
