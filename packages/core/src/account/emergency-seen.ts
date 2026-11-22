/**
 * What a grantee's client remembers of each grantor's emergency access (K-307 part d, P-14), in the
 * account state: the newest grant it has seen (its signed time), whether the grantor revoked that
 * one, and the newest of its own requests the grantor objected to. A server that plays back an
 * older grant after a revocation, or releases a request after an objection, is then caught.
 */
import { z } from "zod";

export const EmergencySeen = z.object({
  grant: z.number().int().nonnegative(),
  revoked: z.boolean(),
  objected: z.number().int().nonnegative(),
});
export type EmergencySeen = z.infer<typeof EmergencySeen>;

const nothingSeen: EmergencySeen = { grant: 0, revoked: false, objected: 0 };

/** An older grant than the newest seen, or the newest seen once it was revoked */
export const isReplayed = (seen: EmergencySeen | undefined, time: number) =>
  seen !== undefined && (time < seen.grant || (time === seen.grant && seen.revoked));

/** A grant this client accepted: newer than the one remembered, it takes its place */
export const noteGrant = (seen: EmergencySeen | undefined, time: number): EmergencySeen => {
  const known = seen ?? nothingSeen;
  return time > known.grant ? { ...known, grant: time, revoked: false } : known;
};

/** A revocation the grantor signed for the grant of this time; one for an older grant changes nothing */
export const noteRevocation = (
  seen: EmergencySeen | undefined,
  grantTime: number,
): EmergencySeen => {
  const known = seen ?? nothingSeen;
  return grantTime >= known.grant ? { ...known, grant: grantTime, revoked: true } : known;
};

/** An objection the grantor signed to the request of this time */
export const noteObjection = (
  seen: EmergencySeen | undefined,
  requestedAt: number,
): EmergencySeen => {
  const known = seen ?? nothingSeen;
  return { ...known, objected: Math.max(known.objected, requestedAt) };
};

/** The newer grant from either side, revoked if a side that knows it saw it revoked */
const mergeOne = (mine: EmergencySeen, theirs: EmergencySeen): EmergencySeen => ({
  grant: Math.max(mine.grant, theirs.grant),
  revoked:
    (mine.grant >= theirs.grant && mine.revoked) || (theirs.grant >= mine.grant && theirs.revoked),
  objected: Math.max(mine.objected, theirs.objected),
});

/** Both devices' memory: per grantor the newer grant, a revocation of it from either side */
export const mergeEmergency = (
  mine: Record<string, EmergencySeen>,
  theirs: Record<string, EmergencySeen>,
): Record<string, EmergencySeen> => {
  const merged = { ...theirs, ...mine };
  for (const [grantor, seen] of Object.entries(theirs)) {
    const own = mine[grantor];
    if (own) merged[grantor] = mergeOne(own, seen);
  }
  return merged;
};
