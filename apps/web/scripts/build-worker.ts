/**
 * Builds the service worker into <dist>/sw.js under a fixed name (P-16), with the public release key
 * written in. Bun bundles it on its own, outside Vite, so the file has no hash in its name and stays
 * byte-identical as long as its code and the key stay the same: the browser then never replaces it.
 *
 *   bun scripts/build-worker.ts dist
 */
import { join } from "node:path";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import { pushTextsOf } from "../src/sw/push.ts";
import { toHex } from "../src/sw/release.ts";
import { trustedKey } from "./release-build.ts";

const dist = process.argv[2] ?? "dist";
const key = trustedKey(process.env);
if (!key.ok) {
  console.error(key.error);
  process.exit(1);
}

const result = await Bun.build({
  entrypoints: [join(import.meta.dirname, "../src/sw/sw.ts")],
  target: "browser",
  format: "iife",
  minify: true,
  define: {
    KENNWORT_RELEASE_PUBLIC_KEY: JSON.stringify(toHex(key.value)),
    // The two texts of an empty push (K-602), from the message files Paraglide compiles
    KENNWORT_PUSH_TEXTS: JSON.stringify(pushTextsOf({ de, en })),
  },
});
const [output] = result.outputs;
if (!result.success || !output) {
  console.error(result.logs.join("\n"));
  process.exit(1);
}
await Bun.write(join(dist, "sw.js"), output);
