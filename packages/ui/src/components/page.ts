/**
 * The layout of a page beside the list (DESIGN.md, Aufbau): it scrolls on its own, every direct
 * child sits in one centered column, so no page leaves half the screen empty on one side.
 * `reading` for settings-like pages, `wide` for pages with two columns (members, security).
 */
const pageBase = "min-h-0 flex-1 overflow-auto px-4 pt-4 pb-8 md:px-8 md:pt-8 *:mx-auto *:w-full";

export const pageClass = (width: "reading" | "wide" = "reading") =>
  `${pageBase} ${width === "wide" ? "*:max-w-6xl" : "*:max-w-3xl"}`;

/** A panel of a page: a bordered card with a title, as in the settings of the app */
export const panelClass = "grid content-start gap-3 rounded-xl border border-border p-4 md:p-5";

/** The title of a panel */
export const panelTitleClass = "text-sm font-semibold";

/** The intro under a page's title */
export const introClass = "mb-6 text-[13px] text-muted-foreground";
