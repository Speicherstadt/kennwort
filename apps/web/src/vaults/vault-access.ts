/**
 * Pure helpers for Team → Vaults (K-608): grouping members by role, reading each person's origin
 * ("since … · by …" / "created the vault") and the human-readable history from the verified
 * membership log (`vault.entries`), and listing add candidates including unconfirmed people.
 */

import type { Vault } from "@kennwort/client/vaults/vaults.ts";
import {
  type Certificate,
  idKey,
  type LogEntry,
  type MemberView,
  type VaultRole,
} from "@kennwort/core";
import { getLocale, m } from "@kennwort/ui";
import { dateText } from "./day.ts";
import { hasExpired, type VaultMember } from "./vault-members.ts";
import { roleText } from "./vault-text.ts";

export const ROLE_ORDER: readonly VaultRole[] = ["manage", "edit", "read"];

export const displayName = (name: string | null | undefined) => name || m.vault_members_unnamed();

export const firstNameOf = (name: string | null | undefined) =>
  displayName(name).trim().split(/\s+/)[0] ?? m.vault_members_unnamed();

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const personName = (people: readonly MemberView[], accountId: Uint8Array) =>
  people.find((p) => idKey(p.accountId) === idKey(accountId))?.name ?? null;

export type RoleSection = { role: VaultRole; members: VaultMember[] };

/** Members grouped by role (manage → edit → read), empty sections omitted, current user first */
export const groupByRole = (members: readonly VaultMember[]): RoleSection[] =>
  ROLE_ORDER.map((role) => ({
    role,
    members: members
      .filter((member) => member.role === role)
      .sort((a, b) =>
        a.me ? -1 : b.me ? 1 : displayName(a.name).localeCompare(displayName(b.name)),
      ),
  })).filter((section) => section.members.length > 0);

export type MemberOrigin =
  | { kind: "created"; time: number }
  | { kind: "added"; time: number; by: string };

/** When and by whom this person last entered the vault, read from the verified log */
export const memberOrigin = (
  entries: readonly LogEntry[],
  accountId: Uint8Array,
  people: readonly MemberView[],
): MemberOrigin | undefined => {
  const key = idKey(accountId);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry || idKey(entry.accountId) !== key) continue;
    if (entry.action === "create") return { kind: "created", time: entry.time };
    if (entry.action === "add") {
      return {
        kind: "added",
        time: entry.time,
        by: firstNameOf(personName(people, entry.signerId)),
      };
    }
  }
  return undefined;
};

/** Short date for a log entry or request: "heute, HH:MM" on the same local day, else date */
export const formatWhen = (seconds: number, nowMs = Date.now()) => {
  const date = new Date(seconds * 1000);
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    const time = date.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
    return m.vault_access_today_at({ time });
  }
  return dateText(seconds);
};

export type HistoryKind = "add" | "remove" | "rotate" | "role" | "create" | "rekey";

export type HistoryItem = {
  seq: number;
  kind: HistoryKind;
  text: string;
  role?: string;
  when: string;
};

const historyLine = (
  entry: LogEntry,
  vaultName: string,
  people: readonly MemberView[],
): { text: string; role?: string } => {
  const signer = firstNameOf(personName(people, entry.signerId));
  const person = firstNameOf(personName(people, entry.accountId));
  const roleLabel = entry.role ? roleText(entry.role) : "";
  switch (entry.action) {
    case "create":
      return { text: m.vault_access_log_create({ signer, vault: vaultName }) };
    case "add":
      return {
        text:
          entry.validUntil > 0
            ? m.vault_access_log_add_until({ signer, person, date: dateText(entry.validUntil) })
            : m.vault_access_log_add({ signer, person }),
        ...(roleLabel ? { role: roleLabel } : {}),
      };
    case "role":
      return {
        text:
          entry.validUntil > 0
            ? m.vault_access_log_role_until({
                signer,
                person,
                role: roleLabel,
                date: dateText(entry.validUntil),
              })
            : m.vault_access_log_role({ signer, person, role: roleLabel }),
      };
    case "remove":
      return { text: m.vault_access_log_remove({ signer, person }) };
    case "rotate":
      return { text: m.vault_access_log_rotate() };
    case "rekey":
      return { text: m.vault_access_log_rekey({ person }) };
  }
};

/** Verified membership log entries as newest-first human-readable history sentences */
export const historyItems = (
  vault: Vault,
  people: readonly MemberView[],
  nowMs = Date.now(),
): HistoryItem[] => {
  const vaultName = vault.name ?? m.vaults_unnamed();
  return [...vault.entries].reverse().map((entry) => ({
    seq: entry.seq,
    kind: entry.action,
    ...historyLine(entry, vaultName, people),
    when: formatWhen(entry.time, nowMs),
  }));
};

export type AddCandidate = {
  key: string;
  accountId: Uint8Array;
  name: string;
  certificate: Certificate | undefined;
  unconfirmed: boolean;
};

/**
 * Active company members not yet in the vault (and not already picked), filtered by search query.
 * Unconfirmed people remain visible and disabled so managers see why they cannot be added yet.
 */
export const addCandidates = (
  vault: Vault,
  people: readonly MemberView[],
  query: string,
  pickedKeys: ReadonlySet<string>,
): AddCandidate[] => {
  const q = query.trim().toLowerCase();
  return people
    .filter((person) => {
      if (person.leftAt !== null) return false;
      const key = idKey(person.accountId);
      if (vault.log.members.has(key) || pickedKeys.has(key)) return false;
      if (!q) return true;
      return displayName(person.name).toLowerCase().includes(q);
    })
    .map((person) => ({
      key: idKey(person.accountId),
      accountId: person.accountId,
      name: displayName(person.name),
      certificate: person.status === "certified" ? person.certificate : undefined,
      unconfirmed: person.status !== "certified" || person.certificate === undefined,
    }))
    .sort((a, b) => Number(a.unconfirmed) - Number(b.unconfirmed) || a.name.localeCompare(b.name));
};

/** First name of an active manager of the vault, for read-only hints ("managed by Sandra") */
export const managerNameOf = (vault: Vault, people: readonly MemberView[]): string | undefined => {
  for (const [key, member] of vault.log.members.entries()) {
    if (member.role !== "manage" || hasExpired(member)) continue;
    const person = people.find((p) => idKey(p.accountId) === key);
    if (person?.name) return firstNameOf(person.name);
  }
  return undefined;
};

/** Format Unix seconds as yyyy-mm-dd for an <input type="date"> */
export const inputDateOf = (seconds: number) => {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
