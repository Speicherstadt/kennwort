import type { LinkCreate } from "@kennwort/core";
import { encodeBytes, linkContentOfText, openLinkContent, readLinkSecret } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { makeLink } from "./links.ts";

// K-601: making a link on the creator's device; only the ciphertext goes to the server
const content = linkContentOfText("WLAN Baustelle", "Passwort", "Rohr-Ventil-2026!");
const fetchId = encodeBytes(new Uint8Array(16).fill(2));
const id = encodeBytes(new Uint8Array(16).fill(1));

const server = (answer = true) => {
  const stored: { token: string; link: LinkCreate }[] = [];
  return {
    stored,
    api: {
      createLink: async (token: string, link: LinkCreate) => {
        stored.push({ token, link });
        return answer ? { id, fetchId, expiresAt: 77 } : undefined;
      },
    },
  };
};
const options = { expiresInMs: 3_600_000, maxFetches: 2, passphrase: "" };

describe("makeLink", () => {
  it("stores the ciphertext with expiry and fetches, and puts the secret into the fragment", async () => {
    const { stored, api } = server();
    const made = await makeLink(
      { api, token: "t", origin: "https://k.weber.de" },
      content,
      options,
    );
    if (!made.ok) throw new Error(made.error);
    const url = new URL(made.value.address);
    expect(url.origin).toBe("https://k.weber.de");
    expect(url.pathname).toBe(`/s/${fetchId}`);
    expect(made.value.expiresAt).toBe(77);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token).toBe("t");
    expect(stored[0]?.link.expiresInMs).toBe(3_600_000);
    expect(stored[0]?.link.maxFetches).toBe(2);
    const secret = readLinkSecret(url.hash);
    if (!secret || !stored[0]) throw new Error("no secret or nothing stored");
    expect(await openLinkContent(stored[0].link.ciphertext, secret)).toEqual({
      ok: true,
      value: content,
    });
    // Nothing the server got holds the secret or the content
    const sent = JSON.stringify({ ...stored[0], c: encodeBytes(stored[0].link.ciphertext) });
    expect(sent).not.toContain(url.hash.slice(1));
    expect(sent).not.toContain("Rohr-Ventil");
  });

  it("seals under the passphrase when one is given, and never sends it", async () => {
    const { stored, api } = server();
    const made = await makeLink({ api, token: "t", origin: "https://k" }, content, {
      ...options,
      passphrase: "Pumpe Rohr",
    });
    if (!made.ok || !stored[0]) throw new Error("not made");
    const secret = readLinkSecret(new URL(made.value.address).hash) as Uint8Array;
    expect((await openLinkContent(stored[0].link.ciphertext, secret)).ok).toBe(false);
    expect((await openLinkContent(stored[0].link.ciphertext, secret, "Pumpe Rohr")).ok).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("Pumpe");
  }, 30_000);

  it("says when the server refused, and when the content is too large to send", async () => {
    const deps = { token: "t", origin: "https://k" };
    expect(await makeLink({ ...deps, api: server(false).api }, content, options)).toEqual({
      ok: false,
      error: "failed",
    });
    const { stored, api } = server();
    const huge = linkContentOfText("", "x", "v".repeat(20_001));
    expect(await makeLink({ ...deps, api }, huge, options)).toEqual({
      ok: false,
      error: "too-large",
    });
    expect(stored).toEqual([]);
  });
});
