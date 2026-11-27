---
title: Entwicklung
description: >-
  Wie Kennwort gebaut wird: Aufbau des Monorepos, Sprache, Code-Stil, die Regeln für Solid 2.0 und die
  Quellen, auf die sich jedes Detail stützt.
---

# Entwicklung

Wie ein Beitrag entsteht, steht unter [Mitwirken](mitwirken.md), was als Nächstes gebaut wird in der
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md), warum es so gebaut ist im
[Projektplan](plan.md). Die Befehle für alle Prüfungen und die Ports für Tests stehen im Skill
[`checks`](https://github.com/Speicherstadt/kennwort/blob/main/.agents/skills/checks/SKILL.md).

## Aufbau

Ein Monorepo mit Bun-Workspaces; welches Paket was enthält, steht im
[README](https://github.com/Speicherstadt/kennwort#entwicklung). `packages/crypto` nutzt nur `@noble/*`, die
Extension baut mit Solid, Vite und `@crxjs/vite-plugin`.

Der Server ist absichtlich nicht vertrauenswürdig: Jede Änderung an einer Mitgliedschaft ist signiert, jeder
Geheimtext an Eintrag, Tresor und Version gebunden (AAD), und der Client prüft beides. Ein Testserver, der sich
absichtlich falsch verhält, spielt die Angriffe der ETH-Studie nach
([Sicherheitsdesign](sicherheitsdesign.md)).

Testdaten: die Firma „Weber Haustechnik“ mit Jonas, Anna, Sandra, Max, Tim und Lea.

## Konventionen

### Sprache

- Code, Kommentare und Commits auf Englisch; `README.md` und `docs/` nur auf Deutsch.
- Die App auf Deutsch und Englisch über Paraglide (`messages/de.json`, `messages/en.json`), für jeden Text
  jeder Oberfläche, auch in der Extension und der Mobile-App, denn alle teilen `packages/ui`. `_locales/`
  nur für das, was Browser und Stores lesen (Name, Beschreibung und Texte des Manifests der Extension).

### Technik

Die Technik folgt `tech-stack.md` in firsttris/workflows, mit vier Abweichungen, die der
[Projektplan](plan.md#stack) begründet: Solid 2 statt React auch für die Web-App, kein TanStack Start und kein
SSR, Tauri 3 statt Tauri 2 und Paraglide auch in der Extension. Tauri 3 kommt als letzte Phase, damit es dann
möglichst stabil ist; sonst die neueste Alpha oder 2.x. Der Loop baut nur Android, die iOS-App baut ein Mensch
auf einem Mac.

Die Oberfläche im Stil von shadcn ohne Komponenten-Bibliothek: natives `<dialog>`, die Popover-API,
CSS Anchor Positioning, eigene `cn()` und `variants()`, Tailwind 4, Geist und Zinc-Tokens; die Einzelheiten
stehen in [`DESIGN.md`](https://github.com/Speicherstadt/kennwort/blob/main/DESIGN.md).

### Code-Stil

- Clean Code, funktional geschrieben: klare Namen, kleine Funktionen, die eine Sache tun, Abhängigkeiten werden
  übergeben, keine Doppelungen und kein toter Code, Kommentare sagen warum. Die Ideen hinter SOLID und den
  Entwurfsmustern gern als Funktionen, Daten und Closures, nie als Klassen, Vererbung oder Klassenhierarchien.
- Reine Funktionen, die Daten nehmen und Daten zurückgeben, Seiteneffekte am Rand; Funktionskomponenten,
  keine Klassen; Fehler als Werte.
- Eine Datei tut eine Sache: über ~400 Zeilen wird sie geteilt, eine Funktion über ~80. Ein Refactor ändert
  kein Verhalten.

## Solid 2.0

Die Oberfläche ist Solid 2.0 (`solid-js` und `@solidjs/web` 2.x, stabil seit 11/2026). API und Verhalten
weichen stark von 1.x ab, und das meiste, was über Solid bekannt ist, gilt für 1.x: nicht raten.

- Vor jeder Arbeit an Solid-Code `docs/solid-2.0/` lesen, zuerst `MIGRATION.md`; die API steht in
  `docs/solid-2.0/CHEATSHEET.md`, der Entwurf jedes Bereichs in den nummerierten RFCs. Die Skills
  `solid-2.0`, `solid-2.0-cheatsheet` und `reactivity-diagnostics` tragen dasselbe aus dem Paket `solid-js`.
  Im Zweifel dort nachsehen.
- Nie aus 1.x: `createResource`; `classList`; `on(...)`; `createEffect` mit einer Funktion;
  `Suspense`/`ErrorBoundary`/`SuspenseList`, `resource.loading`/`refetch`/`mutate`,
  `startTransition`/`useTransition`; `batch`; `createComputed`; `onMount`; `mergeProps`/`splitProps`;
  `produce`, Pfad-Setter und `unwrap`; `createMutable`; `Index`; `Context.Provider`; `onError`/`catchError`;
  `use:`, `attr:`, `bool:`, `on:` und kleingeschriebenes `onclick`; `/*@once*/`; Importe aus `solid-js/web`
  oder `solid-js/store`; `onCleanup` in einem Ref-Callback.
- Stattdessen: ein asynchrones `createMemo` (oder `createStore(fn)`) unter `<Loading>`, `isPending`, `latest`,
  `refresh`; `class` mit Objekt oder Array; `createEffect(compute, apply)` mit Aufräumen als Rückgabe von
  apply; `action(...)` mit `createOptimistic`/`createOptimisticStore` für optimistische Änderungen; `flush()`
  nur, wo wirklich ein synchroner Punkt nötig ist; `onSettled`; `merge`/`omit`; Draft-Setter und `snapshot`;
  `<For keyed={false}>`; `<Ctx value>`; `<Errored>`; Ref-Fabriken; `untrack` für ein bewusst einmaliges
  Lesen; Importe aus `@solidjs/web` und `solid-js`.
- Verhalten, das kompiliert, aber noch in 1.x denkt:
    - Ein Setter ändert, was ein Lesen liefert, erst, wenn der Batch durchläuft (nächster Microtask oder
      `flush()`): den eigenen Schreibwert aus einer Variablen lesen, nicht aus dem Signal.
    - Ein reaktiver Wert, der im Rumpf einer Komponente, im apply eines Effekts oder in einem Ref-Callback
      gelesen wird, wird einmal gelesen und nie aktualisiert: in JSX, einem Memo oder der compute-Funktion des
      Effekts lesen.
    - Reaktiven Zustand im Rumpf einer Komponente, in einem Memo oder im compute eines Effekts zu schreiben,
      wirft im Dev-Build.
    - `createRoot` innerhalb eines Owners wird mit ihm entsorgt; Refs haben keinen Owner; Effekte brauchen
      einen.
    - Das zweite Argument von `createMemo` sind Optionen, kein Anfangswert; Memos sind lazy.
- Prüfungen: `bun run lint` führt `scripts/check-solid2.ts` aus (die Muster oben); die Tests der Oberfläche
  laufen auf dem Dev-Build von Solid und scheitern an jeder Diagnose von Solid wie `[STRICT_READ_UNTRACKED]`
  (`vitest.solid-diagnostics.ts`). Die Ursache beheben; der Skill `reactivity-diagnostics` ordnet jedem Code
  die Reparatur zu. Eine Diagnose nie mit `untrack` stummschalten, außer der Wert darf sich nie ändern.

## Quellen

Details stützen sich auf die Quellen, nicht auf das Gedächtnis. Flach (`git clone --depth 1`) in ein
temporäres Verzeichnis klonen und die Quelle in Kommentaren und Commit-Nachrichten nennen, wo sie ein Detail
entscheidet:

- **Kryptografie**: `paulmillr/noble-ciphers`, `noble-curves`, `noble-hashes`, `noble-post-quantum`; FIPS 203
  (ML-KEM), draft-connolly-cfrg-xwing-kem (X25519 + ML-KEM), RFC 9180 (HPKE), RFC 9106 (Argon2), RFC 5869
  (HKDF), RFC 8439 und draft-irtf-cfrg-xchacha (XChaCha20-Poly1305).
- **Passkeys**: WebAuthn Level 3 (PRF-Erweiterung), `MasterKale/SimpleWebAuthn`.
- **Bedrohungsmodell**: die Studie der ETH Zürich zu Passwortmanagern unter einem bösartigen Server (USENIX
  Security 2026); die Sicherheits-Whitepaper von Bitwarden, 1Password und Passbolt.
- **Extension**: die Doku zu Chrome Manifest V3 und zu den WebExtensions bei MDN;
  `crxjs/chrome-extension-tools`.
- **Import-Formate**: die Export-Doku der Anbieter; KDBX 4, wie `keepassxreboot/keepassxc` es liest; FIDO
  Credential Exchange (CXF/CXP).
- **Mobile**: `tauri-apps/tauri` (3.x), Androids `AutofillService`, Apples AutoFill Credential Provider.
