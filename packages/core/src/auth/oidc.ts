/**
 * What the server says about sign-in with OpenID Connect (K-604, docs/sicherheitsdesign.md P-25).
 * A ticket for a known account names it and carries no session; one for an enrolment carries the
 * company's root key, which the new device pins on first use and checks by comparing codes (P-07).
 * Nothing here is a key of a vault or of an account: the identity provider never sees one.
 */
import { z } from "zod";
import { bytes } from "../sync/bytes.ts";

/** The provider's name, for the button "Mit <name> anmelden" */
export const OidcProviderWire = z.object({ name: z.string().min(1).max(40) });

export const OidcTicketWire = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), accountId: bytes(16) }),
  z.object({
    kind: z.literal("enrol"),
    name: z.string().max(200).nullable(),
    rootPublicKey: bytes(32),
  }),
]);
export type OidcTicket = z.infer<typeof OidcTicketWire>;

const MappedGroup = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  viaIdp: z.number().int().nonnegative(),
});

/** This account's link; for owners and admins the enrolment, its address and the group mapping */
export const OidcStatusWire = z.object({
  name: z.string().min(1),
  linked: z.boolean(),
  enrolment: z.boolean().optional(),
  enrolmentUrl: z.url({ protocol: /^https?$/ }).optional(),
  groupsClaim: z.string().min(1).optional(),
  groups: z.array(MappedGroup).optional(),
});
export type OidcStatus = z.infer<typeof OidcStatusWire>;

/** Where a signed-in account goes to link itself: the provider's authorization address */
export const OidcLinkWire = z.object({ url: z.url({ protocol: /^https?$/ }) });
