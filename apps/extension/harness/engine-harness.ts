/**
 * The fill flow of the extension in Playwright's Firefox and WebKit, which cannot load extensions
 * (K-407). Runs in every frame of the harness pages (harness-pages.ts) and wires the extension's
 * own code as the content script and the service worker wire it (src/content/main.ts,
 * src/background.ts): the inline menu on a login field (createInlineMenu, createMenuFrame,
 * mayOpenMenu, fillLogin) and the fill broker that checks frame and host (createFillBroker).
 *
 * Only the browser's part is a stand-in: messages between the frames go by postMessage instead of
 * chrome.runtime/chrome.tabs, and the frame tree is what each frame reports of itself instead of
 * chrome.webNavigation. Every decision (which frame, which host, whether the menu is clear,
 * which fields are shown, whether an event is the user's) is the extension's code in the engine.
 */
import { createInlineMenu } from "../src/content/inline-menu.ts";
import { createMenuFrame } from "../src/content/menu-frame.ts";
import { mayOpenMenu } from "../src/content/same-origin.ts";
import { createFillBroker } from "../src/fill/broker.ts";
import type { FrameInfo } from "../src/fill/frames.ts";
import { MENU_PAGE } from "../src/fill/messages.ts";
import { tracksVisibility } from "../src/menu/visibility.ts";

const EXTENSION_ID = "kennwort-engine-test";
const TAB = 1;

type Note =
  | { kind: "kennwort-test-who" }
  | { kind: "kennwort-test-hello"; url: string }
  | { kind: "kennwort-test-opened"; nonce: string }
  | { kind: "kennwort-test-deliver"; id: number; message: unknown }
  | { kind: "kennwort-test-answer"; id: number; answer: unknown };

const isNote = (data: unknown): data is Note =>
  typeof data === "object" &&
  data !== null &&
  String((data as Note).kind).startsWith("kennwort-test-");

const isTop = window === window.top;
const toTop = (note: Note) => window.top?.postMessage(note, "*");

/** This frame's content script: the menu under a login field, as src/content/main.ts sets it up */
const frame = createMenuFrame(
  document,
  new URL("/harness/menu.html", location.href).href,
  "Kennwort",
);
/** The menu opened last in any frame of the tab, as the top frame learnt of it */
let last: { frameId: number; nonce: string } | undefined;
const menu = createInlineMenu({
  frame: {
    ...frame,
    open: (field, nonce) => {
      frame.open(field, nonce);
      if (isTop) last = { frameId: 0, nonce };
      else toTop({ kind: "kennwort-test-opened", nonce });
    },
  },
  mayOpen: () => mayOpenMenu(window as unknown as Parameters<typeof mayOpenMenu>[0]),
  host: () => location.hostname,
  extensionId: EXTENSION_ID,
  random: (length) => crypto.getRandomValues(new Uint8Array(length)),
});
document.addEventListener("focusin", menu.onFocusIn, true);
document.addEventListener("keydown", menu.onKeyDown, true);
document.addEventListener("pointerdown", menu.onPointerDown, true);

/** The service worker's message to this frame's content script */
const deliverHere = (message: unknown) => menu.onMessage(message, { id: EXTENSION_ID });

if (!isTop) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.top || !isNote(event.data)) return;
    // The top frame may start after this one: it asks, and this frame says hello once more
    if (event.data.kind === "kennwort-test-who")
      toTop({ kind: "kennwort-test-hello", url: location.href });
    if (event.data.kind !== "kennwort-test-deliver") return;
    const answer = deliverHere(event.data.message);
    toTop({ kind: "kennwort-test-answer", id: event.data.id, answer: answer ?? null });
  });
  toTop({ kind: "kennwort-test-hello", url: location.href });
} else {
  startWorker();
}

/** The top frame plays the service worker: the frame tree, delivery to frames, the broker */
function startWorker() {
  const frames = new Map<number, { source: Window; url: string }>();
  const waiting = new Map<number, (answer: unknown) => void>();
  let next = 0;

  window.addEventListener("message", (event) => {
    if (!isNote(event.data) || !event.source) return;
    const source = event.source as Window;
    const note = event.data;
    const known = [...frames].find(([, entry]) => entry.source === source)?.[0];
    if (note.kind === "kennwort-test-hello" && known === undefined)
      frames.set(frames.size + 1, { source, url: note.url });
    const frameId = known ?? [...frames].find(([, entry]) => entry.source === source)?.[0];
    if (note.kind === "kennwort-test-opened" && frameId !== undefined)
      last = { frameId, nonce: note.nonce };
    if (note.kind === "kennwort-test-answer") waiting.get(note.id)?.(note.answer);
  });

  const send = (_tab: number, message: unknown, target: { frameId: number }) => {
    if (target.frameId === 0) return Promise.resolve(deliverHere(message));
    const entry = frames.get(target.frameId);
    if (!entry) return Promise.reject(new Error("no such frame"));
    const id = ++next;
    return new Promise<unknown>((resolve, reject) => {
      waiting.set(id, resolve);
      setTimeout(() => reject(new Error("no answer")), 2000);
      entry.source.postMessage({ kind: "kennwort-test-deliver", id, message }, "*");
    });
  };

  const tree = async (): Promise<FrameInfo[]> => [
    { frameId: 0, parentFrameId: -1, url: location.href },
    ...[...frames].map(([frameId, entry]) => ({ frameId, parentFrameId: 0, url: entry.url })),
  ];

  const broker = createFillBroker({
    extensionId: EXTENSION_ID,
    menuPath: `/${MENU_PAGE}`,
    frames: tree,
    send,
    openPopup: async () => {},
  });

  /** The menu's request to fill, as the menu page in `origin` (the extension's) sends it */
  const fill = (addresses: string[], origin: string) => {
    const current = last;
    if (!current) return Promise.resolve({ ok: false, error: "no-menu" });
    const request = {
      type: "menu-fill",
      nonce: current.nonce,
      addresses,
      username: "jonas.weber",
      password: "Kupfer-Rohr-17!",
    };
    const url = `${origin}/${MENU_PAGE}#${current.nonce}`;
    return broker(request, { id: EXTENSION_ID, url, frameId: 99, tab: { id: TAB } });
  };

  for (let index = 0; index < window.frames.length; index++)
    window.frames[index]?.postMessage({ kind: "kennwort-test-who" }, "*");

  Object.assign(window, {
    kennwortHarness: {
      fill,
      frames: () => frames.size,
      /** The address of the frame a menu opened in last, undefined for none */
      menuIn: () => last && (last.frameId === 0 ? location.href : frames.get(last.frameId)?.url),
      menuClear: () => frame.isClear(),
      tracksVisibility: () => tracksVisibility(),
    },
  });
}
