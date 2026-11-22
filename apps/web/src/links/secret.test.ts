import { encodeBytes, type LinkContent, linkContentOfText, sealLinkContent } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import { fetchSecret, openFetched, readSecretLink } from "./secret.ts";

// K-601: what the recipient's page shows, from the address to the content
const content: LinkContent = linkContentOfText("Tür-Code Lager", "Nachricht", "4711");
const fetchId = encodeBytes(new Uint8Array(16).fill(1));

const sealed = async (passphrase?: string) => {
  const made = await sealLinkContent(content, passphrase);
  if (!made.ok) throw new Error(made.error);
  return made.value;
};

describe("readSecretLink", () => {
  it("takes a fetch ID and a 32-byte secret", () => {
    const secret = new Uint8Array(32).fill(4);
    expect(readSecretLink(fetchId, `#${encodeBytes(secret)}`)).toEqual({ fetchId, secret });
  });

  it("takes nothing with a malformed ID or a missing or short secret", () => {
    const hash = `#${encodeBytes(new Uint8Array(32))}`;
    expect(readSecretLink("abc", hash)).toBeUndefined();
    expect(readSecretLink(fetchId, "")).toBeUndefined();
    expect(readSecretLink(fetchId, `#${encodeBytes(new Uint8Array(16))}`)).toBeUndefined();
  });
});

describe("openFetched", () => {
  it("opens the content and says how many fetches are left", async () => {
    const { secret, ciphertext } = await sealed();
    expect(await openFetched(ciphertext, secret, 1)).toEqual({
      state: "open",
      content,
      remaining: 1,
    });
  });

  it("asks for a passphrase, then again after a wrong one, and opens with the right one", async () => {
    const { secret, ciphertext } = await sealed("Kessel");
    expect(await openFetched(ciphertext, secret, 0)).toEqual({
      state: "passphrase",
      ciphertext,
      remaining: 0,
      wrong: false,
    });
    expect(await openFetched(ciphertext, secret, 0, "Rohr")).toEqual({
      state: "passphrase",
      ciphertext,
      remaining: 0,
      wrong: true,
    });
    expect(await openFetched(ciphertext, secret, 0, "Kessel")).toEqual({
      state: "open",
      content,
      remaining: 0,
    });
  }, 30_000);

  it("calls a ciphertext the secret does not open damaged", async () => {
    const { ciphertext } = await sealed();
    expect(await openFetched(ciphertext, new Uint8Array(32), 0)).toEqual({ state: "damaged" });
    expect(await openFetched(Uint8Array.of(9, 9), new Uint8Array(32), 0, "x")).toEqual({
      state: "damaged",
    });
  });
});

describe("fetchSecret", () => {
  it("fetches once by the ID and opens what came back", async () => {
    const { secret, ciphertext } = await sealed();
    const asked: string[] = [];
    const view = await fetchSecret(
      async (id) => {
        asked.push(id);
        return { ok: true, value: { ciphertext, remaining: 0, expiresAt: 1 } };
      },
      { fetchId, secret },
    );
    expect(asked).toEqual([fetchId]);
    expect(view).toEqual({ state: "open", content, remaining: 0 });
  });

  it("tells gone, too many and no server apart", async () => {
    const link = { fetchId, secret: new Uint8Array(32) };
    const cases = [
      ["gone", "gone"],
      ["too-many-requests", "too-many"],
      ["unreachable", "unreachable"],
      ["unexpected", "unreachable"],
    ] as const;
    for (const [error, state] of cases)
      expect(await fetchSecret(async () => ({ ok: false, error }), link)).toEqual({ state });
  });
});
