import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openKdbx } from "../import/kdbx.ts";
import { readKdbxHeader } from "../import/kdbx-header.ts";
import { readHmacBlocks } from "../import/kdbx-payload.ts";
import { hmacBlocks, KDBX_EXPORT_ARGON2, writeKdbx } from "./kdbx.ts";
import { BUERO, TECHNIK, WEBER } from "./test/weber.ts";

const cheap = { memoryKiB: 8, iterations: 1, parallelism: 1 };
let seed = 0;
const random = (length: number) =>
  Uint8Array.from({ length }, () => (seed = (seed * 31 + 7) % 251));
const options = { argon2: cheap, random };
const NOW = 1_800_000_000;

describe("writeKdbx", () => {
  it("costs Argon2id 64 MiB, three passes and one lane by default", () => {
    expect(KDBX_EXPORT_ARGON2).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
    expect(Object.isFrozen(KDBX_EXPORT_ARGON2)).toBe(true);
  });

  it("writes a KDBX 4.0 header with ChaCha20, no compression and Argon2id", async () => {
    const file = await writeKdbx(WEBER, "Kessel Rohr", NOW, options);
    expect(Array.from(file.subarray(0, 12))).toEqual([
      0x03, 0xd9, 0xa2, 0x9a, 0x67, 0xfb, 0x4b, 0xb5, 0x00, 0x00, 0x04, 0x00,
    ]);
    const header = readKdbxHeader(file);
    if (!header.ok) throw new Error(header.error);
    expect(header.value).toMatchObject({ cipher: "chacha20", compressed: false });
    expect(header.value.iv).toHaveLength(12);
    expect(header.value.masterSeed).toHaveLength(32);
    expect(header.value.kdf).toMatchObject({
      kind: "argon2id",
      version: 0x13,
      memoryKiB: 8,
      iterations: 1,
      parallelism: 1,
    });
    expect(header.value.kdf.kind === "argon2id" && header.value.kdf.salt).toHaveLength(32);
    // The end field holds "\r\n\r\n", as KeePassXC writes it
    expect(new TextDecoder().decode(file.subarray(header.value.end - 4, header.value.end))).toBe(
      "\r\n\r\n",
    );
  });

  it("refuses an empty password", async () => {
    await expect(writeKdbx(WEBER, "", NOW, options)).rejects.toThrow(
      "export password must not be empty",
    );
  });

  it("fails loudly on Argon2 parameters noble refuses", async () => {
    await expect(
      writeKdbx(WEBER, "x", NOW, { random, argon2: { ...cheap, memoryKiB: 1 } }),
    ).rejects.toThrow("Argon2 parameters out of range");
  });
});

describe("hmacBlocks", () => {
  it("splits at 1 MiB and ends with an empty block, each readable with the key", () => {
    const key = new Uint8Array(64).fill(5);
    const data = Uint8Array.from({ length: 1024 * 1024 + 3 }, (_, i) => i & 0xff);
    const blocks = hmacBlocks(data, key);
    // Three blocks: 1 MiB, 3 bytes, empty; each with 32 bytes MAC and 4 bytes size
    expect(blocks.length).toBe(data.length + 3 * 36);
    expect(readHmacBlocks(blocks, 0, key)).toEqual({ ok: true, value: data });
    expect(readHmacBlocks(hmacBlocks(new Uint8Array(), key), 0, key)).toEqual({
      ok: true,
      value: new Uint8Array(),
    });
    expect(hmacBlocks(new Uint8Array(), key).length).toBe(36);
  });
});

