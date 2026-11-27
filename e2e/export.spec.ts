import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { setUpCompany, test } from "./account.ts";
import { annaJoins, heading } from "./company.ts";
import { addEntry } from "./entries.ts";

// K-504: Jonas, the owner, takes the company's entries out as Kennwort's encrypted JSON, brings
// the file back in, and the audit log names the export; Anna, a member, has no export at all
test.use({ locale: "de-DE" });

const PASSPHRASE = "Kessel Rohr Ventil Export";
const SECRET = "Steuer-Kessel-Rohr-2026!";

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
};
const settings = async (page: Page) => {
  await page.getByRole("link", { name: "Einstellungen" }).filter({ visible: true }).first().click();
  await page.getByRole("tab", { name: "Daten" }).click();
};

/** Everything the page sent to the server, as text */
const recordRequests = (page: Page) => {
  const bodies: string[] = [];
  page.on("request", (request) => bodies.push(`${request.url()} ${request.postData() ?? ""}`));
  return bodies;
};

test.describe("export", { tag: "@phone" }, () => {
  test("Jonas exports an encrypted JSON, the audit log names it, and he imports it again", async ({
    page,
    request,
  }, testInfo) => {
    const owner = await setUpCompany(page);
    await addEntry(page, {
      title: "DATEV Unternehmen online",
      username: "jonas.weber",
      password: SECRET,
      website: "https://datev.test",
    });
    const sent = recordRequests(page);
    await settings(page);
    await page.getByRole("button", { name: "Exportieren" }).click();
    await expect(heading(page, "Exportieren")).toBeVisible();
    await expect(page.getByLabel("Was exportieren")).toHaveValue("all");
    await expect(page.getByLabel("Verschlüsseltes JSON (empfohlen)")).toBeChecked();
    await axe(page);

    // CSV first: the page warns that it is plain text
    await page.getByLabel("CSV im Bitwarden-Format (unverschlüsselt)").check();
    await expect(page.getByRole("note")).toContainText("Die CSV-Datei ist nicht verschlüsselt");
    await page.getByLabel("Verschlüsseltes JSON (empfohlen)").check();

    await page.getByLabel("Passphrase für die Datei").fill(PASSPHRASE);
    await page.getByLabel("Passphrase wiederholen").fill(PASSPHRASE);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportieren", exact: true }).last().click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^kennwort-export-\d{4}-\d{2}-\d{2}\.json$/);
    const file = testInfo.outputPath("kennwort-export.json");
    await download.saveAs(file);
    await expect(page.getByText("Export fertig")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/1 Eintrag steht in kennwort-export-/)).toBeVisible();
    await axe(page);

    // The audit log for auditors names Jonas, the format and the scope
    const audit = await request.get("/api/audit", {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const { events } = (await audit.json()) as {
      events: { action: string; actor: string; subject: string; signature: string }[];
    };
    const exported = events.filter((e) => e.action === "export");
    expect(exported).toHaveLength(1);
    expect(exported[0]?.subject).toMatch(/^kennwort-json\/all\/[A-Za-z0-9_-]{22}$/);
    expect(exported[0]?.signature.length).toBeGreaterThan(80);

    // Nothing but the audit event went to the server: neither the passphrase nor a secret
    expect(sent.join("\n")).not.toContain(PASSPHRASE);
    expect(sent.join("\n")).not.toContain(SECRET);

    // Back in: Kennwort's own export is an import format, opened with its passphrase
    await settings(page);
    await page.getByRole("button", { name: "Importieren" }).click();
    await page.getByRole("button", { name: "Kennwort (JSON)", exact: true }).click();
    await page.getByLabel("Exportdatei (.json) wählen").setInputFiles(file);
    await page.getByLabel("Passphrase des Exports").fill("falsch");
    await page.getByRole("button", { name: "Export öffnen" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Die Passphrase passt nicht zu diesem Export.",
      { timeout: 20_000 },
    );
    await page.getByLabel("Exportdatei (.json) wählen").setInputFiles(file);
    await page.getByLabel("Passphrase des Exports").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Export öffnen" }).click();
    await expect(page.getByText("1 Eintrag in der Datei")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("1 Eintrag gibt es schon und wird übersprungen.")).toBeVisible();
    await page.getByLabel("DATEV Unternehmen online trotzdem importieren").check();
    await page.getByRole("button", { name: "1 Eintrag importieren" }).click();
    await expect(page.getByText("Import fertig")).toBeVisible();
    expect(sent.join("\n")).not.toContain(SECRET);

    await page.getByRole("link", { name: "Einträge" }).filter({ visible: true }).first().click();
    await expect(page.getByRole("option", { name: /DATEV Unternehmen online/ })).toHaveCount(2);
  });

  test("Anna, a member, finds no export, and the page tells her why", async ({ page, browser }) => {
    await setUpCompany(page);
    const anna = await annaJoins(page, browser);
    await settings(anna);
    await expect(anna.getByRole("button", { name: "Importieren" })).toBeVisible();
    await expect(anna.getByRole("button", { name: "Exportieren" })).toHaveCount(0);
    await anna.evaluate(() => {
      history.pushState(null, "", "/export");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(heading(anna, "Exportieren")).toBeVisible();
    await expect(
      anna.getByText("Exportieren dürfen nur Inhaber und Admins der Firma."),
    ).toBeVisible();
    await expect(anna.getByLabel("Passphrase für die Datei")).toHaveCount(0);
  });
});
