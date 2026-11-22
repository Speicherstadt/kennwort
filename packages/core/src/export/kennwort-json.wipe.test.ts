import { describe, expect, it, vi } from "vitest";

// K-504: the export's plaintext bytes are overwritten once sealed or read, so no copy of every
// secret waits in memory for the garbage collector (strings JavaScript cannot wipe)
const seen = vi.hoisted(() => ({ sealed: [] as Uint8Array[], opened: [] as Uint8Array[] }));
vi.mock("@kennwort/crypto", async (original) => {
  const real = await original<typeof import("@kennwort/crypto")>();
  return {
    ...real,
    sealExport: async (passphrase: string, plain: Uint8Array) => {
      seen.sealed.push(plain);
      return real.sealExportWith(
        { m: 8, t: 1, p: 1 },
        passphrase,
        new Uint8Array(16),
        new Uint8Array(24),
        plain.slice(),
      );
    },
    openExportWith: async (...args: Parameters<typeof real.openExportWith>) => {
      const opened = await real.openExportWith(...args);
      if (opened.ok) seen.opened.push(opened.value);
      return opened;
    },
  };
});

const { unlockKennwortExportWith, writeKennwortExport } = await import("./kennwort-json.ts");

describe("plaintext in memory", () => {
  it("zeroes the payload's bytes after sealing and after opening", async () => {
    const file = await writeKennwortExport("Kessel", { version: 1, exportedAt: 0, vaults: [] });
    expect(seen.sealed).toHaveLength(1);
    expect(seen.sealed[0]?.length).toBeGreaterThan(10);
    expect(seen.sealed[0]?.every((byte) => byte === 0)).toBe(true);
    const read = await unlockKennwortExportWith({ m: 8, t: 1, p: 1 }, file, "Kessel");
    expect(read).toEqual({ ok: true, value: [] });
    expect(seen.opened[0]?.length).toBeGreaterThan(10);
    expect(seen.opened[0]?.every((byte) => byte === 0)).toBe(true);
  });
});
