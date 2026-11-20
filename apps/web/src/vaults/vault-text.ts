/** The words for a role in a vault (K-305) */
import type { VaultRole } from "@kennwort/core";
import { m } from "@kennwort/ui";

export const roleText = (role: VaultRole): string =>
  ({ read: m.vault_role_read(), edit: m.vault_role_edit(), manage: m.vault_role_manage(), "": "" })[
    role
  ];
