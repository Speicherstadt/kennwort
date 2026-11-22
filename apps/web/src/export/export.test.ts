import {
  type EntryContent,
  IMPORT_FORMATS,
  type MemberView,
  parseExportSubject,
} from "@kennwort/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExport,
  download,
  type ExportDeps,
  type ExportFile,
  fileName,
  MIN_PASSPHRASE,
  mayExport,
  runExport,
  vaultsIn,
} from "./export.ts";

// K-504: who exports, what goes into the file, and that the audit log comes first
const login = (title: string, password: string): EntryContent => ({
  type: "login",
  title,
  fields: [
    { id: "username", name: "Benutzername", value: "jonas", kind: "text" },
    { id: "password", name: "Passwort", value: password, kind: "secret" },
  ],
  tags: ["Büro"],
  favorite: true,
  history: [{ fieldId: "password", value: "alt-2025", replacedAt: 1_760_000_000 }],
  toChange: [{ account: "AAAA", at: 1, fields: ["password"] }],
});
const VAULTS = [
  { idText: "buero", name: "Büro", entries: [login("DATEV", "Steuer-Kessel-2026!")] },
  { idText: "technik", name: "Technik", entries: [login("NAS", "Rohr-Ventil-18")] },
];
const NOW = Date.UTC(2026, 10, 22, 9, 30);
const KEY = "Pumpe Kessel Rohr";

describe("mayExport", () => {
  const member = (role: MemberView["role"], status: MemberView["status"] = "certified") =>
    ({ accountId: new Uint8Array(16), name: null, role, status }) as MemberView;

  it("lets certified owners and admins export, nobody else", () => {
    expect(mayExport(member("owner"))).toBe(true);
    expect(mayExport(member("admin"))).toBe(true);
    expect(mayExport(member("member"))).toBe(false);
    expect(mayExport(member("owner", "pending"))).toBe(false);
    expect(mayExport(undefined)).toBe(false);
    expect(MIN_PASSPHRASE).toBe(12);
  });
});

describe("vaultsIn and fileName", () => {
  it("takes every vault or the one named", () => {
    expect(vaultsIn({ kind: "all" }, VAULTS)).toEqual(VAULTS);
    expect(vaultsIn({ kind: "vault", vaultId: "technik" }, VAULTS)).toEqual([VAULTS[1]]);
    expect(vaultsIn({ kind: "vault", vaultId: "weg" }, VAULTS)).toEqual([]);
  });

  it("names the file by format and the device's date", () => {
    const local = new Date(2026, 0, 5, 12).getTime();
    expect(fileName("kennwort-json", local)).toBe("kennwort-export-2026-01-05.json");
    expect(fileName("csv", local)).toBe("kennwort-export-2026-01-05.csv");
    expect(fileName("kdbx", local)).toBe("kennwort-export-2026-01-05.kdbx");
  });
});

describe("buildExport", () => {
  it("writes Kennwort's encrypted JSON that the import opens again, marks dropped", async () => {
    const file = await buildExport("kennwort-json", VAULTS, KEY, NOW);
    expect(file.type).toBe("application/json");
    expect(new TextDecoder().decode(file.bytes)).not.toContain("Steuer-Kessel");
    const format = IMPORT_FORMATS.find((f) => f.id === "kennwort-json");
    const opened = await format?.unlock?.(file.bytes, { password: KEY });
    if (!opened?.ok) throw new Error("not opened");
    const { toChange: _, ...content } = login("DATEV", "Steuer-Kessel-2026!");
    expect(opened.value[0]).toEqual({ content, folders: ["Büro"] });
    expect(opened.value.map((e) => e.folders[0])).toEqual(["Büro", "Technik"]);
  }, 30_000);

  it("writes Bitwarden's CSV in plain text", async () => {
    const file = await buildExport("csv", VAULTS, "", NOW);
    expect(file.type).toBe("text/csv;charset=utf-8");
    const text = new TextDecoder().decode(file.bytes);
    expect(text.split("\r\n")[1]).toBe("Büro,1,login,DATEV,,,0,,jonas,Steuer-Kessel-2026!,");
  });

  it("writes a KDBX 4 database that KeePass's reader opens with the password", async () => {
    const file = await buildExport("kdbx", [VAULTS[0] as (typeof VAULTS)[0]], KEY, NOW);
    expect(file.type).toBe("application/octet-stream");
    expect(file.name.endsWith(".kdbx")).toBe(true);
    const format = IMPORT_FORMATS.find((f) => f.id === "keepass-kdbx");
    const opened = await format?.unlock?.(file.bytes, { password: KEY });
    if (!opened?.ok) throw new Error("not opened");
    expect(opened.value.map((e) => [e.content.title, e.folders])).toEqual([["DATEV", ["Büro"]]]);
  }, 30_000);
});

