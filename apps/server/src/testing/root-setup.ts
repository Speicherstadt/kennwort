// Weber Haustechnik for the root change tests (K-307 part f): Jonas, owner, and Anna, member, as in
// recovery-setup.ts; helpers to read company and members and to replace the root as Jonas's client
// does it with packages/core
import {
  CompanyWire,
  checkMembers,
  MembersWire,
  type RootRotation,
  rootRotationToWire,
  rotateRoot,
  standardPolicy,
} from "@kennwort/core";
import type { WeberWithAnna } from "./recovery-setup.ts";

export const companyOf = async (w: WeberWithAnna, token = w.o.token) =>
  CompanyWire.parse(await (await w.o.setup.request("/api/company", { token })).json());

export const membersOf = async (w: WeberWithAnna, token = w.o.token) =>
  MembersWire.parse(await (await w.o.setup.request("/api/members", { token })).json()).members;

export const seconds = () => Math.floor(Date.now() / 1000);

/** Jonas's client replaces the root held by `root`: every certified member still in, the policy */
export const rotationOf = async (w: WeberWithAnna, root = w.root): Promise<RootRotation> => {
  const company = await companyOf(w);
  const views = checkMembers(company.rootPublicKey as Uint8Array, await membersOf(w));
  const { signature: _, ...policy } = company.policy ?? {
    ...standardPolicy(w.o.company.companyId),
    signature: new Uint8Array(),
  };
  return rotateRoot({
    rootSecretKey: root,
    companyId: w.o.company.companyId,
    views,
    policy,
    now: seconds(),
    seen: {},
  });
};

export const sendRotation = async (
  w: WeberWithAnna,
  rotation: Omit<RootRotation, "rootSecretKey">,
  token = w.o.token,
) =>
  (
    await w.o.setup.request("/api/company/root", {
      method: "PUT",
      token,
      body: rootRotationToWire(rotation),
    })
  ).status;
