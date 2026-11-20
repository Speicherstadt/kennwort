/**
 * The inline menu's place in the page (K-403, DESIGN.md Inline-Menü): an element of its own with a
 * closed shadow root, holding an iframe of the extension's menu page. The page cannot reach into
 * the closed root, and the iframe's document has the extension's origin, so the page reads neither
 * the entries nor where the menu points. The element sits in the top layer (a manual popover),
 * under the field.
 *
 * What the page can still do is style or cover the element (DOM-based extension clickjacking,
 * Marek Tóth, DEF CON 33, 2025): make it transparent, or lay its own content over it so the user
 * clicks the menu without seeing it. The menu page itself refuses clicks while the browser does
 * not report it as visible (IntersectionObserver v2, menu/visibility.ts), which catches covers but
 * not opacity the page sets; before a fill, the content script checks from the page's side
 * (menuIsClear): the element is open in the top layer, inside the viewport, neither it nor an
 * ancestor is transparent, filtered, clipped or masked, no element of the page entered the top
 * layer after it (only those can lie above it, and one with `pointer-events: none` escapes a hit
 * test), and the page's own hit test finds the element at its centre and near each corner.
 */

export const MENU_WIDTH = 320;
const START_HEIGHT = 64;
const MAX_HEIGHT = 360;
const GAP = 4;
const MARGIN = 8;

type Box = Pick<DOMRect, "left" | "top" | "right" | "bottom">;
type Size = { width: number; height: number };

/** Under the field, or above it where there is no room below; always inside the viewport */
export const menuPlacement = (field: Box, viewport: Size, height: number) => {
  const left = Math.max(MARGIN, Math.min(field.left, viewport.width - MENU_WIDTH - MARGIN));
  const below = field.bottom + GAP;
  const top =
    below + height <= viewport.height - MARGIN ? below : Math.max(MARGIN, field.top - GAP - height);
  return { left, top };
};

/** The computed styles that make an element see-through or cut it while it still takes clicks */
type HidingStyle = Pick<
  CSSStyleDeclaration,
  "opacity" | "filter" | "clipPath" | "mixBlendMode" | "visibility" | "display"
> & { maskImage?: string; webkitMaskImage?: string };

const isNone = (value: string | undefined) =>
  value === undefined || value === "" || value === "none";

/** Whether this style hides or fades an element; any opacity below 1 counts */
export const hides = (style: HidingStyle) =>
  Number(style.opacity) < 1 ||
  !isNone(style.filter) ||
  !isNone(style.clipPath) ||
  !isNone(style.maskImage) ||
  !isNone(style.webkitMaskImage) ||
  (style.mixBlendMode !== "" && style.mixBlendMode !== "normal") ||
  style.visibility === "hidden" ||
  style.visibility === "collapse" ||
  style.display === "none";

/** Points inside the corners (clear of the 12 px rounding, which clips hits) and the centre */
const probes = (box: DOMRect) => {
  const inset = 8;
  const [x0, x1] = [box.left + inset, box.right - inset];
  const [y0, y1] = [box.top + inset, box.bottom - inset];
  return [
    [(x0 + x1) / 2, (y0 + y1) / 2],
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const;
};

const isOpenPopover = (element: Element) => {
  try {
    return element.matches(":popover-open");
  } catch {
    return false;
  }
};

/** The elements of the document in the top layer; a selector the browser lacks finds none */
export const topLayer = (doc: Document) =>
  [":popover-open", ":modal", ":fullscreen"].flatMap((selector) => {
    try {
      return Array.from(doc.querySelectorAll(selector));
    } catch {
      return [];
    }
  });

/**
 * Whether the page shows the menu element as it is, uncovered and opaque (checked before a fill);
 * `before` is what was in the top layer when the menu opened, below it
 */
export const menuIsClear = (host: HTMLElement, before: ReadonlySet<Element> = new Set()) => {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  if (!view || !host.isConnected || !isOpenPopover(host)) return false;
  if (topLayer(doc).some((element) => element !== host && !before.has(element))) return false;
  for (let element: Element | null = host; element; element = element.parentElement) {
    if (hides(view.getComputedStyle(element) as HidingStyle)) return false;
  }
  const box = host.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  if (box.left < 0 || box.top < 0) return false;
  if (box.right > view.innerWidth || box.bottom > view.innerHeight) return false;
  return probes(box).every(([x, y]) => doc.elementFromPoint(x, y) === host);
};

// Inline and important, so no style sheet of the page wins over them; the UA's popover styles
// (border, padding, inset, margin) are reset here as well
const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "inset: auto",
  "margin: 0",
  "padding: 0",
  "border: 0",
  `width: ${MENU_WIDTH}px`,
  `height: ${START_HEIGHT}px`,
  "overflow: hidden",
  "border-radius: 12px",
  "background: transparent",
  "box-shadow: 0 8px 24px rgb(0 0 0 / 0.18)",
  "opacity: 1",
  "display: block",
  "visibility: visible",
  "z-index: 2147483647",
]
  .map((rule) => `${rule} !important`)
  .join("; ");

const FRAME_STYLE = "all: initial; display: block; width: 100%; height: 100%; border: 0;";

type Opened = {
  host: HTMLElement;
  iframe: HTMLIFrameElement;
  field: HTMLElement;
  height: number;
  /** What was in the top layer before the menu: it lies below the menu */
  below: ReadonlySet<Element>;
};

/** Opens, moves and closes the one menu of a document */
export const createMenuFrame = (doc: Document, menuUrl: string, title: string) => {
  let opened: Opened | undefined;

  const place = () => {
    const view = doc.defaultView;
    if (!opened || !view) return;
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const { left, top } = menuPlacement(
      opened.field.getBoundingClientRect(),
      viewport,
      opened.height,
    );
    opened.host.style.setProperty("left", `${left}px`, "important");
    opened.host.style.setProperty("top", `${top}px`, "important");
    opened.host.style.setProperty("height", `${opened.height}px`, "important");
  };

  const close = () => {
    opened?.host.remove();
    opened = undefined;
  };

  return {
    /** A new menu under the field; the nonce goes only into the iframe's address */
    open: (field: HTMLElement, nonce: string) => {
      close();
      const host = doc.createElement("kennwort-menu");
      host.setAttribute("popover", "manual");
      host.style.cssText = HOST_STYLE;
      const iframe = doc.createElement("iframe");
      iframe.src = `${menuUrl}#${nonce}`;
      iframe.title = title;
      iframe.style.cssText = FRAME_STYLE;
      host.attachShadow({ mode: "closed" }).append(iframe);
      const below = new Set(topLayer(doc));
      doc.documentElement.append(host);
      host.showPopover?.();
      opened = { host, iframe, field, height: START_HEIGHT, below };
      place();
    },
    close,
    place,
    /** The menu page's own height, within bounds */
    resize: (height: number) => {
      if (!opened) return;
      opened.height = Math.round(Math.min(MAX_HEIGHT, Math.max(START_HEIGHT / 2, height)));
      place();
    },
    /** Moves the keyboard into the menu (↓ in the field) */
    focus: () => opened?.iframe.focus(),
    isClear: () => (opened ? menuIsClear(opened.host, opened.below) : false),
    /** Whether an event's target is the menu element */
    contains: (target: EventTarget | null) => opened !== undefined && target === opened.host,
    field: () => opened?.field,
  };
};

export type MenuFrame = ReturnType<typeof createMenuFrame>;
