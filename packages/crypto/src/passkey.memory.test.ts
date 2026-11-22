import { afterEach, describe, expect, it, vi } from "vitest";
import { newPasskeyKey, passkeyPublicKey, passkeySign } from "./passkey.ts";

// F-12: the scalar is wiped from every copy passkey.ts makes, also when signing fails. noble's
// objects are frozen, so the curve is wrapped: the real one, with the arguments recorded.
const curve = vi.hoisted(() => ({ failSign: false }));
vi.mock("@noble/curves/nist.js", async (importOriginal) => {
  const { p256 } = await importOriginal<typeof import("@noble/curves/nist.js")>();
  return {
    p256: {
      getPublicKey: vi.fn(p256.getPublicKey),
      sign: vi.fn((...args: Parameters<typeof p256.sign>) => {
        if (curve.failSign) throw new Error("broken");
        return p256.sign(...args);
      }),
      utils: {
        randomSecretKey: vi.fn(p256.utils.randomSecretKey),
        isValidSecretKey: vi.fn(p256.utils.isValidSecretKey),
      },
    },
  };
});
const { p256 } = await import("@noble/curves/nist.js");

const zero = (bytes: unknown) => bytes instanceof Uint8Array && bytes.every((b) => b === 0);

afterEach(() => {
  vi.clearAllMocks();
  curve.failSign = false;
});

describe("the scalar in memory", () => {
  it("is wiped once a new key holds it", () => {
    const key = newPasskeyKey();
    expect(zero(vi.mocked(p256.utils.randomSecretKey).mock.results[0]?.value)).toBe(true);
    expect(zero(key.slice(1))).toBe(false);
  });

  it("is wiped after the public key and after a signature", () => {
    const key = newPasskeyKey();
    expect(passkeyPublicKey(key).ok).toBe(true);
    expect(zero(vi.mocked(p256.getPublicKey).mock.calls[0]?.[0])).toBe(true);
    expect(passkeySign(key, new Uint8Array(4)).ok).toBe(true);
    expect(zero(vi.mocked(p256.sign).mock.calls[0]?.[1])).toBe(true);
    expect(zero(key.slice(1))).toBe(false);
  });

  it("is wiped when signing fails", () => {
    curve.failSign = true;
    expect(() => passkeySign(newPasskeyKey(), new Uint8Array(1))).toThrow("broken");
    expect(zero(vi.mocked(p256.sign).mock.calls[0]?.[1])).toBe(true);
  });

  it("is wiped when it is no valid scalar", () => {
    const result = passkeyPublicKey(Uint8Array.of(1, ...new Uint8Array(32).fill(0xff)));
    expect(result).toEqual({ ok: false, error: "invalid-key" });
    expect(zero(vi.mocked(p256.utils.isValidSecretKey).mock.calls[0]?.[0])).toBe(true);
  });
});
