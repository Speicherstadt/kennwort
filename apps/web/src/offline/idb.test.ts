import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { indexedDbKeyValue } from "./idb.ts";

describe("the offline copy in IndexedDB", () => {
  it("keeps text under a key, across a new connection, until it is cleared", async () => {
    const factory = new IDBFactory();
    const first = indexedDbKeyValue(factory);
    await first.set("keys", "ciphertext");
    expect(await first.get("keys")).toBe("ciphertext");
    const second = indexedDbKeyValue(factory);
    expect(await second.get("keys")).toBe("ciphertext");
    expect(await second.get("missing")).toBeUndefined();
    await second.clear();
    expect(await first.get("keys")).toBeUndefined();
  });

  it("keeps nothing and fails nothing without IndexedDB (a private window may have none)", async () => {
    const none = indexedDbKeyValue(undefined);
    await none.set("keys", "ciphertext");
    expect(await none.get("keys")).toBeUndefined();
    await expect(none.clear()).resolves.toBeUndefined();
  });

  it("keeps nothing and fails nothing when the database does not open", async () => {
    const broken = {
      open: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as globalThis.IDBFactory;
    const store = indexedDbKeyValue(broken);
    await store.set("keys", "ciphertext");
    expect(await store.get("keys")).toBeUndefined();
  });
});
