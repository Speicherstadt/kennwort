/**
 * The service worker (an event page in Firefox): it closes the session area to content scripts
 * and clears the unlocked keys when the lock alarm rings (account/auto-lock.ts), also while no
 * popup is open. Filling in (K-403) follows.
 */
import { browserAlarms, lockOnAlarm } from "./account/auto-lock.ts";
import { browserSessionArea, restrictToTrustedContexts } from "./session-keys.ts";

// Not awaited at the top level: service workers refuse top-level await. The popup closes the area
// once more before it stores a key and refuses to store one if that fails (account/unlocked-store.ts).
void restrictToTrustedContexts(browserSessionArea()).then((restricted) => {
  if (!restricted.ok) console.error(`kennwort: session area not restricted (${restricted.error})`);
});

// Registered at once, at the top level, so a worker woken by the alarm has its listener (MV3)
browserAlarms()?.onAlarm?.addListener((alarm) => void lockOnAlarm(browserSessionArea(), alarm));
