/**
 * How the push settings group the kinds (DESIGN.md, Mitteilungen): one card per topic, each kind
 * with a short description. The records are total, so a new kind fails typecheck until it is placed.
 */
import type { NotificationKind } from "@kennwort/core";
import { m } from "@kennwort/ui";

export type PushGroup = "access" | "security" | "emergency" | "account" | "other";

export const groupOf: Record<NotificationKind, PushGroup> = {
  "access-requested": "access",
  "vault-added": "access",
  "share-received": "access",
  "invitation-accepted": "access",
  "member-enrolled": "access",
  "group-left": "access",
  "member-renewed": "security",
  "root-changed": "security",
  "security-report": "security",
  "link-opened": "security",
  "emergency-requested": "emergency",
  "emergency-answered": "emergency",
  "emergency-granted": "emergency",
  "account-recovered": "account",
  "update-available": "other",
};

export const groupTitles: Record<PushGroup, () => string> = {
  access: () => m.push_group_access(),
  security: () => m.push_group_security(),
  emergency: () => m.push_group_emergency(),
  account: () => m.push_group_account(),
  other: () => m.push_group_other(),
};

export const PUSH_GROUPS = Object.keys(groupTitles) as PushGroup[];

export const kindDescriptions: Record<NotificationKind, () => string> = {
  "access-requested": () => m.push_desc_access_requested(),
  "vault-added": () => m.push_desc_vault_added(),
  "share-received": () => m.push_desc_share_received(),
  "invitation-accepted": () => m.push_desc_invitation_accepted(),
  "member-enrolled": () => m.push_desc_member_enrolled(),
  "group-left": () => m.push_desc_group_left(),
  "member-renewed": () => m.push_desc_member_renewed(),
  "root-changed": () => m.push_desc_root_changed(),
  "security-report": () => m.push_desc_security_report(),
  "link-opened": () => m.push_desc_link_opened(),
  "emergency-requested": () => m.push_desc_emergency_requested(),
  "emergency-answered": () => m.push_desc_emergency_answered(),
  "emergency-granted": () => m.push_desc_emergency_granted(),
  "account-recovered": () => m.push_desc_account_recovered(),
  "update-available": () => m.push_desc_update_available(),
};

/** The kinds of one group, in the order of the given list */
export const kindsIn = (kinds: readonly NotificationKind[], group: PushGroup) =>
  kinds.filter((kind) => groupOf[kind] === group);
