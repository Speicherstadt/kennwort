/**
 * What every page in the prompt frame watches while it is open (K-404, K-405): whether the browser
 * reports it visible (IntersectionObserver v2, menu/visibility.ts), which arms its clicks only after
 * ARM_AFTER_MS without a break, and its height, which the frame in the page follows. Returns the
 * function that stops both.
 */
import { ARM_AFTER_MS, type VisibilityGuard, watchVisibility } from "../menu/visibility.ts";
import type { PromptBridge } from "./bridge.ts";

export const watchPromptFrame = (
  root: HTMLElement | undefined,
  bridge: PromptBridge,
  guard: VisibilityGuard,
  setArmed: (armed: boolean) => void,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = false;
  const stop = root
    ? watchVisibility(
        root,
        guard,
        (now) => {
          if (now === visible) return;
          visible = now;
          clearTimeout(timer);
          setArmed(false);
          if (now) timer = setTimeout(() => setArmed(guard.armed(bridge.now())), ARM_AFTER_MS);
        },
        bridge.Observer,
      )
    : () => {};
  const size = () => {
    const height = Math.ceil(root?.getBoundingClientRect().height ?? 0);
    if (height > 0) void bridge.request({ type: "prompt-size", nonce: bridge.nonce, height });
  };
  const resizes = globalThis.ResizeObserver ? new ResizeObserver(size) : undefined;
  if (root) resizes?.observe(root);
  return () => {
    stop();
    clearTimeout(timer);
    resizes?.disconnect();
  };
};
