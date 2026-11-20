import { certify } from "@kennwort/core";
import { ed25519KeyPair } from "@kennwort/crypto";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { annaRow, jonasCompany, ownerRow, server } from "./members.test-kit.ts";
import type { MembersDeps } from "./members.ts";
import { MembersPage } from "./members-page.tsx";

// K-304 part 2: the members page in German
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  flush();
};

const show = async (c: Awaited<ReturnType<typeof jonasCompany>>, api: MembersDeps) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => <MembersPage session={c.session} api={api} origin="https://k.test" />,
    root,
  );
  flush();
  await settle();
  return root;
};
const rows = (root: ParentNode) =>
  [...root.querySelectorAll("li")].map((li) => li.textContent ?? "");
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

describe("MembersPage", () => {
  it("lists Jonas as confirmed owner and Anna to confirm; confirming shows her confirmed", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c);
    const s = server(c, [ownerRow(c), row]);
    const root = await show(c, s.api);
    expect(root.querySelector("h1")?.textContent).toBe("Mitglieder");
    expect(rows(root)[0]).toContain("Du");
    expect(rows(root)[0]).toContain("Inhaber");
    expect(rows(root)[0]).toContain("Bestätigt");
    expect(rows(root)[1]).toContain("Anna");
    expect(rows(root)[1]).toContain("Mitarbeiter");
    // After the upload the server lists Anna with her certificate
    s.api.members = async () => [
      ownerRow(c),
      { ...row, certificate: s.certified[0] ?? null, invitation: null },
    ];
    button(root, "Bestätigen")?.click();
    await settle();
    await settle();
    expect(s.calls).toEqual(["state", "certify"]);
    expect(rows(root)[1]).toContain("Bestätigt");
  });

  it("invites with a name and shows the link to copy", async () => {
    const c = await jonasCompany();
    const s = server(c, [ownerRow(c)]);
    const root = await show(c, s.api);
    const name = root.querySelector<HTMLInputElement>("form input");
    if (!name) throw new Error("no name field");
    name.value = "Sandra";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const link = root.querySelector<HTMLInputElement>('[data-testid="invitation-link"]');
    expect(link?.value).toMatch(
      /^https:\/\/k\.test\/invite\/[\w-]{22}#token=einmal&s=[\w-]{43}&root=[\w-]{43}$/,
    );
    expect(button(root, "Kopieren")).toBeDefined();
  });

  it("says why a confirmation is refused", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c, new Uint8Array(32));
    const root = await show(c, server(c, [ownerRow(c), row]).api);
    button(root, "Bestätigen")?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "Diese Schlüssel gehören nicht zu deiner Einladung. Kennwort bestätigt sie nicht.",
    );
  });

  it("shows no members under a root key that is not the pinned one, and no invite to a member", async () => {
    const c = await jonasCompany();
    const s = server(c, [ownerRow(c)]);
    const lying = {
      ...s.api,
      company: async () => ({
        id: "weber",
        rootPublicKey: ed25519KeyPair().publicKey,
        policy: null,
      }),
    };
    const root = await show(c, lying);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Firmenschlüssel");
    expect(root.querySelector("li")).toBeNull();
    dispose();
    const asMember = {
      ...s.api,
      members: async () => [{ ...ownerRow(c), role: "member" as const, certificate: null }],
    };
    const plain = await show(c, asMember);
    expect(plain.querySelector("form")).toBeNull();
    expect(rows(plain)[0]).toContain("Wartet auf Bestätigung");
    dispose();
    const gone = await show(c, { ...s.api, members: async () => undefined });
    expect(gone.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Mitglieder konnten nicht geladen werden.",
    );
  });
});

describe("MembersPage roles", () => {
  it("lets Jonas give a confirmed member another role, but not himself", async () => {
    const c = await jonasCompany();
    const { row } = annaRow(c);
    const root = c.opened.state.rootSecretKey ?? new Uint8Array();
    const certificate = certify(root, {
      accountId: row.id,
      xwingPublicKey: row.xwingPublicKey ?? new Uint8Array(),
      edPublicKey: row.edPublicKey ?? new Uint8Array(),
      companyId: c.certificate.companyId,
      role: "member",
      issuedAt: 1,
    });
    const s = server(c, [ownerRow(c), { ...row, certificate, invitation: null }]);
    const page = await show(c, s.api);
    expect(page.querySelectorAll("select")).toHaveLength(1);
    const select = page.querySelector<HTMLSelectElement>('select[aria-label="Rolle von Anna"]');
    if (!select) throw new Error("no role select");
    expect(select.value).toBe("member");
    select.value = "admin";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(s.roles.map((r) => r.certificate.role)).toEqual(["admin"]);
    expect(s.roles[0]?.rootGrant).toBeDefined();
    s.api.changeRole = async () => false;
    select.value = "owner";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(page.querySelector('[role="alert"]')?.textContent).toBe(
      "Die Rolle konnte nicht geändert werden.",
    );
  });
});
