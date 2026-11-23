/**
 * The company's server for the popup: the web app's API (packages/client) with every path resolved
 * against the server the user connected. The web app calls its own origin; the extension runs under
 * its own (chrome-extension://…), and the server answers it with CORS headers (K-402). A request to
 * any other origin is refused (packages/client, server-fetch.ts), so nothing the extension sends can
 * leave for another host.
 */
import { type Api, createApi } from "@kennwort/client/session/api.ts";
import { deviceName } from "@kennwort/client/session/device-identity.ts";
import { type Send, serverFetch } from "@kennwort/client/session/server-fetch.ts";
import { encodeBytes } from "@kennwort/core";
import type { DeviceRecord } from "./records.ts";

/** How the extension names itself in the device list, e.g. "Chrome · Linux · Extension" */
export const extensionDeviceName = (userAgent: string) => `${deviceName(userAgent)} · Extension`; // i18n-ignore

export const serverApiFor =
  (send: Send, userAgent: string) =>
  (device: DeviceRecord): Api =>
    createApi(serverFetch(device.server, send), {
      id: encodeBytes(device.deviceId),
      name: extensionDeviceName(userAgent),
    });
