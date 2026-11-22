// E-20 against one-time links (K-601, P-18): what a server that reads everything, or lies, gets
// out of a link. It sees every request the creator and the recipient make, and it stores the
// ciphertext; it never sees the secret, and what it hands out instead opens to nothing.
import { describe, expect, it } from "bun:test";
import {
  encodeBytes,
  LinkCreated,
  LinkFetched,
  linkAddress,
  linkContentOfText,
  openLinkContent,
  readLinkSecret,
  sealLinkContent,
} from "@kennwort/core";
import { oneTimeLinks } from "../db/schema.ts";
import { signInSetup } from "../testing/sign-in-setup.ts";

const content = linkContentOfText("Tür-Code Lager", "Nachricht", "Kessel-4711");

/** Jonas makes a link the way the app does, and every byte that reached the server is recorded */
const madeLink = async (passphrase?: string) => {
  const server = await signInSetup();
  const jonas = await server.member("weber", "owner");
  const seen: string[] = [];
  const send = async (path: string, init: { method?: string; token?: string; body?: unknown }) => {
    seen.push(path, JSON.stringify(init.body ?? null));
    return server.request(path, init);
  };
  const sealed = await sealLinkContent(content, passphrase);
  if (!sealed.ok) throw new Error(sealed.error);
  const { secret, ciphertext } = sealed.value;
  const answer = await send("/api/links", {
    token: jonas.token,
    body: { ciphertext: encodeBytes(ciphertext), expiresInMs: 3_600_000, maxFetches: 2 },
  });
  const made = LinkCreated.parse(await answer.json());
  const address = linkAddress("https://kennwort.weber-haustechnik.de", made.fetchId, secret);
  return { ...server, seen, send, secret, ciphertext, made, address };
};

describe("E-20: the server and a one-time link", () => {
  it("never sees the secret, the passphrase or the content, from creator or recipient", async () => {
    const { seen, send, secret, address, db } = await madeLink("Pumpe Rohr");
    // The recipient: the path goes to the server, the fragment stays in the browser
    const url = new URL(address);
    const fetched = await send(`/auth/links/${url.pathname.split("/").at(-1)}/open`, {
      method: "POST",
    });
    const { ciphertext } = LinkFetched.parse(await fetched.json());
    const key = readLinkSecret(url.hash);
    if (!key) throw new Error("no secret in the fragment");
    expect(await openLinkContent(ciphertext, key, "Pumpe Rohr")).toEqual({
      ok: true,
      value: content,
    });
    const everything = [...seen, JSON.stringify(db.select().from(oneTimeLinks).all())].join("\n");
    for (const secretPart of [
      encodeBytes(secret),
      Buffer.from(secret).toString("hex"),
      Buffer.from(secret).toString("base64"),
      "Pumpe Rohr",
      "Kessel-4711",
      "Tür-Code",
    ])
      expect(everything).not.toContain(secretPart);
  });

  it("cannot open what it stores: every key it could try is not the link's", async () => {
    const { db, secret } = await madeLink();
    const row = db.select().from(oneTimeLinks).get();
    const stored = new Uint8Array(row?.ciphertext ?? []);
    for (const guess of [
      new Uint8Array(32),
      Buffer.from(row?.fetchHash ?? "", "hex"),
      secret.map((b) => b ^ 1),
    ])
      expect((await openLinkContent(stored, guess)).ok).toBe(false);
  });

  it("hands out another link's ciphertext: the recipient's secret does not open it", async () => {
    const first = await madeLink();
    const second = await sealLinkContent(linkContentOfText("Anderes", "Nachricht", "fremd"));
    if (!second.ok) throw new Error(second.error);
    expect(await openLinkContent(second.value.ciphertext, first.secret)).toEqual({
      ok: false,
      error: "wrong-secret",
    });
  });

  it("strips the passphrase from a protected link: nothing opens", async () => {
    const { ciphertext, secret } = await madeLink("Pumpe Rohr");
    const stripped = Uint8Array.of(1, 0, ...ciphertext.subarray(18));
    expect((await openLinkContent(stripped, secret)).ok).toBe(false);
  });

  // Restrisiko (P-18): the count and the expiry are the server's to keep. One that ignores them
  // hands the same ciphertext out again, and it still opens; this test pins that down honestly.
  it("can replay a ciphertext past its count, which still opens: limits hold only on an honest server", async () => {
    const { ciphertext, secret } = await madeLink();
    for (let i = 0; i < 3; i++)
      expect(await openLinkContent(ciphertext, secret)).toEqual({ ok: true, value: content });
  });
});
