/**
 * The extension's texts come from the same messages as the web app's, but through a Paraglide
 * runtime compiled without the localStorage strategy (root package.json, "i18n", into
 * apps/extension/paraglide): the web app remembers a chosen language there, the extension keeps
 * nothing outside chrome.storage.session. With the strategy off, Paraglide's tree-shaking flags
 * drop its localStorage code from the bundle. This plugin points every import of packages/ui's
 * Paraglide output at the extension's.
 */
import { join, sep } from "node:path";
import type { Plugin } from "vite";

const ui = join(import.meta.dirname, "..", "..", "..", "packages", "ui", "src", "paraglide") + sep;
const own = join(import.meta.dirname, "..", "paraglide") + sep;

export const paraglideWithoutStorage = (): Plugin => ({
  name: "kennwort:paraglide-without-storage",
  enforce: "pre",
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved?.id.startsWith(ui)) return null;
    return { ...resolved, id: own + resolved.id.slice(ui.length) };
  },
});
