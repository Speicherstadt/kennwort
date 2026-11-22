import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  type AccountState,
  type EmergencyGrant,
  emptyState,
  type ListedGrant,
  makeGrant,
  type Statement,
  signStatement,
} from "@kennwort/core";
import {
  certificate,
  jonas,
  type Person,
  root,
  sandra,
  vaultId,
  vaultKey,
} from "@kennwort/core/testing";
import { rootFingerprint } from "@kennwort/crypto";
import { createToasts, setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNavigation } from "../navigation.ts";
import { withQueries } from "../queries.test-kit.tsx";
import type { Session } from "../session/session.ts";
import { EmergencyNotice } from "./emergency-notice.tsx";
import { EmergencyPage, type EmergencyPageApi } from "./emergency-page.tsx";

// K-307 part d: Konto → Notfallzugriff, with a server in memory and Weber Haustechnik's keys
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  flush();
};

const ring = { vaultId, epoch: 0, vaultKey };
const buero = { idText: "buero", name: "Büro", ring } as unknown as Vault;
const sessionOf = (p: Person) => {
  let state: AccountState = emptyState(rootFingerprint(root.publicKey));
  const opened = () => ({
    accountKey: new Uint8Array(32).fill(7),
    keyBlock: { xwing: p.xwing, ed: p.ed, rootFingerprint: rootFingerprint(root.publicKey) },
    state,
    accountId: p.id,
    token: "tok",
  });
  return {
    opened,
    updateState: async (_api: unknown, change: (s: AccountState) => AccountState | undefined) => {
      state = change(state) ?? state;
      return { ok: true, value: state };
    },
  } as unknown as Session;
};
const member = (p: Person, name: string) => ({
  id: p.id,
  role: "member",
  name,
  xwingPublicKey: p.xwing.publicKey,
  edPublicKey: p.ed.publicKey,
  certificate: certificate(p),
  invitation: null,
});

const fakeApi = (listed: { given?: ListedGrant[]; received?: ListedGrant[] } = {}) => {
  const sent: Statement[] = [];
  const api = {
    company: async () => ({
      id: "weber",
      rootPublicKey: root.publicKey,
      policy: null,
      recoveryPublicKey: null,
    }),
    members: async () => [member(jonas, "Jonas"), member(sandra, "Sandra")],
    emergencyList: vi.fn(async () => ({
      given: listed.given ?? [],
      received: listed.received ?? [],
      revocations: [],
    })),
    saveGrant: vi.fn(async (_t: string, _g: EmergencyGrant) => "ok"),
    requestEmergency: async (_t: string, s: Statement) => Boolean(sent.push(s)),
    objectEmergency: async (_t: string, s: Statement) => Boolean(sent.push(s)),
    approveEmergency: async (_t: string, s: Statement) => Boolean(sent.push(s)),
    revokeGrant: async (_t: string, s: Statement) => Boolean(sent.push(s)),
  };
  return { api: api as unknown as EmergencyPageApi, saveGrant: api.saveGrant, sent };
};

const show = async (api: EmergencyPageApi, session: Session) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () =>
      withQueries(() => (
        <EmergencyPage api={api} session={session} vaults={() => [buero]} toasts={createToasts()} />
      )),
    root,
  );
  flush();
  await settle();
  return root;
};
const button = (root: ParentNode, name: string) => {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
const now = () => Math.floor(Date.now() / 1000);
const grant = () =>
  makeGrant(
    { id: jonas.id, edSecretKey: jonas.ed.secretKey },
    certificate(sandra),
    { scope: "view", rings: [ring] },
    {
      waitSeconds: 7 * 86_400,
      time: now() - 60,
    },
  ).grant;
const listedOf = (g: EmergencyGrant, request: Statement | null = null): ListedGrant => ({
  grant: g,
  request,
  objection: null,
  approval: null,
  releaseAt: request ? request.at + g.waitSeconds : null,
});

describe("EmergencyPage", () => {
  it("lets Jonas give Sandra view access to Büro with a waiting time", async () => {
    const { api, saveGrant } = fakeApi();
    const root = await show(api, sessionOf(jonas));
    expect(root.textContent).toContain("Du hast noch niemandem Notfallzugriff gegeben.");
    const form = root.querySelector("form");
    const [person, wait] = [...(form?.querySelectorAll("select") ?? [])];
    if (!form || !person || !wait) throw new Error("no form");
    expect([...person.options].map((o) => o.textContent)).toEqual(["Person wählen", "Sandra"]);
    person.value = person.options[1]?.value ?? "";
    person.dispatchEvent(new Event("change", { bubbles: true }));
    wait.value = "14";
    wait.dispatchEvent(new Event("change", { bubbles: true }));
    const vault = form.querySelector<HTMLInputElement>('input[type="checkbox"]');
    vault?.click();
    flush();
    form.requestSubmit();
    await settle();
    const stored = saveGrant.mock.calls[0]?.[1];
    expect(stored).toMatchObject({ scope: "view", waitSeconds: 14 * 86_400 });
    expect(stored?.items).toHaveLength(1);
  });

  it("shows Jonas a running request to object to or approve", async () => {
    const g = grant();
    const request = signStatement("emergency-request", sandra.ed.secretKey, g, now());
    const { api, sent } = fakeApi({ given: [listedOf(g, request)] });
    const root = await show(api, sessionOf(jonas));
    const given = root.querySelector('ul[aria-label="Von dir gegeben"]');
    expect(given?.textContent).toContain("Sandra");
    expect(given?.textContent).toContain("Angefragt – frei ab");
    button(root, "Widersprechen").click();
    await settle();
    expect(sent.map((s) => s.at)).toEqual([request.at]);
    button(root, "Jetzt freigeben").click();
    await settle();
    button(root, "Notfallzugriff für Sandra zurückziehen").click();
    await settle();
    expect(sent.map((s) => s.at)).toEqual([request.at, request.at, g.time]);
  });

  it("lets Sandra ask for access to a grant her client checked", async () => {
    const g = grant();
    const { api, sent } = fakeApi({ received: [listedOf(g)] });
    const root = await show(api, sessionOf(sandra));
    const received = root.querySelector('ul[aria-label="Für dich"]');
    expect(received?.textContent).toContain("Jonas");
    expect(received?.textContent).toContain("Keine Anfrage");
    button(root, "Zugriff anfragen").click();
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.grantee).toEqual(sandra.id);
  });

  it("shows no grant the server changed", async () => {
    const forged = { ...grant(), waitSeconds: 86_400 };
    const { api } = fakeApi({ received: [listedOf(forged)] });
    const root = await show(api, sessionOf(sandra));
    expect(root.textContent).toContain("Niemand hat dir Notfallzugriff gegeben.");
  });
});

describe("EmergencyNotice", () => {
  it("tells Jonas on every page that Sandra asked, until he answers", async () => {
    const g = grant();
    const request = signStatement("emergency-request", sandra.ed.secretKey, g, now());
    const { api } = fakeApi({ given: [listedOf(g, request)] });
    setLocale("de", { reload: false });
    const root = document.createElement("div");
    document.body.append(root);
    const nav = createNavigation(window);
    nav.go("/entries");
    dispose = render(
      () => withQueries(() => <EmergencyNotice api={api} session={sessionOf(jonas)} nav={nav} />),
      root,
    );
    flush();
    await settle();
    expect(root.textContent).toContain("Sandra bittet um Notfallzugriff.");
    expect(root.querySelector('a[href="/emergency"]')?.textContent).toBe("Ansehen");
    const dropNav = dispose;
    dispose = () => {
      dropNav();
      nav.dispose();
    };
  });
});
