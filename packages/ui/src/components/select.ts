/**
 * The look of a native <select> (K-305, DESIGN.md): like the text fields, as tall as a button, 44
 * px on the phone, with a CSS-drawn chevron (`select-chevron` in styles.css) instead of the
 * browser's arrow; the list itself stays the browser's, so it works everywhere.
 */
export const selectClass =
  "select-chevron h-11 min-w-0 cursor-pointer appearance-none rounded-lg border border-border bg-background py-0 pr-8 pl-2.5 text-[13px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/25 disabled:cursor-not-allowed disabled:opacity-50 md:h-8";
