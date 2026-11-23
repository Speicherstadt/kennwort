/**
 * The notweg sign-in (docs/sicherheitsdesign.md, P-02): the device derives an Ed25519 key from
 * passphrase and Secret Key (F-05, "login"); the server keeps only its public key and the account
 * salt, sends a one-time challenge and checks the signature. Neither the passphrase nor anything
 * that lets one guess it without the Secret Key ever reaches the server. Who forgot the passphrase
 * signs in the same way with the key the Recovery Key gives (P-12, way "recovery"); its signatures
 * have a purpose of their own, so one never counts for the other.
 */
import { createHmac } from "node:crypto";
import { bytes, encodeBytes } from "@kennwort/core";
import { verify } from "@kennwort/crypto";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.ts";
import { loginChallenges, loginKeys } from "../db/schema.ts";
import type { Auth } from "./better-auth.ts";
import type { ClientAddress, ClientEnv } from "./client-address.ts";
import { startSession } from "./devices.ts";
import { clearFailures, isLocked, recordFailure } from "./limits.ts";

const CHALLENGE_MS = 2 * 60 * 1000;
const Way = z.enum(["passphrase", "recovery"]);
type Way = z.infer<typeof Way>;
const ChallengeRequest = z.object({
  accountId: z.string().min(1).max(64),
  way: Way.default("passphrase"),
});
/** The signature's purpose per way (F-03) */
export const LOGIN_PURPOSE: Record<Way, string> = {
  passphrase: "login",
  recovery: "login-recovery",
};
const VerifyRequest = z.object({ challengeId: z.string().min(1).max(64), signature: bytes(65) });

export type LoginKeyDeps = {
  db: Db;
  /** The server secret, for decoy salts of accounts that do not exist */
  secret: string;
  auth: Auth;
  now: () => number;
  random: (length: number) => Uint8Array;
  allow: (key: string) => boolean;
  address: ClientAddress;
};

export const loginKeyRoutes = ({ db, secret, auth, now, random, allow, address }: LoginKeyDeps) => {
  const decoySalt = (accountId: string) =>
    encodeBytes(
      createHmac("sha256", secret).update(`decoy-salt:${accountId}`).digest().subarray(0, 16),
    );
  return new Hono()
    .post("/challenge", async (c) => {
      if (!allow(`challenge:${address(c.req.raw, c.env as ClientEnv)}`))
        return c.json({ error: "too-many-requests" }, 429);
      const parsed = ChallengeRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const key = db
        .select()
        .from(loginKeys)
        .where(eq(loginKeys.accountId, parsed.data.accountId))
        .get();
      // An unknown account gets a challenge too, with a stable salt derived from its name and the
      // server secret: asking twice tells nothing about whether the account exists
      const accountSalt = key?.accountSalt ?? decoySalt(parsed.data.accountId);
      const id = encodeBytes(random(16));
      const challenge = encodeBytes(random(32));
      db.insert(loginChallenges)
        .values({
          id,
          accountId: parsed.data.accountId,
          way: parsed.data.way,
          challenge,
          expiresAt: now() + CHALLENGE_MS,
        })
        .run();
      return c.json({ challengeId: id, challenge, accountSalt });
    })
    .post("/verify", async (c) => {
      if (!allow(`verify:${address(c.req.raw, c.env as ClientEnv)}`))
        return c.json({ error: "too-many-requests" }, 429);
      const parsed = VerifyRequest.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: "invalid" }, 400);
      const at = now();
      const challenge = db
        .delete(loginChallenges)
        .where(
          and(eq(loginChallenges.id, parsed.data.challengeId), gt(loginChallenges.expiresAt, at)),
        )
        .returning()
        .get();
      // A challenge that confirms a deletion (K-607) never signs anyone in
      if (!challenge || challenge.way === "delete")
        return c.json({ error: "unknown-challenge" }, 401);
      const { accountId } = challenge;
      if (isLocked(db, accountId, at)) return c.json({ error: "locked" }, 423);
      const key = db.select().from(loginKeys).where(eq(loginKeys.accountId, accountId)).get();
      const publicKey = challenge.way === "recovery" ? key?.recoveryPublicKey : key?.publicKey;
      const signed =
        publicKey !== undefined &&
        publicKey !== null &&
        verify(
          bytes(32).parse(publicKey),
          parsed.data.signature,
          LOGIN_PURPOSE[challenge.way],
          accountId,
          bytes(32).parse(challenge.challenge),
        );
      if (!signed) {
        recordFailure(db, accountId, at);
        return c.json({ error: "denied" }, 401);
      }
      clearFailures(db, accountId);
      const session = await startSession(db, auth, accountId, c.req.raw);
      return session ? c.json({ token: session.token }) : c.json({ error: "internal" }, 500);
    });
};
