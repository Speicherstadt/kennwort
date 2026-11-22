/**
 * The passkey provider in the page's own world (K-406, manifest.ts): runs before the page's
 * scripts and puts Kennwort in front of navigator.credentials (passkey/page-api.ts). It holds no
 * secret and cannot reach the extension; it posts to the content script of its own frame only.
 */
import { askContentScript } from "../passkey/channel.ts";
import { installPasskeys, type PageWorld } from "../passkey/page-api.ts";

if (globalThis.isSecureContext && navigator.credentials)
  installPasskeys(navigator.credentials, askContentScript(window), window as unknown as PageWorld);
