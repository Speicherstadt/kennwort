/**
 * What a notification says and where it leads (K-602, P-24). The server names only IDs; the names
 * of people and vaults come from what this device loaded and checked itself. An ID it does not know
 * stays nameless ("Jemand", "einen Tresor"): the server's word never becomes a name on screen.
 */
import type { Notification, NotificationKind } from "@kennwort/core";
import { m } from "@kennwort/ui";

export type Names = {
  person: (accountId: string) => string | undefined;
  vault: (vaultId: string) => string | undefined;
};

type Shown = { text: string; href: string };

const texts: Record<NotificationKind, (name: string, vault: string) => string> = {
  "access-requested": (name, vault) => m.notifications_access_requested({ name, vault }),
  "vault-added": (name, vault) => m.notifications_vault_added({ name, vault }),
  "share-received": (name) => m.notifications_share_received({ name }),
  "invitation-accepted": (name) => m.notifications_invitation_accepted({ name }),
  "member-renewed": (name) => m.notifications_member_renewed({ name }),
  "root-changed": (name) => m.notifications_root_changed({ name }),
  "emergency-requested": (name) => m.notifications_emergency_requested({ name }),
  "emergency-answered": (name) => m.notifications_emergency_answered({ name }),
  "emergency-granted": (name) => m.notifications_emergency_granted({ name }),
  "account-recovered": (name) => m.notifications_account_recovered({ name }),
  "link-opened": () => m.notifications_link_opened(),
  "security-report": () => m.notifications_security_report(),
};

/** The page where the person checks and acts; a vault's own page where it has one */
const hrefOf = (note: Notification): string => {
  switch (note.kind) {
    case "access-requested":
      return "/vaults";
    case "vault-added":
      return note.subject ? `/vaults/${encodeURIComponent(note.subject)}` : "/vaults";
    case "share-received":
      return "/shared";
    case "invitation-accepted":
    case "member-renewed":
    case "root-changed":
      return "/members";
    case "emergency-requested":
    case "emergency-answered":
    case "emergency-granted":
      return "/emergency";
    case "account-recovered":
      return "/settings";
    case "link-opened":
      return "/links";
    case "security-report":
      return "/security";
  }
};

export const notificationText = (note: Notification, names: Names): Shown => {
  const name = (note.actor && names.person(note.actor)) || m.notifications_someone();
  const vault = (note.subject && names.vault(note.subject)) || m.notifications_a_vault();
  return { text: texts[note.kind](name, vault), href: hrefOf(note) };
};

/** The label of each kind in the push settings, in the order of NOTIFICATION_KINDS */
export const kindLabels: Record<NotificationKind, () => string> = {
  "access-requested": () => m.push_kind_access_requested(),
  "vault-added": () => m.push_kind_vault_added(),
  "share-received": () => m.push_kind_share_received(),
  "invitation-accepted": () => m.push_kind_invitation_accepted(),
  "member-renewed": () => m.push_kind_member_renewed(),
  "root-changed": () => m.push_kind_root_changed(),
  "emergency-requested": () => m.push_kind_emergency_requested(),
  "emergency-answered": () => m.push_kind_emergency_answered(),
  "emergency-granted": () => m.push_kind_emergency_granted(),
  "account-recovered": () => m.push_kind_account_recovered(),
  "link-opened": () => m.push_kind_link_opened(),
  "security-report": () => m.push_kind_security_report(),
};
