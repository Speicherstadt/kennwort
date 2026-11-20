---
title: Projektplan
description: >-
  Der Plan für Kennwort: Ziel, Entscheidungen, Stack, Kryptografie, Bedrohungsmodell, Bauplan im
  Agenten-Loop, Tests und Funktionsumfang 1.0.
---

# Projektplan

Ein selbst gehosteter Passwortmanager für Teams in kleinen Betrieben: Web-App und Browser-Extension,
Ende-zu-Ende-verschlüsselt, post-quanten-hybrid, sicher auch gegen einen gehackten Server. Passt in
die Speicherstadt-Suite, kennt aber keine andere App: Anmeldung über OpenID Connect, ohne
Pro-Version. Was im Einzelnen gebaut wird und in welcher Reihenfolge, steht in der
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md).

## Ziel und Positionierung

Kennwort (kennwort.app) wird der Passwortmanager der Speicherstadt-Suite: für Betriebe mit 3 bis 50
Mitarbeitern, die gemeinsame Zugänge (Banking, Lieferantenportale, WLAN, Kundengeräte) heute in
Excel, auf Zetteln oder in einem Abo-Tool verwalten.

Was Kennwort anders macht als Passbolt und Bitwarden:

- **Server darf bösartig sein**: signiertes Mitgliedschafts-Log und signierte Schlüssel; die 27
  Angriffe der ETH-Studie (2026) werden als Regressionstests nachgebaut.
- **Post-quanten-hybrid** (X25519 + ML-KEM-768) von Anfang an.
- **Entsperren mit Passkey** (WebAuthn PRF), Passphrase nur als Notweg.
- **Eine Anmeldung über OpenID Connect**: in der Suite über Kontext oder Stalwart, sonst jeder
  Anbieter (Keycloak, Authentik, Entra ID); Gruppen kommen aus dem groups-Claim, wer geht, verliert
  den Zugriff.
- **Alles frei**: SSO, Gruppen, Audit-Log ohne Pro-Version (AGPL).
- **Ein Container, Bun + SQLite**, wenige Abhängigkeiten (Client: etwa 6 Laufzeitpakete).

Nicht das Ziel: Konkurrenz zu Bitwarden für Privatleute oder Großunternehmen (LDAP/SCIM erst
später).

## Entscheidungen

