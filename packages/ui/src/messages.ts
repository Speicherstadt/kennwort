// The texts without the components (Paraglide, messages/de.json and en.json): for code that runs
// outside a DOM, such as the CLI (K-606), which loads the client's entry types and search
export { m } from "./paraglide/messages.js";
export type { Locale } from "./paraglide/runtime.js";
export { locales, overwriteGetLocale } from "./paraglide/runtime.js";
