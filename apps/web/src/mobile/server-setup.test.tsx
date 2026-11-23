import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { AppServer } from "./native-send.ts";
import { ServerSetup } from "./server-setup.tsx";

const SERVER = "https://kennwort.weber-haustechnik.test";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
  setLocale("de", { reload: false });
});

const mount = (server: AppServer, onReady: (origin: string) => void) => {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <ServerSetup server={server} onReady={onReady} />, root);
  return root;
};
const submit = async (root: HTMLElement, typed: string) => {
  const input = root.querySelector("input") as HTMLInputElement;
  input.value = typed;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
  root
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
};
const fakeServer = (answer: Awaited<ReturnType<AppServer["store"]>>) => ({
  stored: vi.fn(async () => null),
  store: vi.fn(async () => answer),
});

it.each([
  ["de", "Mit deinem Server verbinden", "Verbinden"],
  ["en", "Connect to your server", "Connect"],
] as const)("asks for the server in %s", (locale, title, button) => {
  setLocale(locale, { reload: false });
  const root = mount(fakeServer({ ok: true, value: SERVER }), () => {});
  expect(root.querySelector("h1")?.textContent).toBe(title);
  expect(root.querySelector("button")?.textContent).toBe(button);
  expect(root.querySelector("input")?.type).toBe("url");
});

it("stores only the origin and starts the app with it", async () => {
  const server = fakeServer({ ok: true, value: SERVER });
  const onReady = vi.fn();
  const root = mount(server, onReady);
  await submit(root, ` ${SERVER}/app `);
  expect(server.store).toHaveBeenCalledWith(SERVER);
  expect(onReady).toHaveBeenCalledWith(SERVER);
});

it("refuses plain HTTP to another machine before asking the Rust side", async () => {
  const server = fakeServer({ ok: true, value: SERVER });
  const onReady = vi.fn();
  const root = mount(server, onReady);
  await submit(root, "http://kennwort.weber-haustechnik.test");
  expect(server.store).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
  expect(root.querySelector("[role=alert]")?.textContent).toBe(
    "Der Server muss über HTTPS erreichbar sein.",
  );
});

it("says why the Rust side did not store it", async () => {
  const onReady = vi.fn();
  const root = mount(fakeServer({ ok: false, error: "storage-failed" }), onReady);
  await submit(root, SERVER);
  expect(onReady).not.toHaveBeenCalled();
  expect(root.querySelector("[role=alert]")?.textContent).toContain("nicht speichern");
});
