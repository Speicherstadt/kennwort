import { describe, expect, it, vi } from "vitest";
import { bitwardenExportKey } from "./bitwarden.ts";

// The KDF's output is wiped once the enc and mac keys are stretched from it. noble's functions
// are wrapped: the real one, with the arguments recorded.
vi.mock("@noble/hashes/hkdf.js", async (importOriginal) => {
  const hkdf = await importOriginal<typeof import("@noble/hashes/hkdf.js")>();
  return { ...hkdf, expand: vi.fn(hkdf.expand) };
});
const { expand } = await import("@noble/hashes/hkdf.js");

describe("the KDF's output in memory", () => {
  it("is wiped once the keys are stretched from it", async () => {
    const key = await bitwardenExportKey("pw", "salt", { kind: "pbkdf2", iterations: 1 });
    const material = vi.mocked(expand).mock.calls[0]?.[1];
    expect(material?.length).toBe(32);
    expect(material?.every((byte) => byte === 0)).toBe(true);
    expect(key.ok && key.value.encKey.some((byte) => byte !== 0)).toBe(true);
  });
});
