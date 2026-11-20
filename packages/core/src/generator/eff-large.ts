/**
 * The EFF large word list for passphrases (K-306): 7776 words, 12.9 bits each. Source: the
 * Electronic Frontier Foundation, https://www.eff.org/dice (CC BY 3.0 US), taken from the
 * npm package eff-diceware-passphrase 3.0.0 and checked word for word against xkcdpass 1.30.0;
 * a test pins its digest. Kept as data in modules of their own (two halves by first letter, for
 * the size of a file), so the web app loads it only when a passphrase is made. Words are apart by
 * exactly one space or line break.
 */
import { WORDS as FIRST } from "./eff-large-a-l.ts";
import { WORDS as SECOND } from "./eff-large-m-z.ts";

export const effLargeWords: readonly string[] = `${FIRST.trim()} ${SECOND.trim()}`.split(/\s/);
