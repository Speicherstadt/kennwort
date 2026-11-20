/** The device list (K-303): the account's devices, and signing one out */
import { DevicesWire } from "@kennwort/core";
import type { Call } from "./api.ts";

export const deviceCalls = (call: Call) => ({
  devices: async (token: string) => {
    const answer = await call("GET", "/api/devices", undefined, token);
    const parsed = DevicesWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data.devices : undefined;
  },
  removeDevice: async (token: string, id: string) =>
    (await call("DELETE", `/api/devices/${encodeURIComponent(id)}`, undefined, token)).status ===
    200,
});

export type DevicesApi = ReturnType<typeof deviceCalls>;
