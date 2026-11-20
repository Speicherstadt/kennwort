import { createApi } from "@kennwort/client/session/api.ts";
import { passphraseKeysWith } from "@kennwort/crypto";
import { describe, expect, it } from "vitest";
import { createSession } from "./session.ts";

// Review of K-303: a server that cannot be reached must come back as an error value
// ("unexpected"), not as a rejected promise that leaves the form busy forever.
const offline: typeof fetch = async () => {
  throw new TypeError("Failed to fetch");
};
const derive = (p: string, salt: Uint8Array, key: Uint8Array, account: Uint8Array) =>
  passphraseKeysWith({ m: 8, t: 1, p: 1 }, p, salt, key, account);
const PASSPHRASE = "Heizung Wasser Licht Kupfer";

describe("session without a reachable server", () => {
  it("setUp answers with an error value", async () => {
    const session = createSession({ api: createApi(offline), storage: undefined, derive });
    const result = await session
      .setUp("code", PASSPHRASE)
      .catch((error: unknown) => ({ rejected: String(error) }));
    expect(result).toEqual({ ok: false, error: "unexpected" });
  });

  it("unlock answers with an error value", async () => {
    const session = createSession({ api: createApi(offline), storage: undefined, derive });
    const result = await session
      .unlock(PASSPHRASE, new Uint8Array(16), "A".repeat(22))
      .catch((error: unknown) => ({ rejected: String(error) }));
    expect(result).toEqual({ ok: false, error: "unexpected" });
  });
});
