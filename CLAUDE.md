# Notes for Claude

Kennwort: a self-hosted, end-to-end encrypted password manager for teams in small businesses. A web
app and PWA, a browser extension, a Tauri app for Android and iOS and a CLI, all talking to one small
server that only ever stores ciphertext. Part of the Speicherstadt suite, but it knows no other app:
every connection goes through an open standard (OpenID Connect, SCIM, deep links).

## Where to look

| What | Where |
| --- | --- |
| What to build next, acceptance criteria, how the loop works | `BAULISTE.md` |
| Why: goals, decisions, stack, cryptography, threat model, tests | `docs/plan.md` |
| Look and behaviour of the UI | `DESIGN.md` |
| Protocols and formats (before anything in `packages/crypto`, `packages/core` or the sync) | `docs/sicherheitsdesign.md` |
| Solid 2.0, before any work on Solid code (`MIGRATION.md` first) | `docs/solid-2.0/` |

The documentation is in `docs/` (<https://kennwort.app/>), German only. Links in the README and the
docs point to the site, not to `docs/*.md`.

## The agent loop

Work through `BAULISTE.md` as it describes: the first open item whose dependencies are done, one
item per pull request, tests first, then **merge it yourself** (squash) once CI is green, and tick
the item in the same pull request. A pull request that touches security-relevant code first gets an
independent review by a separate subagent (`tdd-review`) and merges only when it has no findings
left; everything else merges on green CI without it, so the loop keeps moving. Security-relevant
means: `packages/crypto`; the sync, membership log, sharing and signatures in `packages/core`;
sign-in, sessions, access checks and the misbehaving test server in `apps/server`; unlocking,
keys, passphrases, recovery and device pairing in any client, links that carry a secret in the
fragment included; autofill and the extension's content scripts and storage; the signed update
of the service worker; the CSP and the dependency allowlist. Never wait for a person: `packages/crypto` merges like the rest,
behind test vectors and property tests in CI and mutation tests at 100 % nightly
(`.github/workflows/mutation.yml`, CI stays under five minutes); a red nightly run is fixed first; an item that fails three
times goes under "Zurückgestellt" with the reason and the loop goes on with the next independent
one. Steps only a person can do (signing keys, stores, the iOS app) are not on the loop's path;
build with test keys.

## Reference implementations

Base details on the sources, not on memory. Clone them shallowly (`git clone --depth 1`) into the
scratchpad and name the source in comments and commit messages where it settles a detail:

- **Cryptography**: `paulmillr/noble-ciphers`, `noble-curves`, `noble-hashes`, `noble-post-quantum`;
  FIPS 203 (ML-KEM), draft-connolly-cfrg-xwing-kem (X25519 + ML-KEM), RFC 9180 (HPKE), RFC 9106
  (Argon2), RFC 5869 (HKDF), RFC 8439 and draft-irtf-cfrg-xchacha (XChaCha20-Poly1305).
- **Passkeys**: WebAuthn Level 3 (PRF extension), `MasterKale/SimpleWebAuthn`.
- **Threat model**: the ETH Zürich study of password managers under a malicious server (USENIX
  Security 2026); the security white papers of Bitwarden, 1Password and Passbolt.
- **Extension**: Chrome Manifest V3 and MDN WebExtensions docs; `crxjs/chrome-extension-tools`.
- **Import formats**: the vendors' export docs; KDBX 4 as read by `keepassxreboot/keepassxc`; FIDO
  Credential Exchange (CXF/CXP).
- **Mobile**: `tauri-apps/tauri` (3.x), Android `AutofillService`, Apple AutoFill Credential
  Provider.

## Never

- Write an own cryptographic primitive or use anything but `@noble/*` in `packages/crypto`; change a
  ciphertext or key format without a new format version and new test vectors.
- Send a plaintext secret, a key or a passphrase to the server, into a log, an error report or
  analytics; keep unlocked keys anywhere but in memory (`chrome.storage.session` in the extension).
- Autofill without a user action, on a host that does not match exactly, or into a cross-origin
  frame.
- Add a runtime dependency without adding it to the allowlist with the reason; the client should
  stay at a handful of packages.
- Skip, weaken or delete a test or a security gate to get green; report a skipped test as passed.
- Push to `main`, merge security-relevant code ("The agent loop") without the independent review,
  create or comment on issues and pull
  requests without being asked.
- Stop the user's processes or work around `sudo`.

## With every change

Update what the change affects, in the same pull request, and only that:

- the tests for what changed: Vitest next to the code, Playwright for what a user does (desktop and
  `@phone`, the extension loaded in a real browser), test vectors for anything in `packages/crypto`;
  a bug fix starts with a failing test;
- the docs in `docs/` that describe it (German only);
- `README.md` (German only) when a feature a user sees is added, changed or removed;
- the screenshots after a change to the look: **Actions → Update screenshots → Run workflow**, then
  look at the new pictures.

## Checks

Green before every push, then check CI:

```sh
bun run typecheck && bun run lint && bun run test && bun run build
bun run e2e                # Playwright desktop and @phone; CHROMIUM_PATH=/opt/pw-browsers/chromium in the sandbox
zensical build --strict    # when docs/ or mkdocs.yml changed
```

## Pull requests

- One feature per pull request; it carries only its own commits.
- Before every push check whether the branch's pull request is still open. If it is merged, start
  again from the current `origin/main` and open a **new** pull request.
- An independent review by a separate subagent (`tdd-review`) before merging security-relevant code
  ("The agent loop"); other pull requests merge on green CI.
- Merge method: squash.

## Working rules

- Commands as root (`sudo`, `pkexec`) are run by the user; don't work around that.
- The user's running processes are not stopped; use other ports for tests (dev: server 18100,
  Vite 5175; e2e: the server with the web build on 5176, engines 28110/5177/5178).
