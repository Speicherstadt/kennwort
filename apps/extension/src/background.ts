/**
 * The service worker (an event page in Firefox). For now it only closes the session area to
 * content scripts before anything is stored there; unlocking (K-402) and filling in (K-403) follow.
 */
import { browserSessionArea, restrictToTrustedContexts } from "./session-keys.ts";

// Not awaited at the top level: service workers refuse top-level await. Nothing is stored yet, so
// a failure is only reported; unlocking (K-402) must not store keys until this has succeeded.
void restrictToTrustedContexts(browserSessionArea()).then((restricted) => {
  if (!restricted.ok) console.error(`kennwort: session area not restricted (${restricted.error})`);
});
