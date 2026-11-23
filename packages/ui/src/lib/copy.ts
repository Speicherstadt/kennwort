/**
 * Copying a value on a click, with a toast that names what was copied (DESIGN.md, Geheimnisfeld).
 * A copied secret does not stay on the clipboard (K-803): after 30 s it is cleared, but only if the
 * clipboard still holds our value, so something the person copied since is left alone. In the
 * Android app the native side copies instead: it marks the clip as sensitive (no preview in the
 * system's clipboard overlay) and clears it itself (apps/mobile, ClipboardPlugin.kt).
 */
import type { Toasts } from "../components/toast.tsx";
import { m } from "../paraglide/messages.js";

export const CLEAR_AFTER_MS = 30_000;

/** Where a copy goes: the browser's clipboard, or the app's native one */
export type SecretClipboard = {
  /** Copies the text and arranges for it to be cleared after CLEAR_AFTER_MS */
  copySecret: (text: string) => Promise<void>;
};

type TextClipboard = Pick<Clipboard, "writeText" | "readText">;
type Schedule = (run: () => void, ms: number) => unknown;

const clearIfOurs = async (clipboard: TextClipboard, text: string) => {
  try {
    if ((await clipboard.readText()) === text) await clipboard.writeText("");
  } catch {
    // Reading denied or the page not focused: never clear blind, it may be someone else's copy
  }
};

/** The web: the async Clipboard API, cleared by reading back and comparing */
export const browserClipboard = (
  clipboard: TextClipboard = navigator.clipboard,
  schedule: Schedule = (run, ms) => setTimeout(run, ms),
): SecretClipboard => ({
  copySecret: async (text) => {
    await clipboard.writeText(text);
    schedule(() => void clearIfOurs(clipboard, text), CLEAR_AFTER_MS);
  },
});

type TauriInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

/** The Tauri app: the Rust command `copy_secret` hands the text to the Android plugin */
export const nativeClipboard = (invoke: TauriInvoke): SecretClipboard => ({
  copySecret: async (text) => {
    await invoke("copy_secret", { text });
  },
});

/** iOS and desktop dev builds have no native plugin yet: the command fails, the web way copies */
const withFallback = (first: SecretClipboard, second: SecretClipboard): SecretClipboard => ({
  copySecret: async (text) => {
    try {
      await first.copySecret(text);
    } catch {
      await second.copySecret(text);
    }
  },
});

type TauriScope = { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } };

/** The app's webview exposes Tauri's IPC; a browser does not, and keeps the web behaviour */
export const detectClipboard = (scope: TauriScope = globalThis as TauriScope): SecretClipboard => {
  const invoke = scope.__TAURI_INTERNALS__?.invoke;
  return invoke ? withFallback(nativeClipboard(invoke), browserClipboard()) : browserClipboard();
};

export const copyText = async (
  text: string,
  label: string,
  toasts: Toasts,
  clipboard: SecretClipboard = detectClipboard(),
) => {
  try {
    await clipboard.copySecret(text);
    toasts.show(m.field_copied({ field: label }), "success");
  } catch {
    // No clipboard (insecure context or denied): the value stays on screen to copy by hand
  }
};