| Frage | Entscheidung | Warum |
| --- | --- | --- |
| Firmen-Recovery | Standard für Firmen, pro Firma abschaltbar: Der Inhaber hält einen Notfallschlüssel und kann den Zugang eines Mitarbeiters wiederherstellen | Für einen kleinen Betrieb ist „alles weg“ schlimmer als „der Chef kommt im Notfall ran“; geteilte Tresore haben ohnehin mehrere Mitglieder |
| Betrieb | Selbst gehostet, aber von Anfang an mandantenfähig, sodass ein IT-Dienstleister viele Firmen auf einem Server betreiben kann | passt zu „mehrere Firmen“; da der Server nichts lesen kann, ist auch gehosteter Betrieb unbedenklich |
| Einrichtungs-Code | Der Code des Betreibers legt jede neue Firma an, nicht nur die erste; eine bestehende Firma öffnet er nie | passt zum mandantenfähigen Betrieb: Ein IT-Dienstleister legt viele Firmen an, ohne den Server neu zu starten; in eine Firma kommt man weiter nur mit Einladung |
| Secret Key auf dem Gerät | Die Web-App merkt sich Konto-ID und Secret Key im `localStorage`, nie Passphrase oder AK | wie bei 1Password: Zum Entsperren reicht die Passphrase, und ein Server, der Passphrasen errät, muss trotzdem den Secret Key raten |
| Neues Gerät | Der QR-Code trägt Kopplungs-ID, Fingerabdruck des Einmal-Schlüssels und ein Kopplungs-Geheimnis, nicht den Schlüssel; das Paket ist an das Geheimnis gebunden und enthält auch den Secret Key | Ein X-Wing-Schlüssel hat 1216 Byte, der QR-Code bliebe kaum lesbar, und der Fingerabdruck bindet ihn genauso; das Geheimnis sieht der Server nie, so kann er kein eigenes Paket unterschieben (Review von K-303); ohne Secret Key könnte das neue Gerät nach dem Sperren nicht mit der Passphrase entsperren |
| Icons | `lucide` (die Icon-Daten ohne Framework) mit einer eigenen Icon-Komponente in `packages/ui` statt `lucide-solid` | `lucide-solid` baut auf Solid 1 (`splitProps`, `solid-js/web`) und läuft mit Solid 2 nicht; die Daten sind dieselben, und eine Abhängigkeit weniger läuft im Client |
| Lizenz | AGPL-3.0 mit Namensnennung nach § 7(b) und kommerzieller Lizenz wie bei haben, dazu ein kurzes CLA für Beitragende | erlaubt die iPhone-App im App Store und die kommerzielle Lizenz trotz Beiträgen von außen |
| Merge | Der Agenten-Loop merged alles selbst, wenn CI grün ist und das unabhängige Review keine Befunde mehr hat; er wartet nie auf einen Menschen | der Loop soll ohne Warten durchlaufen |
| Geräte und Sitzungen | Jedes Gerät schickt eine zufällige Geräte-ID und einen Namen aus dem Browser mit; der Server hält pro Gerät und Konto genau eine Sitzung, die Geräteliste zeigt diese Sitzungen | Better Auth kennt nur Sitzungen; ohne Geräte-ID würde jede Anmeldung eine neue Zeile in der Liste, und „Gerät abmelden“ träfe nur eine von mehreren Sitzungen desselben Geräts |
| Einladungsgeheimnis | Der Client des Einladenden hinterlegt das Einladungsgeheimnis versiegelt unter seinem eigenen AK auf dem Server; eine Einladung macht immer einen Mitarbeiter, eine höhere Rolle vergibt ein Inhaber eigens | So prüft der Einladende die Antwort auch Tage später und auf jedem seiner Geräte, ohne dass der Server das Geheimnis kennt; und kein Server kann einen Eingeladenen als Inhaber zertifizieren lassen |
| Namen der Mitglieder | Der Einladende tippt einen Namen ein; der Server speichert ihn an der Einladung und zeigt ihn in der Mitgliederliste | Konten haben sonst keine Namen, bis OIDC oder SCIM sie liefern; der Name ist nur eine Beschriftung, Vertrauen kommt allein aus dem Zertifikat |
| Wurzelschlüssel für Admins | Inhaber und Admins halten den privaten Wurzelschlüssel, verpackt an ihr Bündel; nur Inhaber vergeben Rollen, nie die eigene | Admins laden ein und müssen dafür zertifizieren können (P-08); ein Inhaber, der sich nicht selbst herabstufen kann, hält die Firma immer mit mindestens einem Inhaber |
| Firmen-Richtlinie | Eine vom Wurzelschlüssel signierte Richtlinie mit Version (F-07); Clients merken sich die höchste Version und nehmen keine ältere | So kann der Server weder die Sperrzeit noch später die Firmen-Recovery heimlich ändern oder zurückdrehen |
| Gruppen nach den Anfragen | Zugriff anfragen kommt vor den Gruppen (K-305); eine Gruppe erzeugt beim Eintritt eines Mitglieds nur Anfragen an die Verwalter ihrer Tresore | Bei Ende-zu-Ende-Verschlüsselung gibt nur ein Verwalter-Client Zugriff; Gruppen bauen darum auf den Anfragen auf, nicht umgekehrt |
| Persönlicher Tresor | Jedes Konto bekommt beim ersten Öffnen einen Tresor „Persönlich“, dessen ID aus dem AK abgeleitet ist | Ein Ort für eigene Zugänge ohne Zutun; dieselbe ID auf allen Geräten verhindert doppelte Tresore |

## Stack

Der Stack folgt `tech-stack.md` aus firsttris/workflows; vier Abweichungen sind begründet und
stehen im CLAUDE.md.

