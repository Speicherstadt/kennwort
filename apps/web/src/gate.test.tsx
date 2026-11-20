import { createApi } from "@kennwort/client/session/api.ts";
import { emptyState } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { readInvitation } from "./account/invite-page.tsx";
import { readDeviceLink } from "./account/unlock-page.tsx";
import { App } from "./app.tsx";
import { createNavigation, type Navigation, takeStartFragment } from "./navigation.ts";
import type { Session } from "./session/session.ts";

// The gate tests never reach the server; a pairing page would see it as unreachable
const unreachable = createApi(async () => {
  throw new TypeError("offline");
});

let dispose = () => {};
let nav: Navigation | undefined;
afterEach(() => {
  dispose();
  nav?.dispose();
  document.body.innerHTML = "";
});

/** Only what the gate reads; the flows themselves are in session.test.ts and e2e/account.spec.ts */
const fakeSession = (state: { opened?: boolean; device?: boolean }) => {
  const account = { token: "t", state: emptyState(new Uint8Array(32)) } as never;
  const [opened, setOpened] = createSignal(state.opened ? account : undefined);
  const touches: number[] = [];
  const session = {
    opened,
    device: () => (state.device ? { accountId: "x", secretKey: new Uint8Array(16) } : undefined),
    lock: () => setOpened(undefined),
    touch: () => touches.push(1),
    setLockAfter: () => {},
  } as unknown as Session;
  return { session, touches };
};

/** Opens the app on a path as main.tsx does; `hash` stands in for a fragment the path has none of */
const open = (path: string, session: Session, hash?: string) => {
  setLocale("de", { reload: false });
  // One navigation at a time, as in the app: an earlier one would take this path's fragment
  nav?.dispose();
  window.history.replaceState(null, "", path);
  const root = document.createElement("div");
  document.body.append(root);
  const navigation = createNavigation(window);
  nav = navigation;
  const start = takeStartFragment(navigation, window);
  dispose = render(
    () => <App nav={navigation} session={session} api={unreachable} hash={hash ?? start} />,
    root,
  );
  flush();
  return root;
};
/** The user opens a link to the page the tab is on: the browser changes only the fragment */
const followFragment = async (hash: string) => {
  const changed = new Promise((resolve) =>
    window.addEventListener("hashchange", resolve, { once: true }),
  );
  window.location.hash = hash;
  await changed;
  flush();
};
const invitation = `#token=T0K3N&s=${"AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI"}&root=${"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"}`;
const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;
const heading = (root: ParentNode) => root.querySelector("h1")?.textContent;

