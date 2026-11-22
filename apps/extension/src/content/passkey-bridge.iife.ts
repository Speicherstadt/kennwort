/**
 * The content script beside the page's passkey provider (K-406, manifest.ts): it takes a ceremony
 * the page's world posted to this frame's own window, passes it to the service worker and returns
 * the worker's answer (passkey/channel.ts). It reads no storage area and decides nothing.
 */

import { createPasskeyBridge } from "../passkey/channel.ts";
import type { AbortRequest, PageRequest } from "../passkey/messages.ts";

type Runtime = { id?: string; sendMessage(message: PageRequest | AbortRequest): Promise<unknown> };
const runtime = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;

if (runtime?.id)
  window.addEventListener(
    "message",
    createPasskeyBridge({ win: window, send: (message) => runtime.sendMessage(message) }),
  );