| Teil | Wahl | Begründung |
| --- | --- | --- |
| Monorepo | Bun Workspaces, Biome, TypeScript strict, Vitest, Playwright | wie überall |
| Server | Bun + Hono + Drizzle + SQLite + Zod, `bun build --compile`, Docker-Image amd64/arm64 | eigene API für Extension, Web-App und CLI |
| Auth | Better Auth: Passkeys und ein allgemeiner OIDC-Client (in der Suite Kontext oder Stalwart) | nur Login und Sync, nie zum Entschlüsseln |
| Extension | Solid 2 + Vite + `@crxjs/vite-plugin`, Manifest V3, Chrome/Edge/Firefox | Stack-Vorgabe für Extensions |
| Texte | Paraglide JS (de/en) für alle Oberflächen, auch Extension und Mobile-App; `_locales` nur für Name, Beschreibung und Manifest der Extension | **Abweichung**: Web-App und Extension teilen `packages/ui`, also auch die Texte |
| Web-App | Solid 2, statische SPA/PWA | **Abweichung von React**: ein UI-Paket für Web-App und Extension, kleineres Bundle zum Auditieren |
| Kein TanStack Start / SSR | statischer Build mit Hashes im Dateinamen | **Abweichung**: nur ein statischer Build lässt sich signieren und im Service Worker prüfen |
| Routing, Server-Daten | `@tanstack/solid-router` und `solid-query`, wenn sie Solid 2 tragen; sonst eigener kleiner Router und Solids Async | lokaler entschlüsselter Zustand ist die Quelle, nicht der Server-Cache |
| UI | shadcn-Stil **ohne Abhängigkeiten**: `<dialog>`, Popover-API, CSS Anchor Positioning, eigene `cn()` und `variants()`, Tailwind 4, lucide-Icons (`lucide` statt `lucide-solid`, siehe Entscheidungen), Geist, Zinc-Tokens (siehe DESIGN.md) | jedes Laufzeitpaket läuft dort, wo Klartext liegt |
| Krypto | `@noble/ciphers`, `@noble/curves`, `@noble/hashes`, `@noble/post-quantum` | auditiert, reines TS, ohne eigene Abhängigkeiten |
| Sonstiges | `tldts` (Public Suffix List), `zod` | |
| Mobile-App | Tauri 3 mit der Solid-UI aus `packages/ui`; native Autofill-Plugins: Android `AutofillService` (Kotlin), iOS AutoFill Credential Provider (Swift) | **Abweichung von Tauri 2**: Tauri 3 ist zur Zeit der Mobile-Phase voraussichtlich stabil; als letzte Phase gebaut, Rückfall auf 2.x |

Abhängigkeiten exakt gepinnt, Renovate mit Wartezeit, `bun install --frozen-lockfile`, keine
Install-Skripte außer `trustedDependencies`.

## Kryptografie

Bewährte, standardisierte Bausteine, modern zusammengesetzt; keine eigenen Algorithmen oder
Protokoll-Erfindungen.

| Zweck | Verfahren | Status |
| --- | --- | --- |
| Symmetrisch | XChaCha20-Poly1305 (AEAD), 256 Bit | bewährt (libsodium) |
| Schlüssel verpacken | X25519 + ML-KEM-768 hybrid | ML-KEM = NIST FIPS 203 (2024), in TLS, Signal, iMessage |
| Signaturen | Ed25519 (ML-DSA später nachrüstbar) | bewährt |
| Passphrase | Argon2id (RFC 9106) + 128-Bit-Secret-Key | bewährt |
| Entsperren | WebAuthn PRF (Passkey) | neu, Passphrase als Notweg |
| Ableitung | HKDF-SHA-512 | bewährt |

Schlüsselhierarchie:

```text
Passkey (PRF) ──────────┐
Passphrase + Secret Key ──┼─► Account Key (256 Bit, zufällig)
Recovery-Kit (Papier) ────┘          │
(Firmen-Recovery, Standard)        ├─► Benutzer-Schlüssel: Hybrid-KEM + Ed25519
                                   │
Tresor-Schlüssel ◄──────────────────┘  pro Mitglied verpackt
      │
Eintrags-Schlüssel ─► Eintrag (Titel, URL, Passwort, TOTP, Notizen – alles verschlüsselt)
```

Regeln:

- **AAD** bindet jeden Geheimtext an Eintrags-ID, Tresor-ID und Version: kein Vertauschen, keine
  alten Stände.
- **Signiertes Mitgliedschafts-Log** pro Tresor (Hash-Kette, Admin-signiert); Clients prüfen und
  merken sich den letzten Stand.
