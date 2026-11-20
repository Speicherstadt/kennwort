/** The account's answers from the server (K-303), parsed before the client unlocks anything */
import { z } from "zod";
import { bytes } from "../sync/bytes.ts";

export const StoredWire = z.object({
  accountId: bytes(16),
  accountSalt: bytes(16),
  keyBlock: bytes(),
  state: bytes(),
  stateCounter: z.number().int().nonnegative(),
  unlock: z.object({ passphrase: bytes(), recovery: bytes() }),
});

export const SessionWire = z.object({ accountId: z.string(), token: z.string().min(1) });

/** Adding a device (P-04): what the server answers the new device and the unlocked one */
export const AnnouncedWire = z.object({ id: z.string().min(1), pollToken: z.string().min(1) });
export const PollWire = z.discriminatedUnion("state", [
  z.object({ state: z.literal("waiting") }),
  z.object({ state: z.literal("package"), package: bytes() }),
  z.object({ state: z.literal("confirmed"), package: bytes(), token: z.string().min(1) }),
]);
export type PollAnswer = z.infer<typeof PollWire>;
// An X-Wing public key (F-02)
export const PairingKeyWire = z.object({ publicKey: bytes(1216) });

/** The device list (K-303): sessions of the account, the one asking marked */
export const DevicesWire = z.object({
  devices: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().nullable(),
      signedInAt: z.number(),
      lastSeenAt: z.number(),
      current: z.boolean(),
    }),
  ),
});
export type DeviceEntry = z.infer<typeof DevicesWire>["devices"][number];
