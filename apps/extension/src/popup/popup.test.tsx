import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { Phase, PopupAccount } from "../account/popup-account.ts";
import texts from "./popup.test-data.json";
import { Popup } from "./popup.tsx";

vi.mock("./vault-screen.tsx", () => ({ VaultScreen: () => <main>entries</main> }));

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const fakeAccount = (start: Phase) => {
  const [phase, setPhase] = createSignal<Phase>("starting");
  const account = {
    phase,
    device: () => ({ server: "https://kennwort.weber-haustechnik.test" }),
    restore: vi.fn(async () => setPhase(start)),
    lock: vi.fn(async () => setPhase("locked")),
    touch: vi.fn(),
    connect: vi.fn(),
    unlock: vi.fn(),
    forget: vi.fn(),
  };
  return account;
};

const show = async (start: Phase, pageUrl = vi.fn(async () => "https://bank.test/")) => {
  setLocale("de", { reload: false });
  const account = fakeAccount(start);
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => <Popup account={account as unknown as PopupAccount} pageUrl={pageUrl} />,
    root,
  );
  flush();
  await Promise.resolve();
  flush();
  return { root, account, pageUrl };
};

it("restores the account and reads the page when it opens, then asks to connect", async () => {
  const { root, account, pageUrl } = await show("connect");
  expect(account.restore).toHaveBeenCalledOnce();
  expect(pageUrl).toHaveBeenCalledOnce();
  expect(root.querySelector("h1")?.textContent).toBe(texts.de.connectTitle);
  expect(root.querySelector(`button[aria-label="${texts.de.lock}"]`)).toBeNull();
});

it("shows the locked screen for a known device", async () => {
  const { root } = await show("locked");
  expect(root.querySelector("h1")?.textContent).toBe(texts.de.lockedTitle);
});

it("offers the lock button only while open, and counts every key press as use", async () => {
  const { root, account } = await show("open");
  expect(root.textContent).toContain("entries");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  expect(account.touch).toHaveBeenCalled();
  (root.querySelector(`button[aria-label="${texts.de.lock}"]`) as HTMLButtonElement).click();
  flush();
  expect(account.lock).toHaveBeenCalledOnce();
  expect(root.querySelector("h1")?.textContent).toBe(texts.de.lockedTitle);
});
