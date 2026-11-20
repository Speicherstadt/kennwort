<!--
Kopie für Kennwort – nicht bearbeiten, nur ersetzen.
Quelle: https://github.com/solidjs/solid, Ordner documentation/solid-2.0/ (alle Dateien, darin MIGRATION.md)
        und packages/solid/CHEATSHEET.md
Commit: 99db9bce45b94b07bb790f04bb3f0eff6844b562 (2026-11-19, „fix(signals): refresh() while its answer is out waits for it, then re-asks once (#5094) (#5101)“)
Lizenz: MIT, Copyright (c) 2016-2025 Ryan Carniato (siehe LICENSE im Solid-Repo)
Links wie ../../packages/… zeigen in das Solid-Repo, nicht in dieses. Der Ordner gehört nicht zur
Kennwort-Website (mkdocs.yml: exclude_docs). Aktualisieren: Repo klonen, Dateien ersetzen, Commit
oben eintragen; scripts/check-solid2.ts kennt die Regeln, die daraus folgen.
-->

> **Quelle:** [solidjs/solid](https://github.com/solidjs/solid/tree/99db9bce45b94b07bb790f04bb3f0eff6844b562/documentation/solid-2.0),
> Commit `99db9bce45b94b07bb790f04bb3f0eff6844b562` (2026-11-19), MIT-Lizenz. `CHEATSHEET.md` stammt aus
> `packages/solid/CHEATSHEET.md` desselben Commits. Unverändert übernommen.

# Solid 2.0 RFCs

The Solid 2.0 RFCs, frozen as the design record at the 2.0.0 release (2026-11-17). They explain why 2.0 is shaped the way it is; they are not kept current. **`MIGRATION.md`** is maintained and is the entry point for migrating apps; current behavior is documented at https://docs.solidjs.com.

**Overview:** [Solid 2.0 Proposed API Changes (HackMD)](https://hackmd.io/@0u1u3zEAQAO0iYWVAStEvw/SyXYy2swbg)

**Start here (migration guide):** [MIGRATION.md](MIGRATION.md)

**Quick API reference:** [`CHEATSHEET.md`](../../packages/solid/CHEATSHEET.md) (lives inside `packages/solid/` so it ships with the `solid-js` npm package).

The RFCs below are **deep dives** on specific topic areas. Over time, it’s expected that the most important bits will be folded into the main docs; these are intentionally detailed and “proposal-shaped”.

---

## RFC index (12)

| #   | RFC                                                                                    | One-line summary                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01  | [Reactivity, batching, and effects](01-reactivity-batching-effects.md)                 | ownedWrite, strict top-level reads, flush, split effects, lazy memos, unobserved, onSettled      |
| 02  | [Signals, derived primitives, ownership, and context](02-signals-derived-ownership.md) | Derived signal/store, createRoot dispose-by-parent, Context as Provider                          |
| 03  | [Control flow](03-control-flow.md)                                                     | For/Repeat/Reveal, Show/Switch, Loading, Errored, dynamic, clientOnly                            |
| 04  | [Stores](04-stores.md)                                                                 | draft-first setters, merge/omit, reconcile, projections (createProjection/createStore(fn)), deep |
| 05  | [Async data](05-async-data.md)                                                         | Async in computations, isPending, latest, Loading `on` prop, transitions, ssrSource/deferStream  |
| 06  | [Actions and optimistic](06-actions-optimistic.md)                                     | action (generator), createOptimistic / createOptimisticStore                                     |
| 07  | [DOM](07-dom.md)                                                                       | HTML standards, class, booleans                                                                  |
| 08  | [Dev-mode diagnostics](08-dev-diagnostics.md)                                          | Dev warnings/errors, diagnostic codes, attribution engine, responsiveness, programmatic API       |
| 09  | [TypeScript and JSX ownership](09-typescript-jsx.md)                                   | Renderer-owned JSX namespaces, `jsxImportSource`, and core renderable types                      |
| 10  | [Server functions](10-server-functions.md)                                             | `"use server"` runtime, response helpers, single-flight, GET/metadata/prepareRequest, validation |
| 11  | [Server components (experimental)](11-server-components.md)                           | Functions returned from server functions; `dynamic` is the API; single-copy frame streams        |
| 12  | [SSR and the HTTP exchange](12-ssr-http.md)                                            | Render entry points, streaming (`pipe`/`pipeTo`/`readable`), request event, httpStatus/httpHeader |
