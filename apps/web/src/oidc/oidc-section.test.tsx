import type { OidcStatus } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { OidcSection } from "./oidc-section.tsx";

// K-604: Einstellungen → Anmeldedienst
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
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

const admin: OidcStatus = {
  name: "Weber SSO",
  linked: false,
  enrolment: true,
  enrolmentUrl: "https://kennwort.weber.test/auth/oidc/start?company=c1",
  groupsClaim: "groups",
  groups: [{ id: "g1", name: "Technik", viaIdp: 2 }],
};

const apiFor = (status: OidcStatus | undefined) => ({
  oidcStatus: vi.fn(async () => status),
  setEnrolment: vi.fn(async () => true),
  linkOidc: vi.fn(async () => "https://sso.weber.test/authorize?x=1"),
});

describe("OidcSection", () => {
  it("shows nothing without an identity provider", async () => {
    const root = await mount(() => <OidcSection token="tok" api={apiFor(undefined)} />);
    expect(root.textContent).toBe("");
  });

  it("links a member's account by sending the browser to the provider", async () => {
    const api = apiFor({ name: "Weber SSO", linked: false });
    const go = vi.fn();
    const root = await mount(() => <OidcSection token="tok" api={api} go={go} />);
    expect(root.textContent).not.toContain("Link zum Beitreten");
    root.querySelector("button")?.click();
    await settle();
    expect(api.linkOidc).toHaveBeenCalledWith("tok");
    expect(go).toHaveBeenCalledWith("https://sso.weber.test/authorize?x=1");
  });

  it("says the account is linked", async () => {
    const root = await mount(() => (
      <OidcSection token="tok" api={apiFor({ name: "Weber SSO", linked: true })} />
    ));
    expect(root.textContent).toContain("Dein Konto ist mit Weber SSO verknüpft.");
    expect(root.querySelector("button")).toBeNull();
  });

  it("shows an admin enrolment, its link and the groups that follow the provider", async () => {
    const api = apiFor(admin);
    const root = await mount(() => <OidcSection token="tok" api={api} />);
    expect(root.querySelector("[data-testid=oidc-enrolment-url]")?.textContent).toBe(
      admin.enrolmentUrl,
    );
    expect(root.textContent).toContain("Gruppen aus dem Claim „groups“");
    expect(root.querySelector("[data-testid=oidc-groups]")?.textContent).toContain(
      "Technik2 über den Anmeldedienst",
    );
    root.querySelector<HTMLInputElement>("input[type=checkbox]")?.click();
    await settle();
    expect(api.setEnrolment).toHaveBeenCalledWith("tok", false);
  });

  it("says when the provider cannot be reached or a switch was not saved", async () => {
    const api = { ...apiFor(admin), linkOidc: vi.fn(async () => undefined) };
    api.setEnrolment.mockResolvedValue(false);
    const root = await mount(() => <OidcSection token="tok" api={api} />);
    root.querySelector("button")?.click();
    await settle();
    expect(root.querySelector("[role=alert]")?.textContent).toBe(
      "Der Anmeldedienst ist gerade nicht erreichbar.",
    );
    root.querySelector<HTMLInputElement>("input[type=checkbox]")?.click();
    await settle();
    expect(root.querySelector("[role=alert]")?.textContent).toBe(
      "Die Einstellung ließ sich nicht speichern.",
    );
  });
});
