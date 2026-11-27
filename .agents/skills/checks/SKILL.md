---
name: checks
description: "Prüfungen von Kennwort ausführen (Typen, Lint mit Solid-2-Regeln und Paketliste, Vitest, Server-Tests, Build, Playwright, Doku). Vor jedem Push, im Review und wenn Bun, ein Browser oder ein Werkzeug für die Tests fehlt."
---

# Prüfungen

Vor jedem Push grün, danach die CI prüfen. Voraussetzung: Bun in der Version aus `packageManager` in
`package.json`.

```sh
bun install --frozen-lockfile
bun run typecheck        # tsc -b über alle Workspaces
bun run lint             # Biome, Liste erlaubter Pakete, Dateigröße, Texte de/en, Solid-2-Regeln
bun run test             # Vitest, dann die Server-Tests (bun test in apps/server)
bun run build
```

`bun run check` führt diese vier nacheinander aus.

Playwright, wenn sich etwas ändert, das jemand bedient (Desktop und `@phone`, die Extension im echten Browser).
Die volle Suite läuft in der CI in drei Teilen; vor dem Push die berührten Specs:

```sh
bun run e2e e2e/<spec>.ts     # oder -g "<test>"; in der Sandbox CHROMIUM_PATH=/opt/pw-browsers/chromium
bun run e2e:engines           # Extension in Firefox und WebKit, wenn sich apps/extension ändert
```

Wenn sich `docs/` oder `mkdocs.yml` geändert haben (`pip install -r requirements-docs.txt`):

```sh
zensical build --strict
```

Nur in der CI, nicht in der Sandbox:

- `bunx checks` und `bunx checks pr` aus firsttris/workflows (Paket von GitHub, das die Sandbox nicht laden
  kann); `bun run lint` prüft die Dateigröße vorher selbst.
- `bun run reproducible --reuse`, `bun run --cwd apps/server smoke` und `bun audit` laufen dort nach dem Build,
  lokal nur bei Änderungen an Build, Release oder Server-Start.
- Mutation-Tests (`bun run mutation`, 100 % in `packages/crypto` und `packages/core`) jede Nacht in
  `.github/workflows/mutation.yml`; ein roter Lauf wird zuerst behoben.
- Android (`android.yml`) bei Änderungen in `apps/mobile`.

Was die Tests selbst überspringen: den Export nach KDBX in KeePassXC (`packages/core/src/export/kdbx.test.ts`),
wenn `keepassxc-cli` fehlt, etwa in der CI.

Die Regeln am Pull Request selbst (Titel, `Umgesetzt`/`Refs`, neue Abhängigkeiten, lange Funktionen) prüft vor
dem Push die Werkbank, siehe Skill `beitrag`.

## Ports

Laufende Prozesse der Person nicht stoppen; Tests nehmen eigene Ports. Belegt sind:

- Entwicklung: Server 18100, Vite 5175.
- E2E: der Server mit dem Build der Web-App auf 5176, Demo 5177, Leak-Check 28090, OIDC 28091; Engines 28110,
  5177 und 5178 (`e2e/*.ts`, `e2e/engines/serve.ts`).
- Server in Tests (`apps/server/src/testing/start-server.ts`): ab 28100; Integrationstests der CLI 28320, 28330,
  28331.

Ein neuer Test bekommt einen freien Port daneben. Was übersprungen wurde, gehört mit Grund in die Beschreibung des
Pull Requests, nie als bestanden.
