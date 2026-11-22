/**
 * Whether the inline menu may take a click (K-403), seen from inside its own frame: the browser
 * reports it as visible with IntersectionObserver v2 (`trackVisibility`), which is false while
 * anything of the page covers it (also content with `pointer-events: none` that lets the click
 * through) and while it is not fully inside the viewport. Chromium does not carry opacity the page
 * sets on the menu's element or its ancestors into this frame's report (seen in the end-to-end
 * test); the content script checks that itself before a fill (content/menu-frame.ts). It must have
 * been visible without a break for ARM_AFTER_MS,
 * so a page cannot slide the menu under the pointer just before a click (DOM-based extension
 * clickjacking, Marek Tóth, DEF CON 33, 2025; the defence Chrome documents for embedded frames).
 * Where the browser lacks v2 (Firefox, Safari), the menu never arms and fills nothing: it says so instead.
 */

export const ARM_AFTER_MS = 500;
/**
 * After a click the menu waits this long and asks the guard again: v2 reports at most every
 * 100 ms, so a cover laid over the menu just before the click is reported within this time
 */
export const CONFIRM_MS = 300;

/** A report of IntersectionObserver v2; `isVisible` is missing where the browser lacks v2 */
type Report = { isVisible?: boolean; intersectionRatio: number; time: number };

/** Fully inside the viewport (with a little room for rounding) and reported as visible */
export const reportShowsMenu = (report: Report) =>
  report.isVisible === true && report.intersectionRatio >= 0.99;

/** Since when the menu has been visible without a break; armed once that is long enough */
export const createVisibilityGuard = () => {
  let since: number | undefined;
  return {
    seen: (visible: boolean, at: number) => {
      since = visible ? (since ?? at) : undefined;
    },
    armed: (at: number) => since !== undefined && at - since >= ARM_AFTER_MS,
  };
};

export type VisibilityGuard = ReturnType<typeof createVisibilityGuard>;

type ObserverConstructor = new (
  callback: (reports: Report[]) => void,
  options: { threshold: number[]; trackVisibility: boolean; delay: number },
) => { observe(target: Element): void; disconnect(): void };

/** Whether this browser reports visibility (IntersectionObserver v2) */
export const tracksVisibility = (scope: typeof globalThis = globalThis) =>
  "IntersectionObserverEntry" in scope && "isVisible" in scope.IntersectionObserverEntry.prototype;

/**
 * Feeds the guard from the browser's reports on the target and calls back on each change; returns
 * the function that stops watching. Without v2 nothing is reported and the guard never arms.
 */
export const watchVisibility = (
  target: Element,
  guard: VisibilityGuard,
  onChange: (visible: boolean) => void,
  Observer: ObserverConstructor | undefined = globalThis.IntersectionObserver as
    | ObserverConstructor
    | undefined,
) => {
  if (!Observer) return () => {};
  const observer = new Observer(
    (reports) => {
      for (const report of reports) {
        const visible = reportShowsMenu(report);
        guard.seen(visible, report.time);
        onChange(visible);
      }
    },
    // 100 ms is the shortest delay v2 allows with trackVisibility
    { threshold: [1], trackVisibility: true, delay: 100 },
  );
  observer.observe(target);
  return () => observer.disconnect();
};