describe("the gate", () => {
  it("welcomes a new device and asks a known one to unlock", () => {
    expect(heading(open("/entries", fakeSession({}).session))).toBe("Willkommen bei Kennwort");
    dispose();
    expect(heading(open("/entries", fakeSession({ device: true }).session))).toBe(
      "Kennwort ist gesperrt",
    );
  });

  it("offers a new device to set up a company, to connect with another device or to unlock", () => {
    const root = open("/entries", fakeSession({}).session);
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Firma anlegen", "Mit einem anderen Gerät verbinden", "Anderes Konto"]);
    button(root, "Mit einem anderen Gerät verbinden").click();
    flush();
    expect(window.location.pathname).toBe("/pair");
  });

  it("asks a new device for account ID and Secret Key when it unlocks another account", () => {
    const root = open("/entries", fakeSession({}).session);
    button(root, "Anderes Konto").click();
    flush();
    expect(heading(root)).toBe("Kennwort ist gesperrt");
    expect(root.textContent).toContain("Konto-ID");
    expect(root.textContent).toContain("Secret Key");
  });

  it("shows the frame only when unlocked, locks from the rail and counts every key press as use", () => {
    const { session, touches } = fakeSession({ opened: true });
    const root = open("/entries", session);
    expect(heading(root)).toBe("Alle Einträge");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    document.dispatchEvent(new PointerEvent("pointerdown"));
    expect(touches).toHaveLength(2);
    (root.querySelector('button[aria-label="Sperren"]') as HTMLButtonElement).click();
    flush();
    expect(heading(root)).toBe("Willkommen bei Kennwort");
  });

  it("switches the language without locking", () => {
    const root = open("/settings", fakeSession({ opened: true }).session);
    (root.querySelector('input[value="en"]') as HTMLInputElement).click();
    flush();
    expect(heading(root)).toBe("Settings");
    expect(document.documentElement.lang).toBe("en");
    setLocale("de", { reload: false });
  });

  it("always reaches the setup and the invitation, and says when a link is incomplete", () => {
    expect(heading(open("/setup", fakeSession({}).session))).toBe("Firma anlegen");
    dispose();
    const root = open("/invite/abc", fakeSession({}).session, "#token=t");
    expect(heading(root)).toBe("Einladung annehmen");
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Dieser Einladungslink ist unvollständig.",
    );
  });

  it("fills account ID and Secret Key from the kit's link, even on a device that knows an account", () => {
    const link = "#account=abc&secret=K1-XYZ";
    const root = open(`/unlock${link}`, fakeSession({ device: true }).session);
    // Dropped from the address before anyone types: the Secret Key does not stay in the history
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/unlock");
    expect(heading(root)).toBe("Kennwort ist gesperrt");
    const values = [...root.querySelectorAll("input")].map((input) => input.value);
    expect(values).toEqual(["abc", "K1-XYZ", ""]);
  });

  it("reads account ID and Secret Key from a link's fragment", () => {
    expect(readDeviceLink("#account=abc&secret=K1-XYZ")).toEqual({
      accountId: "abc",
      secretKey: "K1-XYZ",
    });
    expect(readDeviceLink("#account=abc")).toBeUndefined();
    expect(readDeviceLink("#secret=K1-XYZ")).toBeUndefined();
    expect(readDeviceLink("")).toBeUndefined();
  });

  it("reads token, secret and root fingerprint from the link's fragment", () => {
    const root = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    const s = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI";
    expect(readInvitation(`#token=geheim&s=${s}&root=${root}`)).toEqual({
      token: "geheim",
      secret: new Uint8Array(32).fill(2),
      rootFingerprint: new Uint8Array(32).fill(1),
    });
    expect(readInvitation(`#s=${s}&root=${root}`)).toBeUndefined();
    expect(readInvitation(`#token=geheim&root=${root}`)).toBeUndefined();
    expect(readInvitation(`#token=geheim&s=kurz&root=${root}`)).toBeUndefined();
    expect(readInvitation(`#token=geheim&s=${s}&root=kurz`)).toBeUndefined();
  });
});

// The secret in a link's fragment leaves the address before it renders or is handed to the page
describe("a secret link", () => {
  it("takes the invitation's fragment before it renders and offers to accept it (P-08)", () => {
    const root = open(`/invite/abc${invitation}`, fakeSession({}).session);
    expect(window.location.pathname + window.location.hash).toBe("/invite/abc");
    expect(JSON.stringify(window.history.state)).not.toContain("T0K3N");
    expect(heading(root)).toBe("Einladung annehmen");
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(button(root, "Konto anlegen")).toBeDefined();
  });

  it("hands a pairing link opened in the same tab to the open page and drops it", async () => {
    const root = open("/link", fakeSession({ opened: true }).session);
    expect(heading(root)).toBe("Gerät hinzufügen");
    await followFragment("#id=i&fp=f&r=S3CR3T");
    expect(window.location.pathname + window.location.hash).toBe("/link");
    expect(root.querySelector("input")?.value).toBe("#id=i&fp=f&r=S3CR3T");
  });

  it("hands an invitation opened in the same tab to the open page and drops it", async () => {
    const root = open("/invite/abc", fakeSession({}).session);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Dieser Einladungslink ist unvollständig.",
    );
    await followFragment(invitation);
    expect(window.location.pathname + window.location.hash).toBe("/invite/abc");
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(button(root, "Konto anlegen")).toBeDefined();
  });

  it("hands the kit's link opened in the same tab to the unlock page and drops it", async () => {
    const root = open("/unlock", fakeSession({ device: true }).session);
    await followFragment("#account=abc&secret=K1-XYZ");
    expect(window.location.pathname + window.location.hash).toBe("/unlock");
    const values = [...root.querySelectorAll("input")].map((input) => input.value);
    expect(values).toEqual(["abc", "K1-XYZ", ""]);
  });
});
