/** The sections of the rail and the phone's tab bar (DESIGN.md, Aufbau) */
import { m } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import { KeyRound, Settings, Users, WandSparkles } from "@kennwort/ui/icons";
import type { Route } from "../routes.ts";

export type Section = { page: Route["page"]; href: string; label: () => string; icon: IconNode };

export const sections: readonly Section[] = [
  { page: "entries", href: "/entries", label: () => m.nav_entries(), icon: KeyRound },
  { page: "generator", href: "/generator", label: () => m.nav_generator(), icon: WandSparkles },
  { page: "team", href: "/team", label: () => m.nav_team(), icon: Users },
  { page: "settings", href: "/settings", label: () => m.nav_settings(), icon: Settings },
];

/** Pages under a section: the security overview belongs to the entries, the team's tabs to the team */
const parent: Partial<Record<Route["page"], Route["page"]>> = {
  security: "entries",
  members: "team",
  groups: "team",
  vaults: "team",
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
