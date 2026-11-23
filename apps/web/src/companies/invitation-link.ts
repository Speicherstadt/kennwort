/**
 * An invitation link pasted on „Firmen“ (K-605): /invite/<id>#token=…&s=…&root=… as the inviting
 * admin's app makes it (P-08). It is read on this device only; what goes to the server is what an
 * invitee always sends, never the secret or the fragment.
 */

import { readInvitation } from "../account/invite-page.tsx";
import type { Invitation } from "../session/companies.ts";

export const parseInvitationLink = (text: string): Invitation | undefined => {
  const url = URL.parse(text.trim());
  const id = url?.pathname.match(/^\/invite\/([A-Za-z0-9_-]{22})$/)?.[1];
  const fragment = url && id ? readInvitation(url.hash) : undefined;
  return id && fragment ? { id, ...fragment } : undefined;
};
