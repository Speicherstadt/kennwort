import type { DevicesApi } from "@kennwort/client/session/devices-api.ts";
import type { DeviceEntry } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { DevicesSection } from "./devices-section.tsx";

// K-303 part 6: the device list in the settings
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const here: DeviceEntry = {
  id: "s-here",
  name: "Firefox · Linux",
  signedInAt: 1,
  lastSeenAt: Date.UTC(2026, 10, 20, 9, 30),
  current: true,
};
const phone: DeviceEntry = { ...here, id: "s-phone", name: null, current: false };

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flush();
};

const mount = async (view: () => JSX.Element) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => withQueries(view), root);
  flush();
  await settle();
  return root;
};
const show = (api: DevicesApi, onSignedOut = () => {}) =>
  mount(() => <DevicesSection token="tok" api={api} onSignedOut={onSignedOut} />);
const buttons = (root: ParentNode) => [...root.querySelectorAll("button")];
const rows = (root: ParentNode) => [...root.querySelectorAll("li")].map((li) => li.textContent);

describe("DevicesSection", () => {
  it("lists the devices with names, this device marked and when they were last active", async () => {
    const devices = vi.fn(async () => [here, phone]);
    const root = await show({ devices, removeDevice: async () => true });
    expect(devices).toHaveBeenCalledWith("tok");
    expect(root.querySelector("h2")?.textContent).toBe("Angemeldete Geräte");
    expect(rows(root)[0]).toContain("Firefox · Linux");
    expect(rows(root)[0]).toContain("Dieses Gerät");
    expect(rows(root)[0]).toContain("Zuletzt aktiv:");
    expect(rows(root)[0]).toContain("2026");
    expect(rows(root)[1]).toContain("Unbekanntes Gerät");
    expect(rows(root)[1]).not.toContain("Dieses Gerät");
    expect(buttons(root).map((b) => b.textContent)).toEqual(["Dieses Gerät abmelden", "Abmelden"]);
  });

  it("signs another device out and shows the list anew, without signing this one out", async () => {
    let list = [here, phone];
    const removeDevice = vi.fn(async (_token: string, id: string) => {
      list = list.filter((d) => d.id !== id);
      return true;
    });
    const onSignedOut = vi.fn();
    const root = await show({ devices: async () => list, removeDevice }, onSignedOut);
    buttons(root)[1]?.click();
    await settle();
    expect(removeDevice).toHaveBeenCalledWith("tok", "s-phone");
    expect(rows(root)).toHaveLength(1);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("signs this device out and hands over to the app", async () => {
    const removeDevice = vi.fn(async () => true);
    const onSignedOut = vi.fn();
    const root = await show({ devices: async () => [here, phone], removeDevice }, onSignedOut);
    buttons(root)[0]?.click();
    await settle();
    expect(removeDevice).toHaveBeenCalledWith("tok", "s-here");
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("disables the buttons while a sign-out runs", async () => {
    let finish = (_ok: boolean) => {};
    const removeDevice = () => new Promise<boolean>((resolve) => (finish = resolve));
    const root = await show({ devices: async () => [here, phone], removeDevice });
    buttons(root)[1]?.click();
    flush();
    expect(buttons(root).every((b) => b.disabled)).toBe(true);
    finish(false);
    await settle();
    expect(buttons(root).every((b) => !b.disabled)).toBe(true);
  });

  it("says so when the list cannot be loaded or a device not signed out", async () => {
    const broken = await show({ devices: async () => undefined, removeDevice: async () => true });
    expect(broken.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Geräte konnten nicht geladen werden.",
    );
    dispose();
    const onSignedOut = vi.fn();
    const root = await show(
      { devices: async () => [here, phone], removeDevice: async () => false },
      onSignedOut,
    );
    buttons(root)[0]?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Das Gerät konnte nicht abgemeldet werden.",
    );
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(rows(root)).toHaveLength(2);
  });

  it("loads the list anew for another sign-in's token", async () => {
    const devices = vi.fn(async (token: string) => (token === "tok" ? [here, phone] : [here]));
    const [token, setToken] = createSignal("tok");
    const root = await mount(() => (
      <DevicesSection
        token={token()}
        api={{ devices, removeDevice: async () => true }}
        onSignedOut={() => {}}
      />
    ));
    expect(rows(root)).toHaveLength(2);
    setToken("tok-2");
    flush();
    await settle();
    expect(devices).toHaveBeenLastCalledWith("tok-2");
    expect(rows(root)).toHaveLength(1);
  });
});
