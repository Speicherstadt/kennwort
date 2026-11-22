import { describe, expect, it } from "vitest";
import { EntryContent } from "../sync/content.ts";
import {
  CREDENTIAL_ID_LENGTH,
  MAX_USER_HANDLE,
  passkeyContent,
  passkeyOf,
} from "./passkey-entry.ts";

// K-406, F-12: a passkey as an entry with fixed field IDs, all inside the entry's ciphertext
const passkey = {
  rpId: "weber-haustechnik.test",
  rpName: "Weber Portal",
  username: "jonas.weber",
  displayName: "Jonas Weber",
  userHandle: Uint8Array.of(1, 2, 3),
  credentialId: Uint8Array.from({ length: 16 }, (_, i) => i),
  key: Uint8Array.of(1, 9, 9),
};
const { rpName: _, ...stored } = passkey;

describe("passkeyContent", () => {
  it("is a passkey entry with the fixed fields; only the key is secret", () => {
    const content = passkeyContent(passkey);
    expect(EntryContent.parse(content)).toEqual(content);
    expect(content).toEqual({
      type: "passkey",
      title: "Weber Portal",
      fields: [
        { id: "rp-id", name: "rp-id", value: "weber-haustechnik.test", kind: "text" },
        { id: "username", name: "username", value: "jonas.weber", kind: "text" },
        { id: "display-name", name: "display-name", value: "Jonas Weber", kind: "text" },
        { id: "user-handle", name: "user-handle", value: "AQID", kind: "text" },
        {
          id: "credential-id",
          name: "credential-id",
          value: "AAECAwQFBgcICQoLDA0ODw",
          kind: "text",
        },
        { id: "private-key", name: "private-key", value: "AQkJ", kind: "secret" },
        { id: "counter", name: "counter", value: "0", kind: "text" },
      ],
      tags: [],
      favorite: false,
      history: [],
    });
    expect([CREDENTIAL_ID_LENGTH, MAX_USER_HANDLE]).toEqual([16, 64]);
  });

  it("takes the rpId as title when the relying party gives no name", () => {
    expect(passkeyContent({ ...passkey, rpName: "  " }).title).toBe("weber-haustechnik.test");
    expect(passkeyContent({ ...passkey, rpName: " Weber " }).title).toBe("Weber");
  });
});

describe("passkeyOf", () => {
  const content = passkeyContent(passkey);
  const without = (id: string) => ({
    ...content,
    fields: content.fields.filter((f) => f.id !== id),
  });
  const replaced = (id: string, value: string) => ({
    ...content,
    fields: content.fields.map((f) => (f.id === id ? { ...f, value } : f)),
  });

  it("reads back what passkeyContent wrote", () => {
    expect(passkeyOf(content)).toEqual(stored);
  });

  it("reads names as empty when they are missing", () => {
    const bare = without("username");
    expect(
      passkeyOf({ ...bare, fields: bare.fields.filter((f) => f.id !== "display-name") }),
    ).toEqual({
      ...stored,
      username: "",
      displayName: "",
    });
  });

  it("is nothing for another type or a broken passkey", () => {
    expect(passkeyOf({ ...content, type: "login" })).toBeUndefined();
    for (const id of ["rp-id", "user-handle", "credential-id", "private-key"])
      expect(passkeyOf(without(id)), id).toBeUndefined();
    expect(passkeyOf(replaced("rp-id", ""))).toBeUndefined();
    expect(passkeyOf(replaced("credential-id", ""))).toBeUndefined();
    expect(passkeyOf(replaced("private-key", ""))).toBeUndefined();
    expect(passkeyOf(replaced("private-key", "A+B/"))).toBeUndefined();
    expect(
      passkeyOf(replaced("user-handle", Buffer.alloc(65).toString("base64url"))),
    ).toBeUndefined();
    expect(
      passkeyOf(replaced("user-handle", Buffer.alloc(64).toString("base64url")))?.userHandle.length,
    ).toBe(64);
    expect(passkeyOf(replaced("user-handle", ""))?.userHandle.length).toBe(0);
  });
});
