/** The four sections of the rail and the phone's tab bar (DESIGN.md, Aufbau) */
import { m } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import { KeyRound, Settings, Users, WandSparkles } from "@kennwort/ui/icons";
import type { Route } from "../routes.ts";

export type Section = { page: Route["page"]; href: string; label: () => string; icon: IconNode };

export const sections: readonly Section[] = [
  { page: "entries", href: "/entries", label: () => m.nav_entries(), icon: KeyRound },
  { page: "generator", href: "/generator", label: () => m.nav_generator(), icon: WandSparkles },
  { page: "groups", href: "/groups", label: () => m.nav_groups(), icon: Users },
  { page: "settings", href: "/settings", label: () => m.nav_settings(), icon: Settings },
];

/** Pages under a section: the security overview belongs to the entries, the rest to settings */
const parent: Partial<Record<Route["page"], Route["page"]>> = {
  security: "entries",
  members: "settings",
  vaults: "settings",
  import: "settings",
  export: "settings",
  emergency: "settings",
  links: "settings",
  companies: "settings",
  privacy: "settings",
  renew: "settings",
};

export const isSection = (route: Route, page: string) =>
  route.page === page || parent[route.page] === page;
