import type { ShownEntry } from "@kennwort/client/entries/entries.ts";
import type { LinkCreate, LinkSummary } from "@kennwort/core";
import { encodeBytes, openLinkContent, readLinkSecret } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { LinkDialog } from "./link-dialog.tsx";
import { LinksPage, type LinksPageDeps } from "./links-page.tsx";

// K-601: the creator's side, the entry's dialog and the page „Einmal-Links“
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    flush();
  }
};

const id = (n: number) => encodeBytes(new Uint8Array(16).fill(n));
const summary = (n: number, remaining: number): LinkSummary => ({
  id: id(n),
  createdAt: Date.UTC(2026, 10, 22, 9 + n),
  expiresAt: Date.UTC(2026, 10, 23, 9),
  maxFetches: 2,
  remaining,
});

const fakeServer = (links: LinkSummary[] = []) => {
  const created: LinkCreate[] = [];
  const revoked: string[] = [];
  const api: LinksPageDeps["api"] = {
    createLink: async (_token, link) => {
      created.push(link);
      return { id: id(9), fetchId: id(8), expiresAt: Date.UTC(2026, 10, 23, 12) };
    },
    myLinks: async () => links.filter((l) => !revoked.includes(l.id)),
    revokeLink: async (_token, linkId) => {
      revoked.push(linkId);
      return true;
    },
  };
  return { api, created, revoked };
};

const mount = (view: () => ReturnType<typeof LinksPage>) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(view, root);
  flush();
  return root;
};

const field = (root: ParentNode, label: string) => {
  const labelled = [...root.querySelectorAll("label")].find((l) => l.textContent === label);
  const found = labelled && root.querySelector<HTMLInputElement>(`#${labelled.htmlFor}`);
  if (!found) throw new Error(`no field ${label}`);
  return found;
};
const type = (root: ParentNode, label: string, value: string) => {
  const input = field(root, label);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  flush();
};

describe("LinksPage", () => {
  it("lists the account's links with what is left and revokes one", async () => {
    const { api, revoked } = fakeServer([summary(1, 2), summary(2, 1)]);
    const root = mount(() => <LinksPage deps={{ api, token: "t", origin: "https://k" }} />);
    await until(() => root.querySelectorAll("li").length === 2);
    expect(root.textContent).toContain("noch 2 von 2 Abrufen");
    expect(root.textContent).toContain("noch 1 von 2 Abrufen");
    const revoke = root.querySelector<HTMLButtonElement>('button[aria-label^="Link vom"]');
    revoke?.click();
    await until(() => root.querySelectorAll("li").length === 1);
    expect(revoked).toEqual([id(1)]);
  });

  it("makes a link for a free text with the chosen expiry and fetches, and shows it once", async () => {
    const { api, created } = fakeServer();
    const root = mount(() => (
      <LinksPage deps={{ api, token: "t", origin: "https://k.weber.de" }} />
    ));
    await until(() => root.textContent?.includes("Keine aktiven Links.") ?? false);
    type(root, "Titel (optional)", "Tür-Code Lager");
    type(root, "Geheimnis", "4711");
    type(root, "Gültig für", String(7 * 24 * 3_600_000));
    type(root, "Abrufe", "3");
    root.querySelector("form")?.requestSubmit();
    await until(() => root.textContent?.includes("Link kopieren") ?? false);
    expect(created.map((c) => [c.expiresInMs, c.maxFetches])).toEqual([[604_800_000, 3]]);
    const address = field(root, "Einmal-Link").value;
    expect(address).toMatch(new RegExp(`^https://k\\.weber\\.de/s/${id(8)}#`));
    const secret = readLinkSecret(new URL(address).hash) as Uint8Array;
    const opened = await openLinkContent(created[0]?.ciphertext as Uint8Array, secret);
    expect(opened.ok && opened.value).toEqual({
      version: 1,
      title: "Tür-Code Lager",
      fields: [{ label: "Geheimnis", value: "4711", secret: true }],
    });
  });
});

const entry = (fields: ShownEntry["fields"]): ShownEntry => ({
  id: "e",
  type: "login",
  title: "Sparkasse",
  subtitle: "",
  fields,
  username: "",
  password: "",
  website: "",
  vault: "v",
  favorite: false,
  tags: [],
  history: [],
  weak: false,
  reused: 0,
  changedAt: 0,
  changedBy: "",
  access: [],
});

describe("LinkDialog", () => {
  it("names what goes into the link, leaves out a TOTP seed, and makes it", async () => {
    const { api, created } = fakeServer();
    const shown = entry([
      { id: "username", label: "Benutzername", value: "jonas", kind: "text" },
      { id: "password", label: "Passwort", value: "Rohr-Ventil-2026!", kind: "secret" },
      { id: "totp", label: "Einmalcode", value: "otpauth://totp/x?secret=AB", kind: "totp" },
    ]);
    const root = mount(() => (
      <LinkDialog
        entry={shown}
        deps={{ api, token: "t", origin: "https://k" }}
        onClose={() => {}}
      />
    ));
    expect(document.body.textContent).toContain("Einmal-Link für Sparkasse");
    expect(document.body.textContent).toContain("Im Link: Benutzername, Passwort");
    document.querySelector("form")?.requestSubmit();
    await until(() => document.body.textContent?.includes("Link kopieren") ?? false);
    expect(created.map((c) => [c.expiresInMs, c.maxFetches])).toEqual([[86_400_000, 1]]);
    expect(root).toBeDefined();
  });

  it("offers nothing for an entry without fields to share", () => {
    const { api } = fakeServer();
    mount(() => (
      <LinkDialog
        entry={entry([])}
        deps={{ api, token: "t", origin: "https://k" }}
        onClose={() => {}}
      />
    ));
    expect(document.body.textContent).toContain("keine Felder");
    expect(document.querySelector("form")).toBeNull();
  });
});