describe("download", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a link to a Blob, revokes its address at once and zeroes the bytes", () => {
    const events: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      events.push(`create ${(blob as Blob).type} ${(blob as Blob).size}`);
      return "blob:export";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => events.push(`revoke ${url}`));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      events.push(`click ${this.download} ${this.href}`);
    });
    const file: ExportFile = { bytes: Uint8Array.of(1, 2, 3), name: "x.csv", type: "text/csv" };
    download(file);
    expect(events).toEqual(["create text/csv 3", "click x.csv blob:export", "revoke blob:export"]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(file.bytes).toEqual(new Uint8Array(3));
  });
});

describe("runExport", () => {
  const deps = (audit: ExportDeps["audit"]) => {
    const order: string[] = [];
    const saved: ExportFile[] = [];
    const all: ExportDeps = {
      vaults: () => VAULTS,
      audit: async (subject) => {
        order.push(`audit ${subject}`);
        return audit(subject);
      },
      save: (file) => {
        order.push(`save ${file.name}`);
        saved.push(file);
      },
      now: () => NOW,
      newId: () => "BwcHBwcHBwcHBwcHBwcHBw",
    };
    return { deps: all, order, saved };
  };

  it("signs the export into the log first, then saves the file", async () => {
    const { deps: d, order, saved } = deps(async () => true);
    const outcome = await runExport(d, {
      format: "csv",
      scope: { kind: "vault", vaultId: "technik" },
      passphrase: "",
    });
    expect(outcome).toEqual({ ok: true, count: 1, name: fileName("csv", NOW) });
    expect(order).toEqual([
      "audit csv/vault:technik/BwcHBwcHBwcHBwcHBwcHBw",
      `save ${fileName("csv", NOW)}`,
    ]);
    expect(new TextDecoder().decode(saved[0]?.bytes)).toContain("NAS");
    expect(new TextDecoder().decode(saved[0]?.bytes)).not.toContain("DATEV");
  });

  it("names format, scope and ID in the subject, as the server reads it", async () => {
    const { deps: d, order } = deps(async () => true);
    await runExport(d, { format: "csv", scope: { kind: "all" }, passphrase: "" });
    expect(parseExportSubject(order[0]?.slice(6) ?? "")).toEqual({
      format: "csv",
      scope: { kind: "all" },
      id: "BwcHBwcHBwcHBwcHBwcHBw",
    });
  });

  it("writes nothing when the log refuses the export or the scope has no vault", async () => {
    const refused = deps(async () => false);
    expect(
      await runExport(refused.deps, { format: "csv", scope: { kind: "all" }, passphrase: "" }),
    ).toEqual({ ok: false, error: "refused" });
    expect(refused.saved).toEqual([]);
    const empty = deps(async () => true);
    expect(
      await runExport(empty.deps, {
        format: "csv",
        scope: { kind: "vault", vaultId: "weg" },
        passphrase: "",
      }),
    ).toEqual({ ok: false, error: "empty" });
    expect(empty.order).toEqual([]);
  });

  it("answers a file that cannot be written with an error, not a hang", async () => {
    const broken = deps(async () => true);
    broken.deps.vaults = () => [{ idText: "x", name: "x", entries: [{ title: 1 } as never] }];
    expect(
      await runExport(broken.deps, { format: "csv", scope: { kind: "all" }, passphrase: "" }),
    ).toEqual({ ok: false, error: "failed" });
    expect(broken.saved).toEqual([]);
  });

  // Review of K-504: CSV and KDBX carry no passkeys, so the count says what is in the file
  it("counts only what the format carries: passkeys in the encrypted JSON alone", async () => {
    const passkey: EntryContent = {
      type: "passkey",
      title: "Großhandel Shop",
      fields: [{ id: "private-key", name: "private-key", value: "AVBr", kind: "secret" }],
      tags: [],
      favorite: false,
      history: [],
    };
    const run = deps(async () => true);
    run.deps.vaults = () => [{ ...VAULTS[0], entries: [login("DATEV", "x"), passkey] }] as never;
    const scope = { kind: "all" } as const;
    expect(await runExport(run.deps, { format: "csv", scope, passphrase: "" })).toMatchObject({
      ok: true,
      count: 1,
    });
    expect(
      await runExport(run.deps, { format: "kennwort-json", scope, passphrase: KEY }),
    ).toMatchObject({ ok: true, count: 2 });
  }, 30_000);
});
