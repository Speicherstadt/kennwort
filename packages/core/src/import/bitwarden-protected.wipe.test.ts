import { describe, expect, it, vi } from "vitest";

// K-502 Teil 4: the export's keys and its decrypted bytes are overwritten once read, so no copy
// waits in memory for the garbage collector (strings JavaScript cannot wipe)
const seen = vi.hoisted(() => ({ keys: [] as Uint8Array[], plain: [] as Uint8Array[] }));
vi.mock("@kennwort/crypto", async (original) => {
  const real = await original<typeof import("@kennwort/crypto")>();
  return {
    ...real,
    bitwardenExportKey: async (...args: Parameters<typeof real.bitwardenExportKey>) => {
      const key = await real.bitwardenExportKey(...args);
      if (key.ok) seen.keys.push(key.value.encKey, key.value.macKey);
      return key;
    },
    bitwardenDecrypt: (...args: Parameters<typeof real.bitwardenDecrypt>) => {
      const opened = real.bitwardenDecrypt(...args);
      if (opened.ok) seen.plain.push(opened.value);
      return opened;
    },
  };
});

const { unlockBitwardenJson } = await import("./bitwarden-protected.ts");
const { exportBytes, protectedExport, TEST_PASSWORD } = await import("./test/bitwarden.ts");
const { fixtureText } = await import("./test/helpers.ts");

const zero = (bytes: Uint8Array | undefined) => bytes?.every((byte) => byte === 0);

describe("keys and plaintext in memory", () => {
  it("zeroes both keys and the decrypted content once the entries are read", async () => {
    const file = exportBytes(protectedExport(fixtureText("bitwarden.json")));
    const read = await unlockBitwardenJson(file, { password: TEST_PASSWORD });
    expect(read.ok && read.value.length).toBe(5);
    expect(seen.keys.map((key) => [key.length, zero(key)])).toEqual([
      [32, true],
      [32, true],
    ]);
    // The key check, then the content
    expect(seen.plain).toHaveLength(2);
    expect(seen.plain[1]?.length).toBeGreaterThan(100);
    expect(zero(seen.plain[1])).toBe(true);
  });
});