- **Firmen-Wurzelschlüssel**: Inhaber signieren die öffentlichen Schlüssel der Mitarbeiter;
  unerwartete Wechsel lösen eine Warnung aus.
- **Austritt**: neuer Tresor-Schlüssel, betroffene Passwörter werden zum Ändern markiert.
- **Neues Gerät**: Freigabe von einem angemeldeten Gerät per QR-Code und Vergleichscode.
- Login per Passkey/SSO, die Passphrase verlässt nie das Gerät; daher kein OPAQUE nötig.

## Bedrohungsmodell

Der Server gilt als nicht vertrauenswürdig; die größten Risiken liegen in Extension, ausgeliefertem
Code und Endgeräten, nicht in den Algorithmen.

| Angriff | Gegenmittel | Restrisiko |
| --- | --- | --- |
| Datenbank gestohlen | nur Geheimtexte; Secret Key verhindert Offline-Raten der Passphrase | keins bei korrekter Umsetzung |
| Später mit Quantenrechner entschlüsseln | Hybrid X25519 + ML-KEM-768 | gering |
| Server nimmt heimlich jemanden in einen Tresor auf | signiertes Mitgliedschafts-Log, Clients prüfen die Kette | keins |
| Server schiebt fremden öffentlichen Schlüssel unter | Firmen-Wurzelschlüssel signiert Mitarbeiterschlüssel, Warnung bei Wechsel | erster Kontakt (TOFU) |
| Server vertauscht Einträge oder spielt alte Stände ein | AAD mit ID und Version, Versionszähler im Client | keins |
| Server liefert manipulierte Web-App aus | Klartext-UI in der Extension; PWA mit signiertem Release-Manifest, Service Worker prüft Hashes; Extension prüft Web-App | PWA am Handy, dokumentiert |
| Phishing-Seite will Autofill | exakter Host-Abgleich (PSL), nur nach Klick, nicht in fremden iFrames | gering |
| Clickjacking auf das Autofill-Menü (DEF CON 2025) | Menü als Extension-iFrame im geschlossenen Shadow DOM | gering |
| Supply-Chain im Client | etwa 6 Laufzeitpakete, gepinnt, keine Install-Skripte | gering |
| SSO-Konto übernommen | SSO entschlüsselt nichts, Passkey/Passphrase nötig | keins |
| Mitarbeiter verlässt Firma | neuer Tresor-Schlüssel, Passwörter zum Ändern markiert | kopierte Passwörter bis zur Änderung |
| Malware auf dem Gerät | automatisches Sperren, Schlüssel nur im Speicher | hoch, außerhalb des Modells |
| Passwort bleibt am Handy in der Zwischenablage | Kopieren nur auf Tipp; native App leert die Zwischenablage nach 30 s und markiert sie als sensibel | PWA kann nicht zuverlässig leeren |
| Anmeldung durchprobieren | Rate-Limits, Sperre nach Fehlversuchen; die Passphrase kommt nie zum Server | gering |

## Projektstruktur

Ein Monorepo mit Bun Workspaces; die Krypto- und Datenlogik ist reines TypeScript und wird von allen
Apps geteilt.

| Pfad | Inhalt | Laufzeit-Abhängigkeiten |
| --- | --- | --- |
| `packages/crypto` | Bausteine, Schlüsselhierarchie, Testvektoren, Property-Tests | `@noble/*` |
| `packages/core` | Zod-Schemas, Sync, Prüfung des Mitgliedschafts-Logs, Rechte, Import-Parser | `zod` |
| `packages/ui` | Solid-Komponenten im shadcn-Stil, native Elemente | `solid-js` |
| `apps/server` | Hono-API, Drizzle/SQLite, SSE für Live-Sync, Audit-Log als Hash-Kette | `hono`, `drizzle-orm`, `better-auth` |
| `apps/web` | Solid-SPA/PWA: Verwaltung und Tresor am Handy | `packages/*` |
| `apps/extension` | Solid, MV3, Popup, Inline-Menü, Autofill | `packages/*`, `tldts` |
| `apps/mobile` | Tauri 3, Autofill-Plugins für Android und iOS | `packages/*` |
| `apps/cli` | `bun build --compile`, Secrets für Skripte und CI | `packages/*` |
| `e2e/` | Playwright, inklusive manipuliertem Testserver für die ETH-Angriffe | dev |

