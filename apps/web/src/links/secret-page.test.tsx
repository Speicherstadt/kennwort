import type { LinkApi } from "@kennwort/client/session/links-api.ts";
import { encodeBytes, linkContentOfText, sealLinkContent } from "@kennwort/core";
import { setLocale } from "@kennwort/ui";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { SecretPage } from "./secret-page.tsx";

// K-601: the recipient's page; it fetches nothing until „Anzeigen“
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

const fetchId = encodeBytes(new Uint8Array(16).fill(1));
const content = linkContentOfText("Tür-Code Lager", "Nachricht", "Kessel-4711");

const show = (hash: string, fetchLink: LinkApi["fetchLink"], id = fetchId) => {
  setLocale("de", { reload: false });
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <SecretPage fetchId={id} hash={hash} fetchLink={fetchLink} />, root);
  flush();
  return root;
};

const button = (root: ParentNode, name: string) => {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(name));
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

const link = async (passphrase?: string) => {
  const made = await sealLinkContent(content, passphrase);
  if (!made.ok) throw new Error(made.error);
  const calls: string[] = [];
  let remaining = 1;
  const fetchLink: LinkApi["fetchLink"] = async (id) => {
    calls.push(id);
    return {
      ok: true,
      value: { ciphertext: made.value.ciphertext, remaining: remaining--, expiresAt: 1 },
    };
  };
  return { hash: `#${encodeBytes(made.value.secret)}`, fetchLink, calls };
};

describe("SecretPage", () => {
  it("fetches nothing on load, only on „Anzeigen“, then shows the content hidden", async () => {
    const { hash, fetchLink, calls } = await link();
    const root = show(hash, fetchLink);
    expect(root.textContent).toContain("Geteiltes Geheimnis");
    expect(calls).toEqual([]);
    button(root, "Anzeigen").click();
    await until(() => root.textContent?.includes("Tür-Code Lager") ?? false);
    expect(calls).toEqual([fetchId]);
    expect(root.textContent).toContain("Nachricht");
    expect(root.textContent).not.toContain("Kessel-4711");
    expect(root.textContent).toContain("noch 1-mal öffnen");
    root.querySelector<HTMLButtonElement>('[aria-label="Nachricht aufdecken"]')?.click();
    flush();
    expect(root.textContent).toContain("Kessel-4711");
  });

  it("says when the link is used up with this fetch", async () => {
    const made = await link();
    const root = show(made.hash, async (id) => {
      const answer = await made.fetchLink(id);
      return answer.ok ? { ...answer, value: { ...answer.value, remaining: 0 } } : answer;
    });
    button(root, "Anzeigen").click();
    await until(() => root.textContent?.includes("verbraucht") ?? false);
    expect(root.textContent).toContain("Der Link ist damit verbraucht");
  });

  it("says „abgelaufen“ for a link the server no longer has", async () => {
    const { hash } = await link();
    const root = show(hash, async () => ({ ok: false, error: "gone" }));
    button(root, "Anzeigen").click();
    await until(() => root.querySelector('[role="alert"]') !== null);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("abgelaufen");
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  it("offers to try again without a server", async () => {
    const { hash, fetchLink } = await link();
    let first = true;
    const root = show(hash, async (id) => {
      if (first) {
        first = false;
        return { ok: false, error: "unreachable" };
      }
      return fetchLink(id);
    });
    button(root, "Anzeigen").click();
    await until(() => root.textContent?.includes("Noch einmal versuchen") ?? false);
    button(root, "Noch einmal versuchen").click();
    await until(() => root.textContent?.includes("Tür-Code Lager") ?? false);
  });

  it("offers no fetch for an incomplete link", async () => {
    const calls: string[] = [];
    const fetchLink: LinkApi["fetchLink"] = async (id) => {
      calls.push(id);
      return { ok: false, error: "gone" };
    };
    for (const [hash, id] of [
      ["", fetchId],
      ["#kurz", fetchId],
      [`#${encodeBytes(new Uint8Array(32))}`, "abc"],
    ]) {
      const root = show(hash as string, fetchLink, id);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain("unvollständig");
      expect(root.querySelectorAll("button")).toHaveLength(0);
      dispose();
      document.body.innerHTML = "";
    }
    expect(calls).toEqual([]);
  });

  it("asks for the passphrase after the fetch, and again after a wrong one", async () => {
    const { hash, fetchLink, calls } = await link("Pumpe Rohr");
    const root = show(hash, fetchLink);
    button(root, "Anzeigen").click();
    await until(() => root.querySelector('input[type="password"]') !== null);
    const enter = async (value: string) => {
      const input = root.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error("no passphrase field");
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flush();
      root.querySelector("form")?.requestSubmit();
      flush();
    };
    await enter("falsch");
    await until(() => root.textContent?.includes("Die Passphrase stimmt nicht.") ?? false);
    await enter("Pumpe Rohr");
    await until(() => root.textContent?.includes("Tür-Code Lager") ?? false);
    // The ciphertext was fetched once; the passphrase tries need no second fetch
    expect(calls).toEqual([fetchId]);
  }, 30_000);
});
