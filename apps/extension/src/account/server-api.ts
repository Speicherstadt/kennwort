/**
 * The company's server for the popup: the web app's API (packages/client) with every path resolved
 * against the server the user connected. The web app calls its own origin; the extension runs under
 * its own (chrome-extension://…), and the server answers it with CORS headers (K-402). A request to
 * any other origin is refused here, so nothing the extension sends can leave for another host.
 */
import { type Api, createApi } from "@kennwort/client/session/api.ts";
import { deviceName } from "@kennwort/client/session/device-identity.ts";
import { encodeBytes } from "@kennwort/core";
import type { DeviceRecord } from "./records.ts";

const target = (input: RequestInfo | URL, server: string) =>
  input instanceof Request ? new URL(input.url) : new URL(String(input), server);

type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** fetch against one server's origin, and only that one */
export const serverFetch = (server: string, send: Send): typeof fetch => {
  const fetchFromServer: Send = async (input, init) => {
    const url = target(input, server);
    if (url.origin !== server) throw new TypeError(`not the connected server: ${url.origin}`); // i18n-ignore
    return send(input instanceof Request ? input : url, init);
  };
  // The API wants the platform's fetch; Bun's type adds `preconnect`, which nothing here calls
  return fetchFromServer as typeof fetch;
};

/** How the extension names itself in the device list, e.g. "Chrome · Linux · Extension" */
export const extensionDeviceName = (userAgent: string) => `${deviceName(userAgent)} · Extension`; // i18n-ignore

export const serverApiFor =
  (send: Send, userAgent: string) =>
  (device: DeviceRecord): Api =>
    createApi(serverFetch(device.server, send), {
      id: encodeBytes(device.deviceId),
      name: extensionDeviceName(userAgent),
    });
