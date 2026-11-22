import {
  type AccountState,
  certificateFingerprint,
  type EmergencyGrant,
  type EmergencyPackages,
  emptyState,
  encodeBytes,
  entryHash,
  type ListedGrant,
  type Release,
  type Statement,
  sealRecord,
} from "@kennwort/core";
import {
  anna,
  bank,
  certificate,
  jonas,
  logEntries,
  max,
  type Person,
  root,
  sandra,
  vaultId,
  vaultKey,
} from "@kennwort/core/testing";
import { rootFingerprint, wrapVaultKey } from "@kennwort/crypto";
import { expect } from "vitest";
import type { Opened } from "../session/open-account.ts";
import type { RecoveryApi } from "../session/recovery-api.ts";
import type { Vault } from "../vaults/vaults.ts";
import { type EmergencyDeps, grantAccess, loadEmergency } from "./emergency.ts";

// For the emergency access tests (K-307 part d, P-14): Jonas names Sandra for emergency access to
// Büro; the server in memory serves what the test tells it, lies included
export const NOW = 1_800_000_200;
export const DAY = 86_400;
export const ring = { vaultId, epoch: 0, vaultKey };
export const accountKeyOf = (p: Person) => new Uint8Array(32).fill(p.id[0] ?? 0);
export const blockOf = (p: Person) => ({
  xwing: p.xwing,
  ed: p.ed,
  rootFingerprint: rootFingerprint(root.publicKey),
});
export const openedAs = (
  p: Person,
  state: AccountState = emptyState(rootFingerprint(root.publicKey)),
) => ({
  accountKey: accountKeyOf(p),
  keyBlock: blockOf(p),
  state,
  accountId: p.id,
  token: `token-${encodeBytes(p.id)}`,
});
const record = sealRecord(
  { id: jonas.id, edSecretKey: jonas.ed.secretKey },
  ring,
  new Uint8Array(16).fill(0xe1),
  1,
  bank,
  entryHash(logEntries[2] as (typeof logEntries)[number]),
);
const names = new Map(
  [jonas, anna, max, sandra].map((p, i) => [p, ["Jonas", "Anna", "Max", "Sandra"][i]]),
);
const people = [...names.keys()].map((p) => ({
  id: p.id,
  role: "member" as const,
  name: names.get(p) ?? null,
  xwingPublicKey: p.xwing.publicKey,
  edPublicKey: p.ed.publicKey,
  certificate: certificate(p),
  invitation: null,
}));

type Served = {
  grants: { grant: EmergencyGrant; packages: EmergencyPackages }[];
  listed: ListedGrant[];
  revocations: Statement[];
  release?: Release | "waiting";
  audits: string[];
  sent: Statement[];
};

export const server = () => {
  const served: Served = { grants: [], listed: [], revocations: [], audits: [], sent: [] };
  const api = {
    company: async () => ({
      id: "weber",
      rootPublicKey: root.publicKey,
      policy: null,
      recoveryPublicKey: null,
    }),
    members: async () => people,
    emergencyList: async (token: string) => ({
      given: served.listed.filter((l) => token.endsWith(encodeBytes(l.grant.grantor))),
      received: served.listed.filter((l) => token.endsWith(encodeBytes(l.grant.grantee))),
      revocations: served.revocations,
    }),
    saveGrant: async (_token: string, grant: EmergencyGrant, packages: EmergencyPackages) => {
      served.grants.push({ grant, packages });
      return "ok" as const;
    },
    revokeGrant: async (_t: string, s: Statement) => Boolean(served.sent.push(s)),
    requestEmergency: async (_t: string, s: Statement) => Boolean(served.sent.push(s)),
    objectEmergency: async (_t: string, s: Statement) => Boolean(served.sent.push(s)),
    approveEmergency: async (_t: string, s: Statement) => Boolean(served.sent.push(s)),
    emergencyRelease: async () =>
      served.release && served.release !== "waiting"
        ? { ok: true as const, value: served.release }
        : { ok: false as const, error: "waiting" as const },
    emergencyVaults: async () => [
      {
        id: vaultId,
        name: null,
        nameEpoch: null,
        log: logEntries,
        keys: [
          {
            epoch: 0,
            wrapped: wrapVaultKey(
              { publicKey: jonas.xwing.publicKey, fingerprint: fp(jonas) },
              jonas.id,
              vaultKey,
              ring,
            ),
          },
        ],
        records: [record],
      },
    ],
    auditAction: async (_t: string, action: string, subject: string) =>
      Boolean(served.audits.push(`${action} ${subject}`)),
    keys: async () => undefined,
    writeState: async () => ({ ok: true as const }),
  } as unknown as EmergencyDeps & RecoveryApi;
  return { served, api };
};

const fp = (p: Person) => certificateFingerprint(certificate(p));

/** An open account whose state changes stay in memory, as the session's would */
export const sessionOf = (opened: Opened) => {
  let current = opened;
  return {
    opened: () => current,
    updateState: async (_api: unknown, change: (s: AccountState) => AccountState | undefined) => {
      const next = change(current.state);
      if (next) current = { ...current, state: next };
      return { ok: true as const, value: current.state };
    },
  };
};

export const load = (api: EmergencyDeps, session: ReturnType<typeof sessionOf>) =>
  loadEmergency(api, session.opened(), session.updateState as never);

export const listedOf = (made: { grant: EmergencyGrant }, changes: Partial<ListedGrant> = {}) => ({
  grant: made.grant,
  request: null,
  objection: null,
  approval: null,
  releaseAt: null,
  ...changes,
});

export const jonasGrants = async (
  s: ReturnType<typeof server>,
  scope: "view" | "full" = "view",
) => {
  const jonasSession = sessionOf(openedAs(jonas));
  const loaded = await load(s.api, jonasSession);
  if (!loaded.ok) throw new Error(loaded.error);
  const vault = { ring } as unknown as Vault;
  const terms =
    scope === "view"
      ? { scope, vaults: [vault], waitSeconds: 7 * DAY }
      : { scope, waitSeconds: 7 * DAY };
  expect(
    await grantAccess(s.api, jonasSession.opened(), loaded.value.trust, sandra.id, terms),
  ).toBe("ok");
  const made = s.served.grants.at(-1);
  if (!made) throw new Error("no grant stored");
  return made;
};
