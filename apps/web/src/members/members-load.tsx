/**
 * What the members page shows besides the list (K-304, K-307): why the list is not shown, or a new
 * company root waiting for this person to compare its code (K-307 part f, P-07), and the company's
 * sections for policy, recovery and root, which change everyone's devices.
 */
import { m } from "@kennwort/ui";
import type { QueryClient } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { PolicySection } from "../policy/policy-section.tsx";
import { RecoverySection } from "../policy/recovery-section.tsx";
import { queryKeys } from "../queries.ts";
import type { Session } from "../session/session.ts";
import type { LoadError, loadMembers, MembersDeps } from "./members.ts";
import { RootChangeNotice, RootSection } from "./root-change.tsx";

const alertClass = "rounded-lg border border-danger px-3 py-2 text-[13px] text-danger";

export type Load = Awaited<ReturnType<typeof loadMembers>> | null | undefined;

const loadText = (error: LoadError) =>
  ({
    "root-mismatch": m.members_root_mismatch(),
    "root-fork": m.members_root_fork(),
    "root-retired": m.members_root_retired(),
    unreachable: m.members_load_failed(),
  })[error];

/** After the root changed: members, policy and recovery anew, under the new root */
export const refreshAfterRoot = (client: QueryClient) => () =>
  Promise.all(
    [queryKeys.members, queryKeys.policy, queryKeys.recovery].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );

/** Why the list is not shown, or a new company root waiting for this person (K-307 part f) */
export const LoadProblem = (props: {
  loaded: Load;
  session: Session;
  api: MembersDeps;
  onRoot: () => Promise<unknown>;
}) => {
  const error = (): LoadError | undefined => {
    const loaded = props.loaded;
    return loaded && !loaded.ok && loaded.error !== "root-change" ? loaded.error : undefined;
  };
  const pending = () => {
    const loaded = props.loaded;
    return loaded && !loaded.ok && loaded.error === "root-change" ? loaded.pending : undefined;
  };
  return (
    <>
      <Show when={error()}>
        {(shown) => (
          <p role="alert" class={alertClass}>
            {loadText(shown())}
          </p>
        )}
      </Show>
      <Show when={pending()}>
        {(shown) => (
          <RootChangeNotice
            session={props.session}
            api={props.api}
            pending={shown()}
            onConfirmed={props.onRoot}
          />
        )}
      </Show>
    </>
  );
};

/** Policy, company recovery and the company root: owners change them, everyone sees them */
export const CompanySections = (props: {
  session: Session;
  api: MembersDeps;
  canEdit: boolean;
  onRoot: () => Promise<unknown>;
}) => (
  <>
    <PolicySection session={props.session} api={props.api} canEdit={props.canEdit} />
    <RecoverySection session={props.session} api={props.api} canEdit={props.canEdit} />
    <RootSection
      session={props.session}
      api={props.api}
      canReplace={props.canEdit}
      onReplaced={props.onRoot}
    />
  </>
);
