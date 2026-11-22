/**
 * crxjs knows Chrome and Firefox only. Safari's build runs as Chrome's (a module service worker),
 * and this plugin then takes `use_dynamic_url` out of the written manifest: crxjs adds it to the
 * entry of the content script's chunks, and Safari does not read it, since its extension address
 * changes with every launch anyway (MDN, web_accessible_resources). Runs after crxjs has written
 * manifest.json, so nothing else changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

type Manifest = { web_accessible_resources?: Record<string, unknown>[] };

/** The manifest without the key only Chrome reads */
export const withoutDynamicUrl = (manifest: Manifest): Manifest => ({
  ...manifest,
  web_accessible_resources: (manifest.web_accessible_resources ?? []).map(
    ({ use_dynamic_url, ...entry }) => entry,
  ),
});

export const safariManifest = (): Plugin => ({
  name: "kennwort:safari-manifest",
  apply: "build",
  enforce: "post",
  writeBundle(options) {
    const file = join(options.dir ?? "", "manifest.json");
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
    writeFileSync(file, `${JSON.stringify(withoutDynamicUrl(manifest), null, 2)}\n`);
  },
});
