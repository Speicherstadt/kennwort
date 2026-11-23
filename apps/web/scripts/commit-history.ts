/**
 * The committer times of the first-parent history, oldest first, as `git log` writes them; undefined
 * outside a checkout. The release's sequence follows them (release-build.ts, sequenceOf), for
 * sign-release.ts and for the release workflow (print-sequence.ts).
 */
export const commitHistory = (): string | undefined => {
  try {
    const git = Bun.spawnSync(["git", "log", "--first-parent", "--reverse", "--format=%ct"], {
      stderr: "ignore",
    });
    return git.exitCode === 0 ? git.stdout.toString() : undefined;
  } catch {
    return undefined;
  }
};
