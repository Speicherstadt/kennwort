import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createNavigation } from "../navigation.ts";
import { derive, PASSPHRASE } from "../session/session.test-kit.ts";
import { renewalServer } from "./renew.test-kit.ts";
import { RenewPage } from "./renew-page.tsx";

// K-307 part e: Einstellungen → Schlüssel erneuern, against a server in memory
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const settle = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
};

const page = async () => {
  setLocale("de", { reload: false });
  const r = await renewalServer();
  let renewed = 0;
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => (
      <RenewPage
        nav={createNavigation(window)}
        session={r.c.session}
        api={r.api}
        loaded={() => undefined}
        onRenewed={async () => {
          renewed += 1;
        }}
        derive={derive}
      />
    ),
    root,
  );
  flush();
  const submit = async (passphrase: string) => {
    const input = root.querySelector<HTMLInputElement>("input[type=password]");
    if (!input) throw new Error("no field");
    input.value = passphrase;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    for (let i = 0; i < 20 && root.querySelector('[data-testid="renew-code"]') === null; i++)
      await settle();
  };
  return { ...r, root, submit, renewed: () => renewed };
};

describe("RenewPage", () => {
  it("says what renewing does and asks for the passphrase once more", async () => {
    const { root } = await page();
    expect(root.querySelector("h1")?.textContent).toBe("Schlüssel erneuern");
    expect(root.textContent).toContain("Deine Passphrase bleibt.");
    expect(root.textContent).toContain("Deine anderen Geräte werden abgemeldet");
    expect(root.querySelector("input[type=password]")).not.toBeNull();
  });

  it("names a wrong passphrase and sends nothing", async () => {
    const { root, submit, uploads, renewed } = await page();
    await submit("Vertippt");
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Passphrase oder Secret Key stimmt nicht.",
    );
    expect(uploads).toEqual([]);
    expect(renewed()).toBe(0);
  });

  it("shows the code of the new keys and the new kit, and loads the vaults anew", async () => {
    const { root, submit, renewed } = await page();
    await submit(PASSPHRASE);
    expect(root.querySelector('[data-testid="renew-code"]')?.textContent).toMatch(
      /^(\d{5} ){11}\d{5}$/,
    );
    // Jonas holds the root key: his new keys are confirmed at once
    expect(root.textContent).toContain("Deine neuen Schlüssel sind bestätigt.");
    expect(root.querySelector('[data-testid="recovery-key"]')?.textContent).toMatch(/^R1-/);
    expect(root.querySelector("input[type=password]")).toBeNull();
    expect(renewed()).toBe(1);
  });
});