## Kopplung an andere Apps

Kennwort kennt weder Kontext noch Stalwart, nur Standards: eigenes Repo, eigener Container, und jede
Verbindung läuft über eine offene Schnittstelle, die auch andere Anbieter erfüllen. So macht es schon
Schreibzeug, das sich über einen allgemeinen OIDC-Client bei Kontext anmeldet.

| Was | Standard in Kennwort | In der Speicherstadt-Suite | Ohne Suite |
| --- | --- | --- | --- |
| Anmeldung | eigene Konten mit Passkey; wahlweise OpenID Connect (Client) | Kontext als OIDC-Provider, wie bei Schreibzeug, oder Stalwart direkt | Keycloak, Authentik, Entra ID, Google |
| Gruppen | eigene; wahlweise der groups-Claim aus dem ID-Token, Name des Claims einstellbar | info@, rechnung@ aus den Gruppenkonten in Stalwart | Gruppen des Anbieters |
| Benutzer anlegen und entfernen | Einladung oder Anmeldung legt an; optional SCIM-Endpunkt | Kontext könnte SCIM sprechen | jeder SCIM-Client |
| Verweise von außen | Deep Links, z. B. `/suche?q=Müller GmbH` | Kontext verlinkt vom Kunden auf seine Zugänge | jede App |

Ende-zu-Ende-Verschlüsselung setzt eine Grenze: Ein Gruppenwechsel beim Anbieter erzeugt nur eine
**Anfrage**. Zugriff gibt erst ein Verwalter frei, dessen Client den Tresor-Schlüssel für das neue
Mitglied verpackt und signiert; Entfernen wirkt sofort auf dem Server, den Schlüsselwechsel macht
der nächste Verwalter-Client. So kann weder der Anbieter noch der Server heimlich Zugriff
verschaffen.

## Bauplan im Agenten-Loop

Kennwort wird als fertiges Produkt gebaut, ohne MVP: Ein Agent arbeitet die
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md) Punkt für Punkt ab, bis
jedes Häkchen gesetzt und jede Prüfung grün ist. Er wartet nie auf einen Menschen; was nur Menschen
erledigen können, kommt nach dem Loop (unten).

Regeln für den Loop:

1. **Spezifikation zuerst**: `docs/sicherheitsdesign.md` und die Akzeptanzkriterien je Punkt der
   Bauliste. Ohne Kriterium kein Code.
2. **Ein Durchlauf, ein Punkt**: nächsten offenen Punkt nehmen, Tests zuerst (Vitest; Playwright
   desktop und `@phone`), umsetzen, Docs und Texte de/en nachziehen, `bun run check` grün, eigener
   Branch, Pull Request, unabhängiges Review, CI grün, mergen, Punkt abhaken.
3. **Automatische Sicherheits-Gates in CI**: Testvektoren und Property-Tests für die Kryptografie,
   manipulierter Testserver mit den Angriffen der ETH-Studie, Liste erlaubter Laufzeit-Pakete,
   Bundle-Größe, CSP, Barrierefreiheit mit axe.
4. **Nicht hängen bleiben**: Änderungen an `packages/crypto` nur mit Testvektoren, Property- und
   Mutation-Tests; nie einen Test abschalten; ein Punkt, der dreimal scheitert, wird zurückgestellt
   und am Ende wieder aufgenommen. Signaturen baut der Loop mit Test-Schlüsseln.

Reihenfolge nach Abhängigkeiten:

1. **Fundament** – Repo-Gerüst, CI, Sicherheitsdesign, `packages/crypto`, `packages/core`.
2. **Server** – API, Sync mit SSE, Anmeldung, Mitgliedschafts-Log, Audit-Log.
3. **Web-App und PWA** – Konto, Geräte, Firma, Tresore, Gruppen, Einträge, Verwaltung.
4. **Extension** – Popup, Inline-Menü, Ausfüllen, Speichern, Passkeys; Chrome, Edge, Firefox,
   Firefox für Android, Safari.
