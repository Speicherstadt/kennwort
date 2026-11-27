# Hinweise für Coding-Agenten

Kennwort: ein selbst gehosteter, Ende-zu-Ende-verschlüsselter Passwortmanager für Teams in kleinen Betrieben. Web-App
und PWA, Browser-Extension, Tauri-App für Android und iOS und eine CLI, alle an einem kleinen Server, der nur
Geheimtexte speichert. Teil der Speicherstadt, kennt aber keine andere App: Jede Verbindung läuft über einen offenen
Standard (OpenID Connect, SCIM, Deep Links).

Die Regeln stehen einmal, in [`docs/mitwirken.md`](docs/mitwirken.md) (Beitragen) und
[`docs/entwicklung.md`](docs/entwicklung.md) (Bauen), auf Deutsch, für Menschen und Agenten. Diese Datei sagt, wo was
steht und was nie passieren darf. Sie gilt für jeden Agenten; `CLAUDE.md` verweist nur hierher. Vor dem Start die
Abschnitte lesen, die die Änderung berühren.

## Wo was steht

| Was | Wo |
| --- | --- |
| Was als Nächstes gebaut wird, Kriterien, wie der Agenten-Loop arbeitet | `BAULISTE.md` |
| Warum: Ziele, Entscheidungen, Stack, Kryptografie, Bedrohungsmodell, Tests | `docs/plan.md` |
| Aussehen und Bedienung der Oberfläche | `DESIGN.md` |
| Protokolle und Formate (vor allem in `packages/crypto`, `packages/core` oder am Sync) | `docs/sicherheitsdesign.md` |
| Aufbau, Sprache, Code-Stil, Solid 2.0, Quellen | `docs/entwicklung.md` |
| Solid 2.0, vor jeder Arbeit an Solid-Code (zuerst `MIGRATION.md`) | `docs/solid-2.0/` |