- Language: code, comments and commits in English; `README.md` and the docs in German only; the app
  in German and English through Paraglide (`messages/de.json`, `messages/en.json`) for every text
  of every interface, the extension and the mobile app included, as they share `packages/ui`;
  `_locales/` only for what browsers and stores read (the extension's name, description and
  manifest texts).

## Code style

Technology choices follow `tech-stack.md` in firsttris/workflows, with four deviations:

- **Solid 2 instead of React** for the web app too: one UI package (`packages/ui`) for the web app
  and the extension, and a smaller bundle to audit.
- **No TanStack Start or SSR**: only a static build with hashed file names can be signed and checked
  by the service worker before an update goes live.
- **Tauri 3 instead of Tauri 2** for the mobile app, built as the very last phase so Tauri 3 is as
  stable as possible by then; fall back to the newest alpha or 2.x. The loop builds Android only;
  the iOS app is built by a person on a Mac.
- **Paraglide in the extension too** instead of `_locales/` with `chrome.i18n`: the extension shares
  `packages/ui` with the web app, so it shares the texts; `_locales/` keeps only the store texts.

UI in the shadcn style without a component library: native `<dialog>`, the Popover API, CSS anchor
positioning, own `cn()` and `variants()`, Tailwind 4, `lucide-solid`, Geist, zinc tokens.

Clean Code, written functionally: clear names, small functions that do one thing, dependencies
passed in, no duplication or dead code, comments that say why; the ideas behind SOLID and the design
patterns are welcome as functions, data and closures, but not as classes, inheritance or class
hierarchies.

Functional, not object-oriented: pure functions that take data and return data, side effects at the
edges; function components, no classes; errors as values. A file does one thing: split it past ~400
lines, a function past ~80. A refactor changes no behaviour.

## Solid 2.0

The UI is Solid 2.0 (`solid-js` and `@solidjs/web` 2.x, stable since 11/2026). Its API and
behaviour differ a lot from 1.x, and most of what you know about Solid is 1.x: do not guess.

- Before any work on Solid code read `docs/solid-2.0/`, `MIGRATION.md` first; the API reference is
  `docs/solid-2.0/CHEATSHEET.md`, the design of each area the numbered RFCs. The skills in
  `.claude/skills/` (`solid-2.0`, `solid-2.0-cheatsheet`, `reactivity-diagnostics`) carry the same
  from the `solid-js` package. When unsure, look it up there.
- Never 1.x: `createResource`; `classList`; `on(...)`; `createEffect` with one function;
  `Suspense`/`ErrorBoundary`/`SuspenseList`, `resource.loading`/`refetch`/`mutate`,
  `startTransition`/`useTransition`; `batch`; `createComputed`; `onMount`; `mergeProps`/
  `splitProps`; `produce`, path setters and `unwrap`; `createMutable`; `Index`; `Context.Provider`;
  `onError`/`catchError`; `use:`, `attr:`, `bool:`, `on:` and lowercase `onclick`; `/*@once*/`;
  imports from `solid-js/web` or `solid-js/store`; `onCleanup` inside a ref callback.
- Instead: an async `createMemo` (or `createStore(fn)`) under `<Loading>`, `isPending`, `latest`,
  `refresh`; `class` with an object or array; `createEffect(compute, apply)` with cleanup returned
  from apply; `action(...)` with `createOptimistic`/`createOptimisticStore` for optimistic
  updates; `flush()` only where a synchronous point is really needed; `onSettled`; `merge`/`omit`;
  draft setters and `snapshot`; `<For keyed={false}>`; `<Ctx value>`; `<Errored>`; `ref`
  factories; `untrack` for a deliberate one-time read; `@solidjs/web` and `solid-js` imports.
- Behaviour that compiles but still thinks in 1.x:
  - a setter does not change what a read returns until the batch flushes (next microtask or
    `flush()`): read your own write from a plain variable, not from the signal;
  - a reactive value read in a component body, an effect's apply or a ref callback is read once
    and never updates: read it in JSX, a memo or the effect's compute function;
  - writing reactive state inside a component body, memo or effect's compute throws in dev;
  - `createRoot` inside an owner is disposed with it; refs are unowned; effects need an owner;
  - `createMemo`'s second argument is options, not an initial value; memos are lazy.
- Checks: `bun run lint` runs `scripts/check-solid2.ts` (the patterns above); the interface tests
  run on Solid's dev build and fail on any Solid diagnostic such as `[STRICT_READ_UNTRACKED]`
  (`vitest.solid-diagnostics.ts`). Fix the cause; the `reactivity-diagnostics` skill maps every
  code to its repair. Never silence a diagnostic with `untrack` unless the value must never update.

## Project specifics

- Monorepo with Bun workspaces: `packages/crypto` (only `@noble/*`), `packages/core` (Zod schemas,
  sync, membership log, import parsers), `packages/ui`, `apps/server` (Bun, Hono, Drizzle on
  SQLite, Better Auth), `apps/web`, `apps/extension` (Solid, Vite, `@crxjs/vite-plugin`, MV3),
  `apps/mobile` (Tauri 3), `apps/cli`.
- The server is untrusted by design: every membership change is signed, every ciphertext is bound to
  its entry, vault and version (AAD), and the client checks both. A test server that misbehaves on
  purpose replays the attacks of the ETH study.
- Test data: the company "Weber Haustechnik" with Jonas, Anna, Sandra and Max, as in Kontext.
- Screen sizes: desktop from `md` (768 px) with list and pane, sidebar from `lg`; phones get one
  screen at a time and the tab bar; the extension popup is 360 × 600.
