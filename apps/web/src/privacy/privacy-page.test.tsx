import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { DeleteOutcome } from "./deletion.ts";
import { PrivacyPage, type PrivacyPageProps } from "./privacy-page.tsx";

// K-607: the page „Datenschutz“, from what the server keeps to deleting the account
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    flush();
  }
};

const show = (over: Partial<PrivacyPageProps> = {}) => {
  setLocale("de", { reload: false });
  const asked: string[] = [];
  const props: PrivacyPageProps = {
    download: async () => true,
    atHome: true,
    linked: [],
    remove: async (passphrase) => {
      asked.push(passphrase);
      return { ok: true };
    },
    ...over,
  };
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <PrivacyPage {...props} />, root);
  flush();
  return { root, asked };
};

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

/** Opens the dialog, types the passphrase and sends the form */
const confirmWith = async (root: HTMLElement, passphrase: string) => {
  button(root, "Konto löschen …")?.click();
  flush();
  const field = root.querySelector<HTMLInputElement>('input[name="passphrase"]');
  if (!field) throw new Error("no passphrase field");
  field.value = passphrase;
  root.querySelector("form")?.requestSubmit();
  flush();
  return field;
};

describe("PrivacyPage", () => {
  it("says what the server keeps and what it never sees", () => {
    const { root } = show();
    expect(root.querySelector("h1")?.textContent).toBe("Datenschutz");
    const lists = [...root.querySelectorAll("ul")].map((ul) => ul.getAttribute("aria-label"));
    expect(lists).toEqual(["Was der Server speichert", "Was der Server nie sieht"]);
    expect(root.textContent).toContain(
      "Deine Passphrase, deinen Secret Key und deinen Recovery Key",
    );
  });

  it("downloads the data and says so when the server gave none", async () => {
    let downloads = 0;
    const { root } = show({
      download: async () => {
        downloads++;
        return false;
      },
    });
    button(root, "Daten herunterladen")?.click();
    await until(() => root.querySelector('[role="alert"]') !== null);
    expect(downloads).toBe(1);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("nicht geklappt");
  });

  it("points owners and admins to the export of the entries, everyone else to them", () => {
    let went = false;
    const owner = show({ onExport: () => (went = true) });
    button(owner.root, "Exportieren")?.click();
    expect(went).toBe(true);
    dispose();
    document.body.innerHTML = "";
    const member = show();
    expect(button(member.root, "Exportieren")).toBeUndefined();
    expect(member.root.textContent).toContain("exportieren Inhaber und Admins");
  });

  it("deletes with the passphrase typed, and forgets it from the field at once", async () => {
    const { root, asked } = show();
    const field = await confirmWith(root, "Heizung-Wasser-Licht-Kupfer");
    expect(field.value).toBe("");
    await until(() => asked.length > 0);
    expect(asked).toEqual(["Heizung-Wasser-Licht-Kupfer"]);
  });

  it("names the linked companies that go with it and why a deletion failed", async () => {
    const outcome: DeleteOutcome = {
      ok: false,
      error: "sole-manager",
      company: "Müller Elektro",
      vaults: ["v"],
    };
    const { root } = show({ linked: ["Müller Elektro"], remove: async () => outcome });
    await confirmWith(root, "x");
    await until(() => root.querySelector('[role="alert"]') !== null);
    expect(root.textContent).toContain("Diese Firmen werden mitgelöscht:");
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Müller Elektro: Du bist der einzige Verwalter eines geteilten Tresors. Mach zuerst jemand anderen zum Verwalter.",
    );
  });

  it("offers deleting only in the own company", () => {
    const { root } = show({ atHome: false });
    expect(button(root, "Konto löschen …")).toBeUndefined();
    expect(root.textContent).toContain("nur in deiner eigenen Firma");
  });
});
