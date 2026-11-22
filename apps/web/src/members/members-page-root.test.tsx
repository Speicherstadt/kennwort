import { certify } from "@kennwort/core";
import { comparisonCode, ed25519KeyPair, rootFingerprint, signRootChange } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { withQueries } from "../queries.test-kit.tsx";
import { jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import type { MembersDeps } from "./members.ts";
import { MembersPage } from "./members-page.tsx";

// K-307 part f (P-07): the company root on the members page, in German
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
  flush();
};
const show = async (c: Awaited<ReturnType<typeof jonasCompany>>, api: MembersDeps) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => withQueries(() => <MembersPage session={c.session} api={api} origin="https://k.test" />),
    root,
  );
  flush();
  await settle();
  return root;
};
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const text = (root: ParentNode, id: string) =>
  root.querySelector(`[data-testid="${id}"]`)?.textContent;

describe("the company root on the members page", () => {
  it("shows the pinned root's code, and an owner replaces the root after asking", async () => {
    const c = await jonasCompany();
    const s = server(c, [ownerRow(c)]);
    const root = await show(c, s.api);
    expect(text(root, "root-code")).toBe(comparisonCode(c.opened.state.rootFingerprint));
    button("Neuen Firmenschlüssel anlegen")?.click();
    flush();
    expect(document.querySelector("dialog")?.textContent).toContain("alten Firmenschlüssel");
    button("Neuen Schlüssel anlegen")?.click();
    await settle();
    await settle();
    expect(s.calls).toContain("root");
    expect(root.querySelector('[role="status"]')?.textContent).toContain("neue Firmenschlüssel");
    expect(text(root, "root-code")).toBe(comparisonCode(rootFingerprint(s.company.rootPublicKey)));
  });

  it("shows a new root waiting with its code, and the list once the person confirmed it", async () => {
    const c = await jonasCompany();
    const next = ed25519KeyPair();
    const old = c.opened.state.rootSecretKey as Uint8Array;
    const now = Math.floor(Date.now() / 1000);
    const s = server(c, [
      {
        ...ownerRow(c),
        certificate: certify(next.secretKey, { ...c.certificate, issuedAt: now }),
        previous: [c.certificate],
      },
    ]);
    s.company.rootPublicKey = next.publicKey;
    s.company.rootChanges.push(signRootChange(old, next.secretKey, c.certificate.companyId, now));
    const root = await show(c, s.api);
    expect(text(root, "root-change-code")).toBe(comparisonCode(rootFingerprint(next.publicKey)));
    expect(root.querySelector("li")).toBeNull();
    button("Code stimmt")?.click();
    await settle();
    await settle();
    expect(s.calls).toContain("key-block");
    expect(text(root, "root-change-code")).toBeUndefined();
    expect(root.querySelector("li")?.textContent).toContain("Bestätigt");
  });

  it("names a fork as an attack and shows no members", async () => {
    const c = await jonasCompany();
    const old = c.opened.state.rootSecretKey as Uint8Array;
    const s = server(c, [ownerRow(c)]);
    const [one, two] = [ed25519KeyPair(), ed25519KeyPair()];
    const now = Math.floor(Date.now() / 1000);
    s.company.rootPublicKey = one.publicKey;
    s.company.rootChanges.push(
      signRootChange(old, one.secretKey, c.certificate.companyId, now),
      signRootChange(old, two.secretKey, c.certificate.companyId, now),
    );
    const root = await show(c, s.api);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Angriff");
    expect(root.querySelector("li")).toBeNull();
  });
});
