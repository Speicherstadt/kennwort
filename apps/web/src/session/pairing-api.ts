/** The calls of adding a device (P-04); every answer is parsed before it is used */
import {
  AnnouncedWire,
  encodeBytes,
  PairingKeyWire,
  type PollAnswer,
  PollWire,
} from "@kennwort/core";
import type { Call } from "./api.ts";

const path = (id: string, rest = "") => `${encodeURIComponent(id)}${rest}`;

export const pairingCalls = (call: Call) => ({
  /** The new device announces its one-time key (P-04) */
  announcePairing: async (publicKey: Uint8Array) => {
    const parsed = AnnouncedWire.safeParse(
      (await call("POST", "/auth/pairings", { publicKey: encodeBytes(publicKey) })).json,
    );
    return parsed.success ? parsed.data : undefined;
  },
  pollPairing: async (id: string, pollToken: string): Promise<PollAnswer | undefined> => {
    const answer = await call("POST", `/auth/pairings/${path(id, "/poll")}`, {
      pollToken,
    });
    const parsed = PollWire.safeParse(answer.json);
    return answer.status === 200 && parsed.success ? parsed.data : undefined;
  },
  cancelPairing: async (id: string, pollToken: string) =>
    (await call("POST", `/auth/pairings/${path(id, "/cancel")}`, { pollToken })).status === 200,
  /** The unlocked device: load the key, answer with the package, confirm */
  pairingKey: async (token: string, id: string) => {
    const answer = await call("GET", `/api/pairings/${path(id)}`, undefined, token);
    const parsed = PairingKeyWire.safeParse(answer.json);
    return parsed.success ? parsed.data.publicKey : undefined;
  },
  answerPairing: async (token: string, id: string, pkg: Uint8Array) =>
    (await call("PUT", `/api/pairings/${path(id)}`, { package: encodeBytes(pkg) }, token))
      .status === 200,
  confirmPairing: async (token: string, id: string) =>
    (await call("POST", `/api/pairings/${path(id, "/confirm")}`, {}, token)).status === 200,
});

export type PairingApi = ReturnType<typeof pairingCalls>;
export type { PollAnswer };
