import { describe, expect, it, vi } from "vitest";

// K-601: a link's plaintext bytes are overwritten once sealed or read, as the export's are, so no
// copy of the secret waits in memory for the garbage collector (strings JavaScript cannot wipe)
const seen = vi.hoisted(() => ({
  encoded: [] as Uint8Array[],
  sealed: [] as Uint8Array[],
  opened: [] as Uint8Array[],
}));
vi.mock("@kennwort/crypto", async (original) => {
  const real = await original<typeof import("@kennwort/crypto")>();
  return {
    ...real,
    sealLink: async (plain: Uint8Array) => {
      seen.sealed.push(plain);
      return real.sealLink(plain.slice());
    },
    openLink: async (...args: Parameters<typeof real.openLink>) => {
      const opened = await real.openLink(...args);
      if (opened.ok) seen.opened.push(opened.value);
      return opened;
    },
  };
});
vi.mock("./content.ts", async (original) => {
  const real = await original<typeof import("./content.ts")>();
  return {
    ...real,
    encodeLinkContent: (content: Parameters<typeof real.encodeLinkContent>[0]) => {
      const bytes = real.encodeLinkContent(content);
      seen.encoded.push(bytes);
      return bytes;
    },
  };
});

const { linkContentOfText } = await import("./content.ts");
const { openLinkContent, sealLinkContent } = await import("./link.ts");

const zeroed = (bytes: Uint8Array | undefined) =>
  bytes !== undefined && bytes.length > 10 && bytes.every((byte) => byte === 0);

describe("plaintext in memory", () => {
  it("zeroes the content's bytes after sealing and after opening", async () => {
    const content = linkContentOfText("Tür-Code", "Nachricht", "4711");
    const made = await sealLinkContent(content);
    if (!made.ok) throw new Error(made.error);
    expect(zeroed(seen.encoded.at(-1))).toBe(true);
    expect(seen.sealed.at(-1)?.length).toBe(256);
    expect(zeroed(seen.sealed.at(-1))).toBe(true);
    expect(await openLinkContent(made.value.ciphertext, made.value.secret)).toEqual({
      ok: true,
      value: content,
    });
    expect(zeroed(seen.opened.at(-1))).toBe(true);
  });

  it("zeroes them when the content is too large to send", async () => {
    const huge = {
      version: 1 as const,
      title: "",
      fields: Array.from({ length: 4 }, () => ({
        label: "",
        value: "v".repeat(16_300),
        secret: true,
      })),
    };
    expect(await sealLinkContent(huge)).toEqual({ ok: false, error: "too-large" });
    expect(seen.encoded.at(-1)?.length).toBeGreaterThan(65_000);
    expect(zeroed(seen.encoded.at(-1))).toBe(true);
  });
});
