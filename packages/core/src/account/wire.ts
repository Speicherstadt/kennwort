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
