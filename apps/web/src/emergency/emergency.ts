/**
 * Emergency access in the web app (K-307 part d, P-14), without any interface: where a grant
 * stands, the waiting times the form offers, and the renewal after a key rotation, which runs after
 * every load of the vaults as the catch-up of exits does (app.tsx).
 */
import {
  type EmergencyDeps,
  loadEmergency,
  renewGrants,
} from "@kennwort/client/emergency/emergency.ts";
import type { EmergencyApi } from "@kennwort/client/session/emergency-api.ts";
import type { Loaded } from "@kennwort/client/vaults/vaults.ts";
import { isSignedGrant, type ListedGrant } from "@kennwort/core";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";

/** One day to 30 days (P-14); a week unless chosen otherwise */
export const WAIT_DAYS = [1, 2, 7, 14, 30] as const;
export const DEFAULT_WAIT_DAYS = 7;
export const DAY_SECONDS = 86_400;

export type Phase = "idle" | "waiting" | "objected" | "released";

/** Where a listed grant stands at a time (seconds), by what the server lists */
export const phaseOf = (listed: ListedGrant, now: number): Phase => {
  if (!listed.request) return "idle";
  if (listed.objection) return "objected";
  const over = listed.releaseAt !== null && now >= listed.releaseAt;
  return listed.approval || over ? "released" : "waiting";
};

/** The grants this account gave whose grantee asked and is waiting: the grantor's notice */
export const waitingRequests = <T extends ListedGrant>(given: readonly T[], now: number) =>
  given.filter((g) => phaseOf(g, now) === "waiting");

/** After a load of the vaults: view grants behind a key rotation made anew (P-11, P-14) */
export const renewEmergency = async (
  api: Parameters<typeof renewGrants>[0] & EmergencyApi,
  session: Session,
  loaded: Loaded,
) => {
  const opened = session.opened();
  const list = opened ? await api.emergencyList(opened.token) : undefined;
  if (!opened || !list) return 0;
  const own = list.given.filter((g) => isSignedGrant(opened.keyBlock.ed.publicKey, g.grant));
  return renewGrants(api, opened, loaded.trust, own, loaded.vaults);
};

/**
 * The query of the page and the notice: the open account read with the options, so a load uses
 * the state the app shows; null while locked or for a list that did not load or check
 */
export const emergencyQuery = (api: EmergencyDeps, session: Session) => () => {
  const opened = session.opened();
  return {
    queryKey: queryKeys.emergency,
    queryFn: async () => {
      const loaded = opened ? await loadEmergency(api, opened, session.updateState) : undefined;
      return loaded?.ok ? loaded.value : null;
    },
  };
};