5. **Import und Export** – alle Formate aus dem Abschnitt unten.
6. **Team-Funktionen** – Einmal-Links, Erinnerungen, Richtlinien, Notfallzugriff, Anmeldung per
   OpenID Connect mit Gruppen, CLI.
7. **Härtung** – alle ETH-Angriffe abgewehrt, reproduzierbare Builds, Demo ohne Server, Doku,
   Screenshots.
8. **Mobile-App** – ganz am Schluss: Tauri 3 mit Autofill für Android; das iOS-Projekt wird angelegt,
   die iOS-App selbst baut ein Mensch auf einem Mac.

Was nur Menschen erledigen können, alles nach dem Loop:

- iOS-App: AutoFill-Extension in Xcode, Signatur, App Store.
- Signatur-Schlüssel für Release-Manifest, Extension und Apps erzeugen und verwahren.
- Store-Einreichungen (Chrome, Firefox, Edge, App Store, Play) und Antworten auf Reviews.
- Pilotbetrieb bei einem echten Betrieb.
- Externes Audit (z. B. Cure53) vor der Veröffentlichung; Befunde arbeitet der Loop ab.

## Tests

Jeder Punkt gilt erst als fertig, wenn seine Tests grün sind; alles außer den menschlichen
Prüfungen läuft in CI.

| Art | Was geprüft wird | Werkzeug |
| --- | --- | --- |
| Unit-Tests | reine Logik neben dem Code | Vitest |
| E2E | was ein Benutzer tut, Desktop und `@phone`; in CI in drei parallelen Teilen | Playwright |
| Krypto-Testvektoren | feste Ein- und Ausgaben je Baustein, Abgleich mit libsodium | Vitest, libsodium nur dev |
| Property-Tests | z. B. Entschlüsseln ergibt immer das Original, falsche AAD schlägt immer fehl | fast-check |
| Mutation-Tests | erkennen die Tests eine absichtliche Abweichung in `packages/crypto` und `packages/core`? In CI in drei parallelen Teilen; in einem Pull Request läuft ein Teil nur, wenn sich sein Paket, `packages/crypto` darunter oder die Abhängigkeiten geändert haben, auf `main` immer | Stryker |
| Bösartiger Server | manipulierter Testserver mit den Angriffen der ETH-Studie; der Client erkennt jeden | Vitest, Playwright |
| Extension im echten Browser | Inline-Menü und Ausfüllen auf Testseiten, auch Phishing-Domain, fremdes iFrame, überdecktes Menü | Playwright mit geladener Extension, `web-ext` für Firefox |
| Kompatibilität der Clients | was Web-App, Extension, App und CLI verschlüsseln, lesen alle anderen | gemeinsame Testvektoren |
| Sync und Offline | zwei Geräte ändern offline denselben Eintrag, nach dem Abgleich geht nichts verloren | Vitest, Playwright |
| Import-Parser | echte, anonymisierte Exportdateien je Anbieter; kaputte oder böswillige Dateien stürzen nie ab und hängen nie | Fixtures, Fuzzing mit fast-check |
| Updates | Datenbank-Migrationen und ältere Formatversionen bleiben lesbar | Vitest |
| Ernstfälle | Austritt mit Schlüsselwechsel, Recovery-Kit, Notfallzugriff, Gerät verloren, Backup zurückspielen | Playwright |
| Mobile-App | Rust-Tests, Oberfläche mit `mockIPC`, Android-Autofill im Emulator | cargo test, Playwright, Emulator |
| Server unter Last | viele Geräte gleichzeitig mit Live-Sync | Lasttest-Skript mit Bun |
| CI-Gates | erlaubte Laufzeit-Pakete, Bundle-Größe, CSP, Barrierefreiheit, reproduzierbarer Extension-Build (zweimal bauen, Hashes vergleichen) | eigene Checks, axe |
| Menschen | Pilotbetrieb, externes Audit | – |

## Dokumentation, Screenshots und Demo

Wie bei Kontext: Doku mit Zensical auf Deutsch, Screenshots per Workflow und eine Demo ohne Server,
alles auf GitHub Pages.

