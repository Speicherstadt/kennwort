/**
 * Handing a vault over to a customer (K-605, Übergabe; docs/sicherheitsdesign.md P-27). The
 * installer's device decrypts the vault in the own company, keeps the contents in memory, puts the
 * customer's company on screen (where the installer has an account of the same person, P-27) and
 * there makes a new vault through the normal paths: genesis signed by the installer (P-05), every
 * entry encrypted, signed and bound anew under the new vault's keys (P-09), the customer added as
 * manager after the pinned root of that company confirmed them, and the installer's own role
 * reduced from managing to editing, signed while still a manager (P-06). Not to reading: a record
 * counts only while its author may edit by the log as it now stands (P-09), so the entries the
 * installer just wrote would no longer open. From then on the customer decides: removing the
 * installer rotates the key and writes every entry anew under the customer's signature (P-11), and
 * nothing the installer signs can make him a manager again. The server only stores what any new
 * vault brings: ciphertexts, a log, keys.
 */
import type { StoredEntry } from "@kennwort/client/entries/entries.ts";
import type { ImportWrite } from "@kennwort/client/entries/entry-import.ts";
import type { CreateError, Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import type { Certificate, MemberView } from "@kennwort/core";
import { idKey } from "@kennwort/core";
import { runImport, type SaveBatch } from "../import/run.ts";
import type { ChangeError } from "../vaults/vault-members.ts";

/**
 * The entries of a vault as new entries for another company: the content as it is, without the
 * marks „Zum Ändern“, which name accounts of the own company (P-11)
 */
export const handoverWrites = (entries: readonly StoredEntry[], vaultIdText: string) =>
  entries
    .filter((entry) => entry.vaultIdText === vaultIdText)
    .map((entry): ImportWrite => {
      const { toChange: _marks, ...content } = entry.content;
      return { kind: "new", content };
    });

/** Who may take a vault over: certified people of the company other than the installer */
export const customers = (people: readonly MemberView[], me: Uint8Array) =>
  people.filter(
    (person): person is MemberView & { certificate: Certificate } =>
      person.status === "certified" &&
      person.certificate !== undefined &&
      person.leftAt == null &&
      idKey(person.accountId) !== idKey(me),
  );

type Changed = { ok: true } | { ok: false; error: ChangeError };

export type HandoverDeps = {
  create: (
    name: string,
  ) => Promise<{ ok: true; value: string } | { ok: false; error: CreateError }>;
  reload: () => Promise<Loaded | undefined>;
  save: (vaultIdText: string) => SaveBatch;
  add: (vault: Vault, customer: Certificate) => Promise<Changed>;
  /** The installer's own role down to editing */
  reduce: (vault: Vault, accountId: Uint8Array) => Promise<Changed>;
};

export type HandoverStep = "create" | "entries" | "customer" | "role";
export type HandoverOutcome =
  | { ok: true; value: { vaultIdText: string; written: number } }
  | { ok: false; step: HandoverStep; vaultIdText?: string };

const vaultIn = (loaded: Loaded | undefined, idText: string) =>
  loaded?.vaults.find((vault) => vault.idText === idText);

export const runHandover = async (
  deps: HandoverDeps,
  handover: { vaultName: string; writes: readonly ImportWrite[] },
  customer: Certificate,
  me: Uint8Array,
): Promise<HandoverOutcome> => {
  const made = await deps.create(handover.vaultName);
  if (!made.ok) return { ok: false, step: "create" };
  const vaultIdText = made.value;
  const created = vaultIn(await deps.reload(), vaultIdText);
  if (!created) return { ok: false, step: "create", vaultIdText };
  const written = await runImport(deps.save(vaultIdText), handover.writes, () => {});
  if (written.error) return { ok: false, step: "entries", vaultIdText };
  const added = await deps.add(created, customer);
  if (!added.ok) return { ok: false, step: "customer", vaultIdText };
  // The customer is a manager now; the installer's reduced role is signed on the log as it stands
  const withCustomer = vaultIn(await deps.reload(), vaultIdText);
  const reduced = withCustomer && (await deps.reduce(withCustomer, me));
  if (!reduced?.ok) return { ok: false, step: "role", vaultIdText };
  await deps.reload();
  return { ok: true, value: { vaultIdText, written: written.imported } };
};
