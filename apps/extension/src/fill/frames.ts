/**
 * Whether a frame may be filled (K-403, P-17), judged from the browser's own frame tree
 * (chrome.webNavigation) as it is at that moment, never from what a page or a message claims. It
 * must be the top frame or a frame of the same origin as every frame above it up to the top: never
 * a frame of another origin, so a foreign iframe on a matching page (an ad, a widget, an attacker's
 * frame) gets nothing, and neither does a matching site framed by a foreign page. Which frame the
 * menu belongs to the service worker learns from the content scripts (broker.ts): the browser's
 * frame tree does not list the extension's own frames.
 */

/** A frame of a tab as chrome.webNavigation.getAllFrames reports it */
export type FrameInfo = {
  frameId: number;
  parentFrameId: number;
  url: string;
  /** Chrome only: pins the one document, so a frame that navigated meanwhile gets nothing */
  documentId?: string;
};

/** Where a fill may go: the frame, its document, and the address it has right now */
export type FillTarget = { frameId: number; documentId?: string; url: string };

export type FrameRefusal = "unknown-frame" | "foreign-frame" | "no-page";
export type FrameResult = { ok: true; value: FillTarget } | { ok: false; error: FrameRefusal };

const WEB = new Set(["http:", "https:"]);

/** The origin of a web page; undefined for about:blank, data:, extension pages and the like */
const webOrigin = (url: string) => {
  try {
    const parsed = new URL(url);
    return WEB.has(parsed.protocol) ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
};

/** The frames from this one up to the top frame, or undefined when the chain breaks */
const chainToTop = (frames: readonly FrameInfo[], start: FrameInfo) => {
  const byId = new Map(frames.map((frame) => [frame.frameId, frame]));
  const chain = [start];
  for (let frame = start; frame.parentFrameId !== -1; ) {
    const parent = byId.get(frame.parentFrameId);
    // A loop or a missing parent: the tree is not one the browser would report
    if (!parent || chain.includes(parent)) return undefined;
    chain.push(parent);
    frame = parent;
  }
  return chain;
};

/** The web frames of a tab: those a content script runs in and a menu can belong to */
export const webFrames = (frames: readonly FrameInfo[]) =>
  frames.filter((frame) => webOrigin(frame.url) !== undefined);

/** The frame with this ID, if a fill may go there */
export const fillTarget = (frames: readonly FrameInfo[], id: number): FrameResult => {
  const target = frames.find((frame) => frame.frameId === id);
  if (!target) return { ok: false, error: "unknown-frame" };
  const origin = webOrigin(target.url);
  if (!origin) return { ok: false, error: "no-page" };
  const chain = chainToTop(frames, target);
  if (!chain) return { ok: false, error: "unknown-frame" };
  if (!chain.every((frame) => webOrigin(frame.url) === origin))
    return { ok: false, error: "foreign-frame" };
  const { frameId, documentId, url } = target;
  return { ok: true, value: documentId ? { frameId, documentId, url } : { frameId, url } };
};
