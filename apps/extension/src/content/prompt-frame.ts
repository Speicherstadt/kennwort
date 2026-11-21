/**
 * The save prompt's place in the page (K-404, DESIGN.md Speichern-Leiste): like the inline menu
 * (menu-frame.ts) an element of its own with a closed shadow root holding an iframe of the
 * extension's prompt page, in the top layer, here at the top right of the viewport. It is created
 * hidden: the prompt page first opens the account and compares, and only asks to be shown when it
 * has something to offer, so a login Kennwort already knows shows nothing. Before a save the content
 * script checks it from the page's side exactly as the menu before a fill (menuIsClear).
 */
import { menuIsClear, topLayer } from "./menu-frame.ts";

export const PROMPT_WIDTH = 360;
const START_HEIGHT = 120;
const MAX_HEIGHT = 420;
const MARGIN = 16;

/** At the top right, inside the viewport also when it is narrower than the prompt */
export const promptPlacement = (viewportWidth: number) => ({
  left: Math.max(MARGIN / 2, viewportWidth - PROMPT_WIDTH - MARGIN),
  top: MARGIN,
});

// Inline and important, so no style sheet of the page wins over them (as menu-frame.ts)
const hostStyle = (display: "none" | "block") =>
  [
    "all: initial",
    "position: fixed",
    "inset: auto",
    "margin: 0",
    "padding: 0",
    "border: 0",
    `width: ${PROMPT_WIDTH}px`,
    `max-width: calc(100vw - ${MARGIN}px)`,
    `height: ${START_HEIGHT}px`,
    "overflow: hidden",
    "border-radius: 12px",
    "background: transparent",
    "box-shadow: 0 8px 24px rgb(0 0 0 / 0.18)",
    "opacity: 1",
    `display: ${display}`,
    "visibility: visible",
    "z-index: 2147483647",
  ]
    .map((rule) => `${rule} !important`)
    .join("; ");

const FRAME_STYLE = "all: initial; display: block; width: 100%; height: 100%; border: 0;";

type Opened = {
  host: HTMLElement;
  height: number;
  shown: boolean;
  /** What was in the top layer before the prompt showed: it lies below the prompt */
  below: ReadonlySet<Element>;
};

/** Opens, shows, sizes and closes the one save prompt of a document */
export const createPromptFrame = (doc: Document, promptUrl: string, title: string) => {
  let opened: Opened | undefined;

  const place = () => {
    const view = doc.defaultView;
    if (!opened?.shown || !view) return;
    const { left, top } = promptPlacement(view.innerWidth);
    opened.host.style.setProperty("left", `${left}px`, "important");
    opened.host.style.setProperty("top", `${top}px`, "important");
    opened.host.style.setProperty("height", `${opened.height}px`, "important");
  };

  const close = () => {
    opened?.host.remove();
    opened = undefined;
  };

  return {
    /** A new, hidden prompt; the nonce goes only into the iframe's address */
    open: (nonce: string) => {
      close();
      const host = doc.createElement("kennwort-save");
      host.setAttribute("popover", "manual");
      host.style.cssText = hostStyle("none");
      const iframe = doc.createElement("iframe");
      iframe.src = `${promptUrl}#${nonce}`;
      iframe.title = title;
      iframe.style.cssText = FRAME_STYLE;
      host.attachShadow({ mode: "closed" }).append(iframe);
      doc.documentElement.append(host);
      opened = { host, height: START_HEIGHT, shown: false, below: new Set() };
    },
    /** The prompt has something to offer: into the top layer, at the top right */
    show: () => {
      if (!opened || opened.shown) return;
      opened.below = new Set(topLayer(doc));
      opened.host.style.cssText = hostStyle("block");
      opened.host.showPopover?.();
      opened.shown = true;
      place();
    },
    close,
    place,
    resize: (height: number) => {
      if (!opened) return;
      opened.height = Math.round(Math.min(MAX_HEIGHT, Math.max(START_HEIGHT / 2, height)));
      place();
    },
    isOpen: () => opened !== undefined,
    isClear: () => (opened?.shown ? menuIsClear(opened.host, opened.below) : false),
  };
};

export type PromptFrame = ReturnType<typeof createPromptFrame>;