Die Doku liegt in `docs/` (<https://kennwort.app/>), nur Deutsch. Links in README und Doku zeigen auf die Website,
nicht auf `docs/*.md`.

## Skills

Die Schritte für wiederkehrende Aufgaben stehen in [`.agents/skills`](.agents/skills); jeder Agent folgt denselben
Dateien. Aus der [Werkbank](https://github.com/Speicherstadt/werkbank) (gleich in allen Projekten, Änderungen dort):
`beitrag` (Branch, Commits, Pull Request als Entwurf, dann Selbstprüfung und Review), `beitrag-pruefen` (gewollt,
Quellen, einfachste Lösung, Regeln), `tdd-review` (unabhängiges Review, ein Befund braucht einen fehlschlagenden
Test), `doku-pruefen` (Review des Markdowns), `fork-pushen` (Push auf den Fork einer anderen Person),
`prs-abarbeiten` (alle offenen Pull Requests, vom einfachsten Merge an), `issue-schreiben`, `board-pflegen` (das
Board auf GitHub), `release`, `fehler-eingrenzen` (Ursache eines Fehlers über eine rote Prüfung finden) und
`vorhaben-klaeren` (einen Plan vor dem Bauen mit der Person durchfragen). Aus diesem Projekt: `checks` (alle
Prüfungen und die Ports für Tests); `solid-2.0`, `solid-2.0-cheatsheet` und `reactivity-diagnostics` (Kopien aus dem
Paket `solid-js`, ein Test hält sie gleich; nicht von Hand ändern).

## Der Agenten-Loop

Die Bauliste wird abgearbeitet, wie `BAULISTE.md` unter „So arbeitet der Loop“ beschreibt: ein Punkt je Pull
Request, Tests zuerst, bei grüner CI selbst mergen (Squash) und den Punkt im selben Pull Request abhaken. Was als
sicherheitsrelevant gilt und deshalb vorher ein unabhängiges `tdd-review` ohne offene Befunde braucht, steht dort.

## Nie

- Auf `main` pushen (Ausnahme: Reparatur eines roten `main` durch oder auf Anweisung des Maintainers), Commits von
  Beitragenden umschreiben, mergen (nur Maintainer oder Collaborator mit dessen Zustimmung; Ausnahme: der
  Agenten-Loop mergt seine Pull Requests nach `BAULISTE.md` selbst), Sicherheitsrelevantes ohne unabhängiges Review
  mergen, eigenen Code reviewen.
- Eine eigene kryptografische Primitive schreiben oder in `packages/crypto` etwas anderes als `@noble/*` nutzen; ein
  Format für Geheimtexte oder Schlüssel ohne neue Formatversion und neue Testvektoren ändern.
- Ein Geheimnis im Klartext, einen Schlüssel oder eine Passphrase an den Server, in ein Log, einen Fehlerbericht
  oder eine Analyse schicken; entsperrte Schlüssel anderswo halten als im Speicher (`chrome.storage.session` in der
  Extension).
- Automatisch ausfüllen ohne Aktion der Person, auf einem Host, der nicht genau passt, oder in einen Frame eines
  anderen Origins.
- Eine Abhängigkeit hinzufügen, ohne zuerst eigenen Code zu versuchen und den Grund je Paket unter
  „## Neue Abhängigkeiten“ im Pull Request zu nennen; ein Laufzeit-Paket zusätzlich mit Grund in
  `allowed-dependencies.json`. Der Client bleibt bei einer Handvoll Pakete.
- Einen Test oder ein Sicherheits-Gate überspringen, abschwächen oder löschen, um grün zu werden; einen
  übersprungenen Test als bestanden melden.
- Issues und Pull Requests ohne Auftrag anlegen oder kommentieren.
- Befehle als root (`sudo`, `pkexec`) ausführen oder umgehen; die führt die Nutzerin oder der Nutzer aus. Laufende
  Prozesse von ihnen stoppen; für Tests andere Ports nehmen (Skill `checks`).

## Bei jeder Änderung

Mitziehen, was die Änderung berührt, im selben Pull Request, und nur das: Tests (ein Bugfix beginnt mit einem
fehlschlagenden Test), Doku in `docs/`, README und Screenshots, wie `docs/mitwirken.md` es am Anfang beschreibt.

Dazu: jede berührte Datei sauberer hinterlassen, ohne das Verhalten zu ändern, und unter „Aufgeräumt“ nennen; Issues
mit `Umgesetzt #…` oder `Refs #…`, nie `Closes`/`Fixes`; Prüfungen grün vor jedem Push (Skill `checks`),
übersprungene nennen, danach die CI prüfen; vor jedem Push prüfen, ob der Pull Request des Branches noch offen ist
(gemergt: neu von `origin/main`, neuer Pull Request); die Beschreibung des Pull Requests wird die Squash-Nachricht und
wird bei jedem Push nachgezogen, der etwas daran ändert; vor dem Merge ein unabhängiges Review durch einen eigenen
Agenten (`tdd-review` für Code, `doku-pruefen` für Markdown), im Agenten-Loop nach `BAULISTE.md`.

## Arbeitsweise

- Code, Kommentare und Commits auf Englisch; Doku, README, Pull Requests und alles, was Nutzer lesen, auf Deutsch;
  die App auf Deutsch und Englisch über Paraglide (`docs/entwicklung.md`, Sprache).
- Funktional, keine Klassen; eine Datei über ~400 Zeilen und eine Funktion über ~80 werden geteilt; Technik und
  Code-Stil in `docs/entwicklung.md`, Konventionen.
- Solid 2.0 ist nicht 1.x: nicht raten, vor jeder Arbeit an Solid-Code `docs/solid-2.0/` (zuerst `MIGRATION.md`)
  und `docs/entwicklung.md`, Solid 2.0, lesen.
- Details auf die Quellen stützen, nicht auf das Gedächtnis (`docs/entwicklung.md`, Quellen); GitHub-Quellen flach
  in ein temporäres Verzeichnis klonen und die Quelle nennen, wo sie ein Detail entscheidet.
- Fremde, nicht committete Änderungen gehören jemand anderem (oft einem anderen Agenten): beim eigenen Umfang bleiben.