// Round trip: what the export writes, the import's KDBX reader (K-502 Teil 3) opens
describe("KDBX round trip", () => {
  const read = async (password = "Kessel Rohr") => {
    const file = await writeKdbx(WEBER, "Kessel Rohr", NOW, options);
    return openKdbx(file, { password });
  };

  it("opens only with the password", async () => {
    expect(await read("kessel rohr")).toEqual({ ok: false, error: "wrong-key" });
  });

  it("brings back every entry with its vault as folder, secrets secret, tags and history", async () => {
    const result = await read();
    if (!result.ok) throw new Error(result.error);
    expect(result.value.map((e) => [e.content.title, e.folders])).toEqual([
      ["Online-Banking Sparkasse", ["Büro"]],
      ["Alarmanlage Lager", ["Büro"]],
      ["Werkstatt-WLAN", ["Technik"]],
      ["Fernwartung Wärmepumpe", ["Technik"]],
    ]);
    const banking = result.value[0]?.content;
    const fields = banking?.fields.map((f) => [f.name, f.value, f.kind]);
    expect(fields).toEqual([
      ["Username", "jonas.weber", "text"],
      ["Password", "Sp@rkasse-2026!", "secret"],
      ["Website", "https://banking.sparkasse.example", "url"],
      ["Website", "https://app.sparkasse.example", "url"],
      [
        "One-time code",
        "otpauth://totp/Sparkasse:jonas?secret=JBSWY3DPEHPK3PXP&issuer=Sparkasse",
        "totp",
      ],
      ["Kundennummer", "7788-1", "text"],
      ["PIN", "4711", "secret"],
      ["Notes", 'TAN per App\nKontakt: Filiale "Mitte"', "note"],
    ]);
    expect(banking?.tags).toEqual(["Bank", "Büro"]);
    // The reader keeps milliseconds; the app's history keeps seconds
    expect(banking?.history.map((h) => [h.value, h.replacedAt])).toEqual([
      ["Sp@rkasse-2024!", 1_730_000_000_000],
      ["Sp@rkasse-2025!", 1_760_000_000_000],
    ]);
    const wifi = result.value[2]?.content.fields.map((f) => [f.name, f.value]);
    expect(wifi).toContainEqual(["Password", "Kupfer & <Rohr> 18"]);
    const ssh = result.value[3]?.content.fields.map((f) => [f.name, f.value, f.kind]);
    expect(ssh).toContainEqual([
      "Privater Schlüssel",
      TECHNIK.entries[1]?.fields[0]?.value,
      "secret",
    ]);
    expect(result.value[1]?.content.type).toBe("note");
    expect(BUERO.entries).toHaveLength(2);
  });
});

// KeePassXC itself opens the export, where its CLI is installed (the sandbox has 2.7; CI does not)
const cli = spawnSync("keepassxc-cli", ["--version"], { encoding: "utf8" });
describe.runIf(cli.status === 0)("KDBX export in KeePassXC (keepassxc-cli)", () => {
  it("opens the database and shows the entries with their protected values", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kennwort-kdbx-"));
    try {
      const path = join(dir, "export.kdbx");
      writeFileSync(path, await writeKdbx(WEBER, "Kessel Rohr", NOW, options));
      const run = (...args: string[]) =>
        spawnSync("keepassxc-cli", [...args], { input: "Kessel Rohr\n", encoding: "utf8" });
      const list = run("ls", "-R", "-f", path);
      expect(list.status).toBe(0);
      expect(list.stdout).toContain("Büro/Online-Banking Sparkasse");
      expect(list.stdout).toContain("Technik/Fernwartung Wärmepumpe");
      const shown = run(
        "show",
        "-s",
        "-a",
        "Password",
        "-a",
        "PIN",
        path,
        "Büro/Online-Banking Sparkasse",
      );
      expect(shown.status).toBe(0);
      expect(shown.stdout).toContain("Sp@rkasse-2026!\n4711");
      const totp = run("show", "-t", path, "Büro/Online-Banking Sparkasse");
      expect(totp.stdout).toMatch(/^\d{6}$/m);
      expect(run("ls", path).status).toBe(0);
      const wrong = spawnSync("keepassxc-cli", ["ls", path], {
        input: "falsch\n",
        encoding: "utf8",
      });
      expect(wrong.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