- **Doku**: Zensical in `docs/`, auf GitHub Pages unter kennwort.app, nur Deutsch;
  `zensical build --strict` gehört zu den Checks, wenn sich `docs/` ändert. Die Startseite ist
  zugleich die Produkt-Website (Hero, Rundgang in Screenshots, Vertrauen, Umstieg), wie bei
  kontext.email. Seiten: Überblick, Installation, Sicherheitsdesign, Import und Export, Extension,
  Handy und App, Verwaltung, FAQ, Datenschutz.
- **Screenshots**: Workflow „Update screenshots“ mit Playwright für Web-App, Extension-Popup,
  Inline-Menü und Handy, hell und dunkel; nach jeder Änderung am Aussehen schaut sich der Agent die
  neuen Bilder an.
- **Demo ohne Server**: die Web-App unter `/demo/` der Doku-Seite mit einem Server-Ersatz im
  Browser, der verschlüsselte Daten nur im Speicher hält; derselbe Ersatz dient den Tests.
  Testdaten „Weber Haustechnik“, deutlicher Hinweis, keine echten Passwörter einzugeben. Niedrige
  Priorität, Bauphase 8.

## Handy und Mobile-App

Am Handy bietet Kennwort dauerhaft beides an: die PWA ohne Installation und die Tauri-3-App, die
systemweit ausfüllt. In Firefox für Android läuft zusätzlich die Extension.

| Angebot | Wann | Ausfüllen am Handy |
| --- | --- | --- |
| PWA | Bauphase 3 | Kopieren mit einem Tipp; Zwischenablage wird nicht automatisch geleert |
| Extension in Firefox für Android | Bauphase 4 | Inline-Menü wie am Desktop |
| Tauri-3-Mobile-App | Bauphase 8 (iOS von Hand) | systemweit in allen Apps und Browsern, dazu Passkeys |

Wer was nutzt: Die **App** ist für alle, die täglich am Handy ausfüllen. Die **PWA** bleibt für
Aushilfen, fremde oder geteilte Geräte, Baustellen-Tablets und alle, die nichts installieren wollen
oder dürfen, auch auf dem iPhone ohne App Store. Beide nutzen dieselben Pakete (`packages/ui`,
`packages/core`, `packages/crypto`).

**Tauri 3**: Stand 19.11.2026 ist 3.0.0-alpha.6 (6.11.2026) aktuell, der 3.0-Meilenstein zu 31 %
erledigt; stabil ist Tauri 2.12. Die App kommt als letzte Bauphase, damit Tauri 3 bis dahin
möglichst stabil ist; ist es dann nicht stabil, nimmt der Loop die neueste Alpha oder 2.x.

Aufbau:

- Oberfläche aus `packages/ui`, Kryptografie aus `packages/crypto` im WebView; der Rust-Kern bleibt
  dünn.
- Account Key mit Biometrie im iOS-Schlüsselbund bzw. Android Keystore verpackt.
- Natives Plugin je Plattform: Android `AutofillService` (Kotlin, seit Chrome 135 auch in Chrome
  nutzbar) baut der Loop; die iOS AutoFill-Credential-Provider-Extension (Swift, eigenes
  Xcode-Target) mit Passkeys baut ein Mensch auf einem Mac.
- Zwischenablage nach 30 s leeren, Bildschirmschutz gegen Screenshots in der Eintragsansicht.

Verteilung:

- **Android**: APK in den GitHub-Releases, Updates über Obtainium oder ein eigenes F-Droid-Repo,
  optional Play Store. Googles Entwickler-Verifizierung für Apps außerhalb des Play Stores (ab 2026
  schrittweise) beachten.
- **iPhone**: nur über Apple – App Store, öffentlich oder als Unlisted App; für Firmen auch als
  Custom App über Apple Business Manager.
- **Lizenz**: Die App-Store-Bedingungen gelten als unvereinbar mit der AGPL; entschieden ist ein CLA
  für Beitragende (siehe Entscheidungen).

## Import und Export

Wer wechselt, nimmt alles mit: Einträge, Ordner, geteilte Ordner, TOTP, Notizen und eigene Felder.
Der Import läuft komplett im Client; die Datei verlässt nie das Gerät und wird nie hochgeladen.

