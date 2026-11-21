/**
 * Whether the content script of this frame may open a menu at all (K-403, P-17): in the top frame,
 * or in a frame of the same origin as every frame above it. A frame of another origin cannot read
 * its parent's location (the browser throws), which is exactly the case that gets no menu. The
 * service worker decides again from the browser's frame tree before it sends anything
 * (fill/frames.ts); this check only keeps the menu from opening where it could never fill.
 */

/** The part of a window this needs */
export type FrameWindow = {
  parent: FrameWindow;
  top: FrameWindow | null;
  location: { origin: string };
};

export const mayOpenMenu = (win: FrameWindow) => {
  try {
    const origin = win.location.origin;
    if (origin === "null") return false;
    for (let frame = win; frame !== win.top; frame = frame.parent) {
      if (frame.parent === frame || frame.parent.location.origin !== origin) return false;
    }
    return true;
  } catch {
    return false;
  }
};
