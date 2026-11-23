/**
 * Prints the sequence the release of this commit gets (P-16, K-408), for the release workflow
 * (K-703): it passes the number as SOURCE_DATE_EPOCH to the build of the release files and to the
 * image, so both sign the same release.json. Fails outside a checkout with its history, where the
 * number would come from the clock.
 *
 *   bun apps/web/scripts/print-sequence.ts
 */
import { commitHistory } from "./commit-history.ts";
import { sequenceOf } from "./release-build.ts";

const { sequence, source } = sequenceOf(process.env, {
  history: commitHistory(),
  nowMs: Date.now(),
});
if (source === "clock") {
  console.error("no commit history: check out with fetch-depth 0");
  process.exit(1);
}
console.log(sequence);