| Von | Format |
| --- | --- |
| Bitwarden / Vaultwarden | JSON (auch Organisationen und Sammlungen), verschlüsseltes JSON, CSV |
| LastPass | CSV aus dem Web-Tresor (geteilte Ordner als Gruppen) |
| 1Password | 1PUX, CSV |
| KeePass / KeePassXC | KDBX 4, KeePass-2-XML, CSV |
| Team Password Manager | CSV (Projekte als Tresore) |
| Passbolt | CSV, KDBX |
| Dashlane, Proton Pass, Keeper, NordPass, Enpass | CSV bzw. JSON/ZIP |
| Chrome, Edge, Firefox, Safari / Apple Passwörter | CSV |
| Beliebige Tabelle | CSV mit Spaltenzuordnung |
| Jeder Manager mit FIDO Credential Exchange (CXF/CXP) | verschlüsselte Übertragung, auch Passkeys; sobald der Standard stabil ist |
| Google Authenticator, Aegis, 2FAS, Microsoft Authenticator | Export-QR-Code (otpauth-migration) bzw. JSON-Export; Microsoft soweit dessen Export es erlaubt; TOTP wird dem passenden Login zugeordnet |

Ablauf:

1. Anbieter wählen; Kennwort zeigt in drei Schritten, wo dort der Export ist.
2. Datei laden; Vorschau mit Zuordnung: Ordner und Sammlungen werden Tresore, geteilte Ordner
   geteilte Tresore mit Gruppen.
3. Doppelte Einträge erkennen und zusammenführen; schwache und mehrfach genutzte Passwörter gleich
   zum Ändern markieren.
4. Verschlüsseln und hochladen; danach Hinweis, die unverschlüsselte Exportdatei zu löschen.

Umsetzung: ein Parser pro Format als reine Funktion in `packages/core` (Datei rein, Einträge raus),
getestet mit echten, anonymisierten Exportdateien je Anbieter als Fixtures. KDBX wird mit den
`@noble`-Bausteinen gelesen (Argon2, ChaCha20, AES), ohne zusätzliche Bibliothek.

**Export ohne Lock-in**: eigener verschlüsselter Export (JSON mit Passwort), CSV, KDBX und CXF,
sobald verfügbar. Exportieren dürfen nur Verwalter eines Tresors, und es landet im Audit-Log.

## Funktionsumfang 1.0

Die vollständige Liste mit Bauphasen und Akzeptanzkriterien steht in der
[Bauliste](https://github.com/Speicherstadt/kennwort/blob/main/BAULISTE.md). Version 1.0 ist fertig,
wenn dort alles abgehakt ist und die menschlichen Schritte erledigt sind.

## Offene Fragen

- Marke: „Kennwort“ als Wort-Bild-Marke anmelden? Store-Namen prüfen (Chrome, Firefox, App Store,
  Play).
- Liefert Stalwart selbst einen groups-Claim, oder bekommt ihn Kontexts OIDC-Provider dazu?
- Unterstützen `@tanstack/solid-router` und `solid-query` schon Solid 2?
- Ab wann Budget für das externe Audit, und welcher Prüfer?
- Aktueller Stand von Googles Entwickler-Verifizierung für APKs außerhalb des Play Stores?
- Bringt Tauri 3 für Mobile genug, um auf die stabile Version zu warten?

## Quellen

- [iTnews: Schwachstellen in Cloud-Passwortmanagern (ETH-Studie)](https://www.itnews.com.au/news/researchers-find-critical-vulnerabilities-in-cloud-based-password-managers-623661)
- [CyberInsider: Passwortmanager halten Zero-Knowledge nicht ein](https://cyberinsider.com/popular-password-managers-fall-short-of-zero-knowledge-claims/)
- [Passbolt: v5 encrypted metadata](https://www.passbolt.com/docs/development/resources/v5-encrypted-metadata/)
- [solid-js 2.0.0 Release](https://newreleases.io/project/github/solidjs/solid/release/solid-js@2.0.0)
- [tech-stack.md in firsttris/workflows](https://github.com/firsttris/workflows/blob/main/tech-stack.md)
- [Tauri auf lib.rs (Versionen 2.x und 3.0-Alpha)](https://lib.rs/crates/tauri)
- [Tauri 3.0-Meilenstein auf GitHub](https://github.com/tauri-apps/tauri/milestone/5)
