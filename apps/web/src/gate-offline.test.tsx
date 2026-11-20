import { formatSecretKey } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { App } from "./app.tsx";
import { createNavigation, type Navigation } from "./navigation.ts";
import { createApi } from "./session/api.ts";
import { createSession } from "./session/session.ts";

// Review of K-303: with the server unreachable, unlocking must end with an error, not a button
// that stays busy and disabled for good.
let dispose = () => {};
let nav: Navigation | undefined;
afterEach(() => {
  dispose();
  nav?.dispose();
  document.body.innerHTML = "";
});

it("shows an error and frees the button when the server cannot be reached", async () => {
  const offline: typeof fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  const storage = new Map<string, string>([
    [
      "kennwort-device",
      JSON.stringify({ accountId: "A".repeat(22), secretKey: formatSecretKey(new Uint8Array(16)) }),
    ],
  ]);
  const session = createSession({
    api: createApi(offline),
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
      removeItem: (k) => void storage.delete(k),
    },
  });
  setLocale("de", { reload: false });
  window.history.replaceState(null, "", "/entries");
  const root = document.createElement("div");
  document.body.append(root);
  const navigation = createNavigation(window);
  nav = navigation;
  dispose = render(() => <App nav={navigation} session={session} api={createApi(offline)} />, root);
  flush();
  expect(root.querySelector("h1")?.textContent).toBe("Kennwort ist gesperrt");
  const field = root.querySelector("input[type=password]") as HTMLInputElement;
  field.value = "Heizung Wasser Licht Kupfer";
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  (root.querySelector("form") as HTMLFormElement).requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  flush();
  const button = root.querySelector("button[type=submit]") as HTMLButtonElement;
  expect(root.querySelector('[role="alert"]')).not.toBeNull();
  expect(button.disabled).toBe(false);
}, 20_000);
