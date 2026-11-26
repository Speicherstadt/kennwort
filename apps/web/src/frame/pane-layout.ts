/**
 * The columns of the entry pane, shared by the entry and its editor so that opening the editor
 * keeps the content where it was instead of jumping to the centre (DESIGN.md, Eintrag bearbeiten)
 */
export const paneGridClass =
  "mx-auto grid w-full max-w-[60rem] gap-6 p-4 md:p-6 @3xl:grid-cols-[minmax(0,42rem)_16rem] @3xl:justify-center";

/** The main column inside the pane's grid */
export const paneMainClass = "grid w-full max-w-2xl content-start gap-5";

/** A section heading like the entry's cards: small, uppercase, muted */
export const sectionTitleClass =
  "text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase";
