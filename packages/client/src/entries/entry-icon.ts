/** The icon of each kind of entry, the same in list and detail (K-306 part 2) */

import {
  Braces,
  CreditCard,
  type IconNode,
  IdCard,
  KeyRound,
  SquareTerminal,
  StickyNote,
  Wifi,
} from "@kennwort/ui/icons";
import type { EntryType } from "./entry-types.ts";

export const entryIcon: Record<EntryType, IconNode> = {
  login: KeyRound,
  note: StickyNote,
  wifi: Wifi,
  card: CreditCard,
  "ssh-key": SquareTerminal,
  "api-key": Braces,
  identity: IdCard,
};
