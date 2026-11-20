import { type Locale, setLocale } from "@kennwort/ui";
import { type JSX, render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { PopupOutcome } from "../account/popup-account.ts";
import { ConnectScreen } from "./connect-screen.tsx";
import { LockedScreen } from "./locked-screen.tsx";
import texts from "./popup.test-data.json";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const mount = (locale: Locale, view: () => JSX.Element) => {
  setLocale(locale, { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(view, root);
  return root;
};

const field = (root: HTMLElement, label: string) => {
  const id = [...root.querySelectorAll("label")].find((l) => l.textContent === label)?.htmlFor;
  return root.querySelector(`#${CSS.escape(id ?? "")}`) as HTMLInputElement;
};
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
};
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
};

it.each(["de", "en"] as const)(
  "shows the locked state in %s with the passphrase as the one primary action",
  (locale) => {
    const root = mount(locale, () => (
      <LockedScreen
        server="https://kennwort.weber-haustechnik.test"
        onUnlock={async () => ({ ok: true })}
        onOther={() => {}}
      />
    ));
    const text = texts[locale];
    expect(root.querySelector("h1")?.textContent).toBe(text.lockedTitle);
    expect(root.textContent).toContain("kennwort.weber-haustechnik.test");
    expect(field(root, text.passphrase).type).toBe("password");
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual([text.unlock, text.other]);
    expect(buttons.filter((b) => b.className.includes("bg-primary"))).toHaveLength(1);
  },
);

it("unlocks with the passphrase and says why it did not work", async () => {
  const onUnlock = vi.fn(
    async (_passphrase: string): Promise<PopupOutcome> => ({
      ok: false,
      error: "wrong-passphrase",
    }),
  );
  const onOther = vi.fn();
  const root = mount("de", () => (
    <LockedScreen server="https://kennwort.test" onUnlock={onUnlock} onOther={onOther} />
  ));
  type(field(root, texts.de.passphrase), "Pumpe Kessel Rohr Ventil");
  root.querySelector("form")?.requestSubmit();
  await settle();
  expect(onUnlock).toHaveBeenCalledWith("Pumpe Kessel Rohr Ventil");
  expect(root.querySelector("[role=alert]")?.textContent).toBe(texts.de.wrongPassphrase);
  (root.querySelectorAll("button")[1] as HTMLButtonElement).click();
  expect(onOther).toHaveBeenCalled();
});

it.each(["de", "en"] as const)(
  "asks for server, account ID, Secret Key and passphrase in %s",
  async (locale) => {
    const onConnect = vi.fn(
      async (): Promise<PopupOutcome> => ({ ok: false, error: "insecure-server" }),
    );
    const root = mount(locale, () => <ConnectScreen onConnect={onConnect} />);
    const text = texts[locale];
    expect(root.querySelector("h1")?.textContent).toBe(text.connectTitle);
    type(field(root, text.server), "http://kennwort.test");
    type(field(root, text.accountId), "AAAAAAAAAAAAAAAAAAAAAA");
    type(field(root, text.secretKey), "A3-ABCDEF");
    type(field(root, text.passphrase), "Pumpe Kessel Rohr Ventil");
    expect(field(root, text.passphrase).type).toBe("password");
    root.querySelector("form")?.requestSubmit();
    await settle();
    expect(onConnect).toHaveBeenCalledWith({
      server: "http://kennwort.test",
      accountId: "AAAAAAAAAAAAAAAAAAAAAA",
      secretKey: "A3-ABCDEF",
      passphrase: "Pumpe Kessel Rohr Ventil",
    });
    expect(root.querySelector("[role=alert]")?.textContent).toBe(text.insecureServer);
  },
);
