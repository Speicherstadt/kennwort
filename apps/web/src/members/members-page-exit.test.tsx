import type { ReportVault } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { certifiedAnna } from "../vaults/vaults.test-kit.ts";
import { jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import { MembersPage } from "./members-page.tsx";

// K-307 part b: Jonas removes Anna from the company and reads her exit report
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  flush();
};

const buero = new Uint8Array(16).fill(0xb0);
const report: ReportVault[] = [
  {
    vaultId: buero,
    role: "edit",
    from: Date.UTC(2026, 0, 5) / 1000,
    until: Date.UTC(2026, 10, 20) / 1000,
    entries: [
      {
        entryId: new Uint8Array(16).fill(1),
        title: "Sparkasse",
        type: "login",
        secrets: ["Passwort"],
      },
      { entryId: new Uint8Array(16).fill(2), title: "Lieferanten", type: "note", secrets: [] },
    ],
  },
];

const show = async () => {
  setLocale("de", { reload: false });
  const c = await jonasCompany();
  const s = server(c, [ownerRow(c), certifiedAnna(c)]);
  const left: string[] = [];
  const asked: string[] = [];
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () =>
      withQueries(() => (
        <MembersPage
          session={c.session}
          api={s.api}
          origin="https://k.test"
          exits={{
            onLeft: async () => {
              left.push("reloaded");
            },
            report: (accountId) => {
              asked.push(String(accountId.length));
              return report;
            },
            vaultName: () => "Büro",
          }}
        />
      )),
    root,
  );
  flush();
  await settle();
  return { root, s, left, asked };
};

const annaRowOf = (root: ParentNode) =>
  [...root.querySelectorAll("li")].find((li) => li.textContent?.includes("Anna"));
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );

describe("removing someone from the company", () => {
  it("offers it for Anna, not for Jonas himself", async () => {
    const { root } = await show();
    expect(button(root, "Anna aus der Firma entfernen")).toBeDefined();
    const mine = [...root.querySelectorAll("li")][0];
    expect(mine?.textContent).toContain("Du");
    expect(mine?.querySelector("button[aria-label$='aus der Firma entfernen']")).toBeNull();
  });

  it("asks first, then has the server shut her out and the vaults catch up", async () => {
    const { root, s, left } = await show();
    button(root, "Anna aus der Firma entfernen")?.click();
    flush();
    const dialog = [...document.querySelectorAll("dialog")].find((d) =>
      d.textContent?.includes("kommt sofort nicht mehr an den Server"),
    );
    expect(dialog).toBeDefined();
    expect(s.calls).toEqual([]);
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Entfernen",
    );
    confirm?.click();
    await settle();
    await settle();
    expect(s.calls).toEqual(["leave"]);
    expect(left).toEqual(["reloaded"]);
    expect(annaRowOf(root)?.textContent).toContain("Ausgetreten");
    expect(button(root, "Anna aus der Firma entfernen")).toBeUndefined();
  });

  it("says so when the server does not take it", async () => {
    const { root, s, left } = await show();
    s.api.leave = async () => false;
    button(root, "Anna aus der Firma entfernen")?.click();
    flush();
    const dialog = [...document.querySelectorAll("dialog")].find((d) =>
      d.textContent?.includes("kommt sofort nicht mehr an den Server"),
    );
    [...(dialog?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent?.trim() === "Entfernen")
      ?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Person konnte nicht aus der Firma entfernt werden.",
    );
    expect(left).toEqual([]);
  });
});

describe("the exit report", () => {
  it("shows per vault the role, the period and the entries with their secret fields", async () => {
    const { root, asked } = await show();
    button(root, "Anna aus der Firma entfernen")?.click();
    flush();
    const dialog = [...document.querySelectorAll("dialog")].find((d) =>
      d.textContent?.includes("kommt sofort nicht mehr an den Server"),
    );
    [...(dialog?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent?.trim() === "Entfernen")
      ?.click();
    await settle();
    await settle();
    button(root, "Austritts-Bericht für Anna")?.click();
    flush();
    const shown = [...document.querySelectorAll("dialog")].find((d) =>
      d.textContent?.includes("Austritts-Bericht für Anna"),
    );
    const text = shown?.textContent ?? "";
    expect(asked).toEqual(["16"]);
    expect(text).toContain("Büro");
    expect(text).toContain("Bearbeiten · 05.01.2026 bis 20.11.2026");
    expect(text).toContain("Sparkasse");
    expect(text).toContain("Geheime Felder: Passwort");
    expect(text).toContain("Lieferanten");
    expect(text).toContain("Ohne geheime Felder");
  });
});
