/**
 * Actions for Team → Vaults (K-608): adding people, changing roles with undo toast, setting or
 * clearing an expiry date, removing with key rotation, and granting/declining access requests.
 */
import type { Loaded, Vault } from "@kennwort/client/vaults/vaults.ts";
import { type Certificate, idKey, type VaultRole } from "@kennwort/core";
import { m } from "@kennwort/ui";
import { dateText } from "./day.ts";
import type { DialogApi, Outcome } from "./dialog-state.ts";
import type { ExitError, Exits } from "./exit.ts";
import { type AddCandidate, firstNameOf } from "./vault-access.ts";
import {
  addToVault,
  changeVaultUntil,
  declineRequest,
  grantRequest,
  type Request,
  type VaultMember,
} from "./vault-members.ts";
import { roleText } from "./vault-text.ts";

export type VaultActionsDeps = {
  api: DialogApi;
  session: import("../session/session.ts").Session;
  exits: Pick<Exits, "remove" | "changeRole">;
  ready: () => Loaded | undefined;
  run: (change: () => Promise<Outcome>) => Promise<ExitError | undefined>;
  flashKeys: (keys: string[], markAdded?: boolean) => void;
  showToast: (text: string, undo?: () => void) => void;
  closeDialogs: () => void;
};

export const createVaultActions = (deps: VaultActionsDeps) => ({
  add: async (
    vault: Vault,
    chosen: (AddCandidate & { certificate: Certificate })[],
    role: VaultRole,
    validUntil: number,
  ): Promise<string[]> => {
    const addedKeys: string[] = [];
    for (const person of chosen) {
      const current = deps.ready()?.vaults.find((v) => v.idText === vault.idText) ?? vault;
      const failed = await deps.run(() =>
        addToVault(deps.api, deps.session, current, person.certificate, role, validUntil),
      );
      if (failed) {
        if (addedKeys.length > 0) deps.flashKeys(addedKeys, true);
        return addedKeys;
      }
      addedKeys.push(person.key);
    }
    deps.flashKeys(addedKeys, true);
    deps.showToast(
      chosen.length > 1
        ? m.vault_access_toast_added_many({ count: String(chosen.length) })
        : m.vault_access_toast_added_one({
            name: firstNameOf(chosen[0]?.name),
            role: roleText(role),
          }),
    );
    return addedKeys;
  },
  role: async (vault: Vault, member: VaultMember, nextRole: VaultRole) => {
    const prevRole = member.role;
    const failed = await deps.run(() => deps.exits.changeRole(vault, member.accountId, nextRole));
    if (failed) return;
    deps.flashKeys([idKey(member.accountId)]);
    deps.showToast(
      m.vault_access_toast_role({
        name: firstNameOf(member.name),
        from: roleText(prevRole),
        to: roleText(nextRole),
      }),
      () => {
        const latest = deps.ready()?.vaults.find((v) => v.idText === vault.idText);
        if (latest) void deps.run(() => deps.exits.changeRole(latest, member.accountId, prevRole));
      },
    );
  },
  until: async (vault: Vault, member: VaultMember, validUntil: number) => {
    const failed = await deps.run(() =>
      changeVaultUntil(deps.api, deps.session, vault, member.accountId, validUntil),
    );
    deps.closeDialogs();
    if (failed) return;
    deps.flashKeys([idKey(member.accountId)]);
    deps.showToast(
      validUntil > 0
        ? m.vault_access_toast_until_set({
            name: firstNameOf(member.name),
            date: dateText(validUntil),
          })
        : m.vault_access_toast_until_cleared({ name: firstNameOf(member.name) }),
    );
  },
  remove: async (vault: Vault, member: VaultMember) => {
    const loaded = deps.ready();
    if (!loaded) return;
    const failed = await deps.run(() =>
      deps.exits.remove(vault, loaded.trust, member.accountId, loaded.left),
    );
    deps.closeDialogs();
    if (failed) return;
    deps.showToast(m.vault_access_toast_removed({ name: firstNameOf(member.name) }));
  },
  grant: async (vault: Vault, request: Request) => {
    const cert = request.certificate;
    if (!cert) return;
    const failed = await deps.run(() =>
      grantRequest(deps.api, deps.session, vault, { ...request, certificate: cert }, "read"),
    );
    if (failed) return;
    deps.flashKeys([idKey(request.accountId)], true);
    deps.showToast(m.vault_access_toast_granted({ name: firstNameOf(request.name) }));
  },
  decline: async (vault: Vault, request: Request) => {
    const failed = await deps.run(() =>
      declineRequest(deps.api, deps.session, vault, request.accountId),
    );
    if (failed) return;
    deps.showToast(m.vault_access_toast_declined({ name: firstNameOf(request.name) }));
  },
});

export type VaultActions = ReturnType<typeof createVaultActions>;
