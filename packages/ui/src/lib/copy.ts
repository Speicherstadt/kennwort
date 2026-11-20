/** Copying a value on a click, with a toast that names what was copied (DESIGN.md, Geheimnisfeld) */
import type { Toasts } from "../components/toast.tsx";
import { m } from "../paraglide/messages.js";

export const copyText = async (text: string, label: string, toasts: Toasts) => {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(m.field_copied({ field: label }), "success");
  } catch {
    // No clipboard (insecure context or denied): the value stays on screen to copy by hand
  }
};
