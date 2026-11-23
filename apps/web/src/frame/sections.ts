/** The sections of the rail and the phone's tab bar (DESIGN.md, Aufbau) */
import { m } from "@kennwort/ui";
import type { IconNode } from "@kennwort/ui/icons";
import { KeyRound, Link2, Settings, Users, WandSparkles } from "@kennwort/ui/icons";
import type { Route } from "../routes.ts";

export type Section = {
  page: Route["page"];
  href: string;
  label: () => string;
  /** A shorter name for the phone's tab bar, where a long one does not fit */
  short?: () => string;
  icon: IconNode;
};

export const sections: readonly Section[] = [
  { page: "entries", href: "/entries", label: () => m.nav_entries(), icon: KeyRound },
  { page: "generator", href: "/generator", label: () => m.nav_generator(), icon: WandSparkles },
  // A feature of its own, not a setting: beside the generator, the other tool for one secret
  {
    page: "links",
    href: "/links",
    label: () => m.nav_links(),
    short: () => m.nav_links_short(),
    icon: Link2,
  },
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
  companies: "settings",
  privacy: "settings",
  renew: "settings",
};

export const isSection = (route: Route, page: string) =>
  route.page === page || parent[route.page] === page;
