import type { OidcApi } from "@kennwort/client/session/oidc-api.ts";
import { bundleFingerprint, comparisonCode, rootFingerprint } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Navigation } from "../navigation.ts";
import { derive, fakeApi, memory, PASSPHRASE } from "../session/session.test-kit.ts";
import { createSession } from "../session/session.ts";
import { OidcPage, readOidcFragment } from "./oidc-page.tsx";

// K-604: back from the identity provider, with a ticket or an error in the fragment
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const root = new Uint8Array(32).fill(9);

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  flush();
};
const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
  flush();
};

const mount = async (hash: string, redeem: OidcApi["redeemTicket"]) => {
  setLocale("de", { reload: false });
  const session = createSession({ api: fakeApi(), storage: memory(), derive });
  const nav = { go: vi.fn(), replace: vi.fn() } as unknown as Navigation;
  const element = document.createElement("div");
  document.body.append(element);
  const api = { redeemTicket: vi.fn(redeem) };
  dispose = render(() => <OidcPage nav={nav} session={session} api={api} hash={hash} />, element);
  flush();
  await settle();
  return { element, nav, session, api };
};

const fill = (element: HTMLElement, passphrase: string) => {
  for (const field of element.querySelectorAll<HTMLInputElement>("input[type=password]")) {
    field.value = passphrase;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // A setter shows in a read only after the flush; a person types and submits in separate tasks
  flush();
  element.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
};

describe("readOidcFragment", () => {
  it("reads a ticket, or a known error, and anything else as an expired login", () => {
    expect(readOidcFragment("#ticket=abc_DEF-1")).toEqual({ ticket: "abc_DEF-1" });
    expect(readOidcFragment("#error=no-company")).toEqual({ error: "no-company" });
    expect(readOidcFragment("#error=<script>")).toEqual({ error: "state" });
    expect(readOidcFragment("#ticket=a%20b")).toEqual({ error: "state" });
    expect(readOidcFragment("")).toEqual({ error: "state" });
  });
});

describe("OidcPage", () => {
  it("sends a known account to the unlock screen, with no session from the provider", async () => {
    const accountId = new Uint8Array(16).fill(1);
    const { nav, session, api } = await mount("#ticket=T1", async () => ({
      ok: true,
      value: { kind: "known", accountId },
    }));
    expect(api.redeemTicket).toHaveBeenCalledWith("T1");
    expect(nav.replace).toHaveBeenCalledWith("/");
    expect(session.opened()).toBeUndefined();
  });

  it("names why a login failed, and asks the server nothing for an error", async () => {
    const { element, api } = await mount("#error=linked-elsewhere", async () => ({
      ok: false,
      error: "unexpected",
    }));
    expect(element.querySelector("[role=alert]")?.textContent).toBe(
      "Diese Anmeldung gehört schon zu einem anderen Konto.",
    );
    expect(api.redeemTicket).not.toHaveBeenCalled();
    const spent = await mount("#ticket=T2", async () => ({ ok: false, error: "invalid-ticket" }));
    expect(spent.element.querySelector("[role=alert]")?.textContent).toContain("verbraucht");
  });

  it("enrols a new person: passphrase, kit, then the codes to compare", async () => {
    const { element, session, nav } = await mount("#ticket=ticket", async () => ({
      ok: true,
      value: { kind: "enrol", name: "Sandra Weber", rootPublicKey: root },
    }));
    expect(element.textContent).toContain("Angemeldet als Sandra Weber.");
    fill(element, PASSPHRASE);
    await until(() => element.querySelector("[data-testid=secret-key]") !== null);
    const opened = session.opened();
    expect(opened?.state.rootFingerprint).toEqual(rootFingerprint(root));
    element.querySelector<HTMLInputElement>("input[type=checkbox]")?.click();
    flush();
    [...element.querySelectorAll("button")].at(-1)?.click();
    flush();
    const own = opened
      ? comparisonCode(
          bundleFingerprint(opened.keyBlock.xwing.publicKey, opened.keyBlock.ed.publicKey),
        )
      : "";
    expect(element.querySelector("[data-testid=own-code]")?.textContent).toBe(own);
    expect(element.querySelector("[data-testid=company-code]")?.textContent).toBe(
      comparisonCode(rootFingerprint(root)),
    );
    [...element.querySelectorAll("button")].at(-1)?.click();
    expect(nav.go).toHaveBeenCalledWith("/entries");
  });

  it("refuses a short passphrase before making anything", async () => {
    const { element, session } = await mount("#ticket=ticket", async () => ({
      ok: true,
      value: { kind: "enrol", name: null, rootPublicKey: root },
    }));
    fill(element, "kurz");
    await settle();
    expect(element.querySelector("[role=alert]")).not.toBeNull();
    expect(session.opened()).toBeUndefined();
  });
});
