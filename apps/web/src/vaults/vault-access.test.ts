import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type LogEntry, type MemberView } from "@kennwort/core";
import { describe, expect, it } from "vitest";
import {
  addCandidates,
  firstNameOf,
  formatWhen,
  groupByRole,
  historyItems,
  initialsOf,
  managerNameOf,
  memberOrigin,
} from "./vault-access.ts";
import type { VaultMember } from "./vault-members.ts";

const id = (n: number) => new Uint8Array(16).fill(n);
const dummyCert = (n: number): Certificate => ({
  accountId: id(n),
  xwingPublicKey: new Uint8Array(1216),
  edPublicKey: new Uint8Array(32),
  companyId: id(99),
  role: "member",
  issuedAt: 1,
  signature: new Uint8Array(65),
});

const person = (
  n: number,
  name: string,
  certified = true,
  leftAt: number | null = null,
): MemberView => ({
  accountId: id(n),
  name,
  role: n === 1 ? "owner" : "member",
  status: certified ? "certified" : "pending",
  ...(certified ? { certificate: dummyCert(n) } : {}),
  leftAt,
  previous: [],
});

const logEntry = (over: Partial<LogEntry>): LogEntry => ({
  vaultId: id(50),
  seq: 0,
  prevHash: new Uint8Array(32),
  epoch: 0,
  action: "create",
  accountId: id(1),
  fingerprint: new Uint8Array(32),
  role: "manage",
  validUntil: 0,
  vkCommitment: new Uint8Array(32),
  time: 1_770_000_000,
  signerId: id(1),
  lastSeen: new Uint8Array(),
  signature: new Uint8Array(65),
  ...over,
});

const makeVault = (entries: LogEntry[], members: [number, "read" | "edit" | "manage"][]): Vault =>
  ({
    idText: "buero",
    name: "Büro",
    role: "manage",
    entries,
    log: {
      members: new Map(
        members.map(([n, role]) => [
          idKey(id(n)),
          { role, validUntil: 0, fingerprint: new Uint8Array(32) },
        ]),
      ),
    },
  }) as unknown as Vault;

describe("vault-access pure helpers", () => {
  const jonas = person(1, "Jonas Weber");
  const anna = person(2, "Anna Krüger");
  const max = person(3, "Max Brandt");
  const tim = person(4, "Tim Kaya");
  const lea = person(5, "Lea Hoffmann", false);
  const former = person(6, "Ole Meyer", true, 1_760_000_000);
  const people = [jonas, anna, max, tim, lea, former];

  it("extracts first names and initials", () => {
    expect(firstNameOf("Jonas Weber")).toBe("Jonas");
    expect(initialsOf("Jonas Weber")).toBe("JW");
    expect(initialsOf("Anna")).toBe("A");
    expect(initialsOf("   ")).toBe("?");
  });

  it("groups members in manage -> edit -> read order, omitting empty groups, with me first", () => {
    const members: VaultMember[] = [
      { accountId: id(3), name: "Max Brandt", role: "read", validUntil: 0, me: false },
      { accountId: id(2), name: "Anna Krüger", role: "manage", validUntil: 0, me: false },
      { accountId: id(1), name: "Jonas Weber", role: "manage", validUntil: 0, me: true },
    ];
    const grouped = groupByRole(members);
    expect(grouped.map((g) => g.role)).toEqual(["manage", "read"]);
    expect(grouped[0]?.members.map((m) => m.name)).toEqual(["Jonas Weber", "Anna Krüger"]);
    expect(grouped[1]?.members.map((m) => m.name)).toEqual(["Max Brandt"]);
  });

  it("reads member origin (created vs added by signer) from the verified log", () => {
    const entries = [
      logEntry({ seq: 0, action: "create", accountId: id(1), signerId: id(1), time: 100 }),
      logEntry({
        seq: 1,
        action: "add",
        accountId: id(3),
        signerId: id(1),
        role: "read",
        time: 200,
      }),
    ];
    expect(memberOrigin(entries, id(1), people)).toEqual({ kind: "created", time: 100 });
    expect(memberOrigin(entries, id(3), people)).toEqual({ kind: "added", time: 200, by: "Jonas" });
    expect(memberOrigin(entries, id(4), people)).toBeUndefined();
  });

  it("turns all six log actions into newest-first history sentences", () => {
    const entries = [
      logEntry({
        seq: 0,
        action: "create",
        accountId: id(1),
        signerId: id(1),
        time: 1_770_000_000,
      }),
      logEntry({
        seq: 1,
        action: "add",
        accountId: id(3),
        signerId: id(1),
        role: "read",
        time: 1_770_000_100,
      }),
      logEntry({
        seq: 2,
        action: "role",
        accountId: id(3),
        signerId: id(1),
        role: "edit",
        time: 1_770_000_200,
      }),
      logEntry({
        seq: 3,
        action: "remove",
        accountId: id(6),
        signerId: id(1),
        role: "",
        time: 1_770_000_300,
      }),
      logEntry({
        seq: 4,
        action: "rotate",
        accountId: id(1),
        signerId: id(1),
        role: "",
        time: 1_770_000_400,
      }),
      logEntry({
        seq: 5,
        action: "rekey",
        accountId: id(3),
        signerId: id(1),
        role: "",
        time: 1_770_000_500,
      }),
    ];
    const vault = makeVault(entries, [
      [1, "manage"],
      [3, "edit"],
    ]);
    const items = historyItems(vault, people, 1_780_000_000_000);
    expect(items.map((i) => i.kind)).toEqual([
      "rekey",
      "rotate",
      "remove",
      "role",
      "add",
      "create",
    ]);
    expect(items[0]?.text).toContain("Max");
    expect(items[2]?.text).toContain("Ole");
    expect(items[3]?.text).toContain("Max");
    expect(items[4]?.text).toContain("Max");
    expect(items[4]?.role).toBeTruthy();
    expect(items[5]?.text).toContain("Büro");
  });

  it("formats same-day timestamps as today with time", () => {
    const now = new Date(2026, 4, 20, 14, 0, 0).getTime();
    const earlier = Math.floor(new Date(2026, 4, 20, 8, 12, 0).getTime() / 1000);
    expect(formatWhen(earlier, now)).toMatch(/08:12/);
  });

  it("lists candidates outside the vault including unconfirmed people (after confirmed), excluding former and picked", () => {
    const vault = makeVault(
      [],
      [
        [1, "manage"],
        [3, "read"],
      ],
    );
    const all = addCandidates(vault, people, "", new Set());
    expect(all.map((c) => [c.name, c.unconfirmed])).toEqual([
      ["Anna Krüger", false],
      ["Tim Kaya", false],
      ["Lea Hoffmann", true],
    ]);
    const filtered = addCandidates(vault, people, "lea", new Set());
    expect(filtered.map((c) => c.name)).toEqual(["Lea Hoffmann"]);
    const withoutTim = addCandidates(vault, people, "", new Set([idKey(id(4))]));
    expect(withoutTim.map((c) => c.name)).toEqual(["Anna Krüger", "Lea Hoffmann"]);
  });

  it("finds a manager's first name for read-only vaults", () => {
    const vault = makeVault(
      [],
      [
        [2, "manage"],
        [1, "read"],
      ],
    );
    expect(managerNameOf(vault, people)).toBe("Anna");
  });
});
