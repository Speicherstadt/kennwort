/**
 * What the security overview (K-603, docs/sicherheitsdesign.md P-23) keeps in the account state,
 * sealed under AK like the rest of it: whether this person switched the leak check on, and which
 * month's report they have seen. In the sealed state the server can neither switch the check on
 * behind their back (it would then learn prefixes it was never meant to see) nor tell from the
 * outside who uses it.
 */
import { z } from "zod";

/** On or off, and when that was chosen (Unix ms): the later choice wins between devices */
export const LeakCheckChoice = z.object({
  on: z.boolean(),
  at: z.number().int().nonnegative(),
});
export type LeakCheckChoice = z.infer<typeof LeakCheckChoice>;

/** A month as YYYY-MM in UTC */
export const ReportMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** The later of two choices; chosen at the same moment, off wins */
export const laterChoice = (
  mine: LeakCheckChoice | undefined,
  theirs: LeakCheckChoice | undefined,
): LeakCheckChoice | undefined => {
  if (!mine || !theirs) return mine ?? theirs;
  return theirs.at > mine.at || (theirs.at === mine.at && !theirs.on) ? theirs : mine;
};

/**
 * This person's new choice over the current one: dated now, but always after the current one, so
 * it wins on every device even when the current one came from a device whose clock ran ahead
 * (review of K-603: else that device would merge the check back on)
 */
export const nextChoice = (
  current: LeakCheckChoice | undefined,
  on: boolean,
  now: number,
): LeakCheckChoice => ({ on, at: Math.max(now, current ? current.at + 1 : 0) });

/** The later of two months; YYYY-MM sorts as text */
export const laterMonth = (mine: string | undefined, theirs: string | undefined) =>
  [mine, theirs]
    .filter((month) => month !== undefined)
    .sort()
    .at(-1);

/** The merged security settings of two account states, only those that are set */
export const mergeSecurityPrefs = (
  mine: { leakCheck?: LeakCheckChoice | undefined; reportSeen?: string | undefined },
  theirs: { leakCheck?: LeakCheckChoice | undefined; reportSeen?: string | undefined },
) => {
  const leakCheck = laterChoice(mine.leakCheck, theirs.leakCheck);
  const reportSeen = laterMonth(mine.reportSeen, theirs.reportSeen);
  return { ...(leakCheck ? { leakCheck } : {}), ...(reportSeen ? { reportSeen } : {}) };
};

/** Whether the leak check is on: only after this person switched it on */
export const leakCheckOn = (state: { leakCheck?: LeakCheckChoice | undefined }) =>
  state.leakCheck?.on === true;

/** The month of a moment (Unix ms), in UTC */
export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** Whether a new month's report is due: none seen yet, or the one seen is from an earlier month */
export const reportDue = (seen: string | undefined, now: number) =>
  seen === undefined || seen < monthOf(now);
