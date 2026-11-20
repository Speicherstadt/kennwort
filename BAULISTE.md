# Bauliste

Die Liste, die der Agenten-Loop abarbeitet, in der Reihenfolge der Bauphasen aus dem
[Projektplan](https://kennwort.app/plan.html). Kennwort 1.0 ist fertig, wenn jeder Punkt abgehakt ist
und die Schritte für Menschen am Ende erledigt sind.

## So arbeitet der Loop

1. Den **ersten offenen Punkt** nehmen, dessen Abhängigkeiten (`nach:`) abgehakt sind. Phasen
   laufen nacheinander; innerhalb einer Phase von oben nach unten.
2. **Kriterien zuerst**: Die Zeile „Fertig, wenn“ ist das Minimum. Reicht sie nicht, schärft der
   Loop sie im selben Pull Request nach, bevor er Code schreibt; streichen darf er keins.
3. Ein Punkt, ein Branch, ein Pull Request (Titel mit der Nummer, z. B. `K-104: Hybrid-KEM`). Tests
   zuerst, dann Code, Docs und Texte de/en, `bun run check` grün.
4. **Unabhängiges Review** durch einen eigenen Sub-Agenten (`tdd-review`): ein Befund braucht einen
   fehlschlagenden Test. Befunde fixen, bis keine mehr kommen.
5. **CI grün → selbst mergen** (Squash), den Punkt hier im selben Pull Request abhaken. Der Loop
   wartet nie auf einen Menschen, auch nicht bei `packages/crypto`: Dort gilt statt einer Freigabe
   ein strengeres Gate – Testvektoren, Property-Tests und Mutation-Tests müssen grün sein.
6. **Nicht hängen bleiben**: Scheitert ein Punkt dreimal, trägt der Loop ihn mit Grund unter
   „Zurückgestellt“ ein und macht mit dem nächsten Punkt weiter, der nicht davon abhängt. Am Ende
   kommt er auf die zurückgestellten Punkte zurück. Was nur ein Mensch erledigen kann, steht unten
   unter „Schritte für Menschen“ und liegt nicht auf dem Weg des Loops; Signaturen baut der Loop mit
   Test-Schlüsseln, die echten kommen erst zur Veröffentlichung.

## Phase 1 – Fundament

- [x] **K-101 Repo-Gerüst** – Workspaces `packages/crypto`, `packages/core`, `packages/ui`, Paraglide
  (de/en), Playwright mit Projekten `desktop` und `phone`; `checks.json` um i18n
  erweitern, sobald die Pakete da sind, und `@firsttris/checks` in `package.json` aufnehmen, wo es
  sich installieren lässt (bis dahin installiert die CI es selbst).
  Fertig, wenn: `bun run check` auf einem frischen Klon grün ist und CI alle Workspaces prüft
  (ein Test scheitert, wenn ein Workspace in `tsc -b` oder Vitest fehlt) und Playwright `desktop`
  und `phone` in CI gegen den Build der Web-App laufen. `@firsttris/checks` lässt sich bislang nirgends
  aus dem Lockfile installieren (Bun lädt GitHub-Pakete als Tarball über api.github.com, in der
  Agenten-Umgebung gesperrt); die CI installiert es weiter selbst.
- [x] **K-102 Liste erlaubter Laufzeit-Pakete** – `allowed-dependencies.json` mit Begründung je
  Paket und ein Check in `bun run lint`.
  Fertig, wenn: ein Paket außerhalb der Liste in einem Client-Workspace den Lint scheitern lässt
  (Test dafür vorhanden).
- [x] **K-103 Sicherheitsdesign** – `docs/sicherheitsdesign.md`: Bedrohungsmodell, Schlüsselhierarchie,
  jedes Format mit Version, alle Protokolle (Konto, Gerät, Tresor, Mitgliedschaft, Teilen, Recovery,
  Notfall), was der Server sieht.
  Fertig, wenn: jeder Abschnitt des Projektplans zu Kryptografie und Bedrohungsmodell dort ein
  Protokoll hat und jedes Protokoll die Angriffe der ETH-Studie nennt, die es abwehrt; ein Test
  prüft, dass jede Zeile des Bedrohungsmodells und jede Regel der Kryptografie aus dem Projektplan
  in der Abdeckungstabelle steht und jedes Protokoll eine Zeile „Wehrt ab“ mit Angriffen aus dem
  Katalog hat.
- [x] **K-104 Symmetrische Verschlüsselung** – XChaCha20-Poly1305 mit AAD, Formatversion im Präfix.
  nach: K-103. Fertig, wenn: Testvektoren (auch gegen libsodium, nur dev), Property-Tests
  (Rundlauf, falsche AAD/Schlüssel/Nonce scheitern) und Mutation-Tests grün sind.
- [x] **K-105 Hybrid-KEM** – X25519 + ML-KEM-768 nach draft-connolly-cfrg-xwing-kem, Schlüssel
  verpacken und entpacken.
  nach: K-104. Fertig, wenn: Testvektoren des Entwurfs bestehen und Property-Tests grün sind.
- [x] **K-106 Signaturen und Ableitung** – Ed25519, HKDF-SHA-512, Argon2id mit Secret Key.
  nach: K-104. Fertig, wenn: Testvektoren aus RFC 8032, RFC 5869 und RFC 9106 bestehen.
- [x] **K-107 Schlüsselhierarchie** – Account Key, Benutzer-, Tresor- und Eintrags-Schlüssel,
  Entsperren per Passkey-PRF und Passphrase, Recovery-Kit, Firmen-Recovery.
  nach: K-105, K-106. Fertig, wenn: jeder Weg zum Account Key und jede Ebene getestet ist,
  einschließlich falscher Eingaben.
- [x] **K-108 Mitgliedschafts-Log** – signierte Hash-Kette pro Tresor, Prüfung im Client, Merken des
  letzten Stands, Firmen-Wurzelschlüssel signiert Mitarbeiterschlüssel.
  nach: K-107. Fertig, wenn: ausgelassene, vertauschte, unsignierte und zurückgespielte Einträge
  erkannt werden (je ein Test).
- [x] **K-109 Datenmodell und Sync-Protokoll** – Zod-Schemas in `packages/core` für alles, was
  zwischen Client und Server geht; Versionen, Konflikte, Offline-Warteschlange.
  nach: K-108. Fertig, wenn: zwei simulierte Geräte offline denselben Eintrag ändern und nach dem
  Abgleich nichts verloren ist.

## Phase 2 – Server

- [x] **K-201 Server-Gerüst** – Bun, Hono, Drizzle/SQLite mit Migrationen, Zod an jeder Grenze,
  Health-Endpunkt, Logs ohne Geheimnisse, `bun build --compile`.
  Fertig, wenn: der Server mit leerer Datenbank startet, migriert und `/health` antwortet.
- [x] **K-202 Mandanten** – mehrere Firmen auf einem Server, strikt getrennt.
  Fertig, wenn: kein Endpunkt Daten einer anderen Firma liefert (Test je Endpunkt); ein Test
  scheitert, wenn ein Endpunkt unter `/api` keinen solchen Fall hat.
- [x] **K-203 Anmeldung** – Better Auth mit Passkeys, Einladungslinks, Anmelde-Schlüssel aus der
  Passphrase als Notweg, Rate-Limits und Sperre nach Fehlversuchen.
  Fertig, wenn: Login, Einladung und Sperre in Tests laufen und die Passphrase nachweislich nie den
  Client verlässt.
- [x] **K-204 Sync-API und Live-Sync** – Speichern und Abrufen von Geheimtexten, Versionen, SSE.
  nach: K-109. Fertig, wenn: zwei Clients Änderungen live sehen und der Server nur Geheimtexte
  speichert (Test liest die Datenbank).
- [x] **K-205 Audit-Log** – Hash-Kette, Export für Prüfer.
  Fertig, wenn: eine manipulierte Zeile beim Prüfen auffällt.
- [x] **K-206 Bösartiger Testserver** – Testserver, der gezielt lügt (Schlüssel austauschen,
  Mitglieder einschmuggeln, alte Stände, vertauschte Geheimtexte).
  Fertig, wenn: die ersten Angriffe der ETH-Studie als Tests laufen und der Client jeden erkennt;
  die übrigen folgen mit den Funktionen, die sie betreffen.
- [x] **K-207 Server-Ersatz im Browser** – derselbe Ersatz für Tests und spätere Demo.
  Fertig, wenn: die Client-Tests ohne echten Server gegen ihn laufen.

## Phase 3 – Web-App und PWA

- [x] **K-301 UI-Paket** – `packages/ui` nach DESIGN.md: Button, Input, Dialog, Menü, Popover,
  Tooltip, Toast, Combobox, Tabs, Badge, Liste; native Elemente, eigene `cn()` und `variants()`.
  Fertig, wenn: jede Komponente mit Tastatur bedienbar ist und axe keine Fehler findet.
- [x] **K-302 App-Rahmen** – Rail, Seitenleiste, Liste und Detail wie im Mockup; Handy mit einem
  Screen und Tab-Leiste; hell und dunkel; de/en.
  Fertig, wenn: Playwright desktop und `@phone` alle Seiten öffnet und axe grün ist.
- [x] **K-303 Konto und Geräte** – Konto anlegen, Entsperren, Recovery-Kit als PDF, neues Gerät per
  QR-Code, Geräteliste, Gerät abmelden, automatisches Sperren.
  In Teilen, je ein Pull Request; abgehakt wird K-303, wenn alle stehen:
  - [x] Teil 1: Konto anlegen (erster Inhaber mit Einrichtungs-Code, Eingeladene), Kontozustand,
    Entsperren mit Passphrase und Recovery Key – in `packages/core` und auf dem Server.
  - [x] Teil 2: Konto anlegen und Entsperren in der Web-App, automatisches Sperren.
  - [x] Teil 3: Recovery-Kit als PDF mit QR-Code für ein neues Gerät (P-12).
  - [x] Teil 3b: Anmelden und Entsperren mit dem Recovery Key in der Web-App (eigener
    Anmelde-Schlüssel aus dem Recovery Key, da der aus der Passphrase dann fehlt), danach neue
    Passphrase und neuen Recovery Key anlegen (P-12).
  - [x] Teil 4: Neues Gerät per QR-Code – das Protokoll (P-04) in `packages/crypto`,
    `packages/core` und auf dem Server.
  - [x] Teil 5: Neues Gerät per QR-Code in der Web-App (QR-Code zeigen, scannen oder eingeben,
    Vergleichscode auf beiden Geräten).
  - [x] Teil 6: Geräteliste, Gerät abmelden. Fertig, wenn: pro Gerät und Konto genau eine Sitzung
    besteht (Geräte-ID), die Einstellungen alle angemeldeten Geräte mit Name und letzter Aktivität
    zeigen, ein anderes Gerät abgemeldet danach keine Anfrage mehr durchbekommt und „Dieses Gerät
    abmelden“ das Konto auf dem Gerät vergisst – als Playwright-Test desktop und `@phone`.
- [x] **K-304 Firma, Rollen, Einladungen** – Inhaber, Admin, Mitarbeiter; Wurzelschlüssel;
  Richtlinien.
  In Teilen, je ein Pull Request; abgehakt wird K-304, wenn alle stehen:
  - [x] Teil 1: Einladung vollständig nach P-08 – Einladungsgeheimnis im Link, das der Server nie
    sieht, MAC über das Bündel des Eingeladenen, der Client des Einladenden prüft ihn und
    zertifiziert erst dann; Mitgliederliste auf dem Server. Fertig, wenn: ein Bündel, das der Server
    unterschiebt oder austauscht, nicht zertifiziert wird (Test gegen den lügenden Server).
  - [x] Teil 2: Mitglieder und Einladen in der Web-App – Mitglieder-Seite mit Rolle und
    Zertifikat, Einladungslink zeigen und kopieren, ausstehende Mitglieder bestätigen. Fertig, wenn:
    der Client den öffentlichen Wurzelschlüssel nur nimmt, wenn er zum gemerkten Fingerabdruck
    passt, „Bestätigt“ nur bei einem Zertifikat dieses Schlüssels steht, eine Einladung höchstens
    ein Konto zertifiziert (im Kontozustand gemerkt) und Einladen, Annehmen und Bestätigen als
    Playwright-Test desktop und `@phone` laufen.
  - [x] Teil 3: Rollen ändern – Inhaber, Admin, Mitarbeiter; neues Zertifikat, der Wurzelschlüssel
    an jeden Verwalter verpackt, immer mindestens ein Inhaber. Fertig, wenn: nur Inhaber Rollen
    vergeben und nie die eigene, ein Admin den Wurzelschlüssel nur annimmt, wenn er zum gemerkten
    Fingerabdruck passt, und danach selbst einlädt und bestätigt – als Playwright-Test desktop und
    `@phone`.
  - [x] Teil 4: Firmen-Richtlinien, vom Wurzelschlüssel signiert (automatisches Sperren,
    Firmen-Recovery an oder aus mit dem Fingerabdruck ihres Schlüssels); jeder Client prüft sie.
    Fertig, wenn: das Format (F-07) Testvektoren hat, der Server nur signierte neuere Versionen von
    Inhabern nimmt, jeder Client eine ältere, unsignierte oder fremde Richtlinie ablehnt und die
    Sperrzeit auf allen Geräten gilt – als Playwright-Test desktop und `@phone`. Den Schalter für
    Firmen-Recovery bringt K-307 mit dessen Schlüssel; das Format trägt ihn schon.
- [x] **K-305 Tresore, Gruppen, Rechte** – persönlich und geteilt, lesen/bearbeiten/verwalten,
  Gruppen, Zugriff auf Zeit, Zugriff anfragen, einzelnen Eintrag teilen.
  In Teilen, je ein Pull Request; abgehakt wird K-305, wenn alle stehen:
  - [x] Teil 1: Tresor-Protokoll in Core und Server (P-05, P-06) – anlegen, aufnehmen, Rolle
    ändern, entfernen; der Server legt Log und verpackte Tresor-Schlüssel ab. Fertig, wenn: der
    Server nur die nächste, vom angemeldeten Verwalter gültig signierte Stelle der Kette nimmt,
    Log und Schlüssel nur Mitgliedern zeigt, keine Firma die Tresore einer anderen sieht und der
    Client die Kette vom Server mit `verifyLog` annimmt (Tests gegen den Server).
  - [x] Teil 2: Tresore in der Web-App – persönlicher Tresor beim ersten Öffnen, geteilte Tresore
    anlegen, der Name mit dem Tresor-Schlüssel verschlüsselt, die Tresore in Seitenleiste und
    Einstellungen. Fertig, wenn: ein Mitglied nur Tresore sieht, deren Log es geprüft hat, ein
    gekürztes oder verändertes Log den Tresor zu lässt und Anlegen als Playwright-Test desktop und
    `@phone` läuft.
  - [x] Teil 3: Mitglieder eines Tresors – aufnehmen mit Rolle, Rolle ändern, entfernen. Fertig,
    wenn: nur bestätigte Konten aufgenommen werden und Aufnehmen, Rolle ändern und Entfernen als
    Playwright-Test desktop und `@phone` laufen.
  - [x] Teil 4: Zugriff auf Zeit und Zugriff anfragen. Fertig, wenn: nach Ablauf kein Client den
    Tresor mehr für das Mitglied öffnet und der Server ihm Log und Schlüssel nicht mehr gibt, und
    eine Anfrage erst mit dem Aufnehmen durch einen Verwalter Zugriff gibt – als Playwright-Test
    desktop und `@phone`. Einträge, die ein Mitglied nach Ablauf schreibt, verwirft der Client mit
    K-306, wenn die Einträge aus den Tresoren kommen.
  - [x] Teil 5: Gruppen – ein Tresor für eine Gruppe von Mitgliedern; aufnehmen und entfernen über
    die Gruppe. Fertig, wenn: ein neues Gruppenmitglied erst Zugriff hat, wenn ein Verwalter seine
    Anfrage freigibt (P-05, Schritt 4).
  - [x] Teil 6a: einzelnen Eintrag teilen (P-10), Protokoll in Crypto, Core und Server; EK bleibt
    über die Versionen gleich, sodass eine Freigabe auch künftige Versionen abdeckt. Fertig, wenn:
    der Empfänger nur diesen Eintrag entschlüsseln kann (Test gegen Server und Stand-in).
  - [x] Teil 6b: Teilen in der Web-App – Freigeben, „Mit mir geteilt“, Widerrufen mit neuem EK.
    Fertig, wenn: Teilen und Widerrufen als Playwright-Test desktop und `@phone` laufen.
- [x] **K-306 Einträge** – alle Typen, Generator, TOTP mit QR-Scan, eigene Felder, frühere
  Passwörter, Suche, Favoriten, Tags.
  In Teilen, je ein Pull Request; abgehakt wird K-306, wenn alle stehen:
  - [x] Teil 1: Einträge aus den Tresoren statt der Demo – anlegen und ändern (Login), Liste und
    Detail aus den geprüften Einträgen (P-09, P-21). Fertig, wenn: kein Gerät einen Eintrag zeigt,
    den es nicht geprüft hat, Leser nicht ändern können und Anlegen, Ändern und Lesen auf einem
    zweiten Konto als Playwright-Test desktop und `@phone` laufen.
  - [x] Teil 2: Alle Typen (Notiz, WLAN, Karte, SSH- und API-Schlüssel, Identität) und eigene
    Felder. Fertig, wenn: jede Art ihre Felder mitbringt, Felder unbekannter Art erhalten bleiben
    und Anlegen mit eigenem Feld, Ändern und Entfernen als Playwright-Test desktop und `@phone`
    laufen.
  - [x] Teil 3: Generator für Passwörter und Passphrasen. Fertig, wenn: jede Wahl gleich
    wahrscheinlich ist (Verwerfungsstichprobe, Mutationstests), die Wortliste per Prüfsumme
    feststeht und Erzeugen sowie Übernehmen in den Eintrag als Playwright-Test desktop und `@phone`
    laufen.
  - [x] Teil 4a: Einmalcodes (TOTP, RFC 6238) – Schlüssel oder `otpauth://`-Link im Login oder als
    eigenes Feld, im Eintrag der aktuelle Code mit Restzeit. Fertig, wenn: die Codes die
    Testvektoren aus RFC 4226 und RFC 6238 treffen (Mutationstests), der Schlüssel nirgends im
    Klartext erscheint und Eintragen und Kopieren als Playwright-Test desktop und `@phone`
    laufen.
  - [x] Teil 4b: QR-Scan mit der Kamera und aus einem Bild (Screenshot), auf dem Handy und am
    Desktop. Fertig, wenn: nur ein `otpauth://totp`-Link übernommen wird und Scannen aus einem Bild
    (desktop und `@phone`) sowie mit der Kamera als Playwright-Test laufen.
  - [x] Teil 5: Frühere Passwörter, Favoriten, Tags, Suche über alles, „Zum Ändern“ (schwache und
    doppelte Passwörter). Fertig, wenn: ein geändertes Passwort unter „Frühere Passwörter“ steht
    (je Feld die zehn neuesten), die Suche nie geheime Werte durchsucht, schwache und doppelte
    Passwörter nur auf dem Gerät erkannt werden und Ändern, Favorit, Tag, Suche und „Zum Ändern“
    als Playwright-Test desktop und `@phone` laufen.
- [ ] **K-307 Austritt und Recovery** – Schlüsselwechsel, Änderungs-Markierung, Austritts-Bericht,
  Firmen-Recovery, Notfallzugriff mit Wartezeit, Wechsel des Account Key (AK), wenn ein
  Recovery-Kit in fremde Hände geraten ist (P-12).
- [ ] **K-308 PWA** – installierbar, offline lesbar, signiertes Release-Manifest, Service Worker
  prüft Hashes vor jedem Update.
  In Teilen, je ein Pull Request; abgehakt wird K-308, wenn beide stehen:
  - [x] Teil a: installierbar, signiertes Release-Manifest, Service Worker prüft Signatur und
    Hashes vor jedem Update (P-16). Fertig, wenn: ein Update mit falschem Hash oder falscher
    Signatur nicht aktiv wird und ein richtiges aktiv wird (Playwright-Test).
  - [ ] Teil b: offline lesbar – Geheimtexte und der verpackte AK auf dem Gerät, Entsperren ohne
    Server.

Für K-303 bis K-307 gilt: Fertig, wenn jeder Ablauf als Playwright-Test (desktop und `@phone`) läuft,
die Doku-Seite dazu steht und die Ernstfälle aus dem Projektplan getestet sind.

## Phase 4 – Extension

- [x] **K-401 Extension-Gerüst** – Solid, Vite, `@crxjs/vite-plugin`, MV3, Texte über Paraglide wie in der Web-App, `_locales` nur für
  Name, Beschreibung und Manifest, Chrome/Edge
  und `build:firefox`; Schlüssel nur in `chrome.storage.session`.
  Fertig, wenn: die Extension für Chrome/Edge und Firefox baut, ihr Popup in einem echten Chromium
  (Playwright mit geladener Extension) den gesperrten Zustand auf Deutsch und Englisch zeigt und
  axe nichts findet, ein Test zeigt, dass Schlüssel nur in `chrome.storage.session` landen, und
  ein Test scheitert, sobald der Code der Extension `chrome.storage.local`, `chrome.storage.sync`,
  `localStorage` oder IndexedDB benutzt.
- [ ] **K-402 Popup** – entsperren, Treffer für die Seite, Suche, Favoriten, Generator.
- [ ] **K-403 Inline-Menü und Ausfüllen** – Extension-iFrame im geschlossenen Shadow DOM, Ausfüllen
  nur nach Klick oder Enter, exakter Host per `tldts`, nie in fremden Frames.
  Fertig, wenn: Playwright mit geladener Extension Phishing-Domain, fremdes iFrame und überdecktes
  Menü abwehrt.
- [ ] **K-404 Speichern und Aktualisieren** – neues Login und geändertes Passwort erkennen.
- [ ] **K-405 Phishing-Warnung** – Warnung beim Eintippen eines gespeicherten Passworts auf fremder
  Domain.
- [ ] **K-406 Passkey-Anbieter** – Passkeys in Kennwort speichern und damit anmelden.
- [ ] **K-407 Firefox für Android und Safari** – Build und Tests je Browser.
- [ ] **K-408 Reproduzierbarer Build** – zweimal bauen, Hashes vergleichen, in CI.

## Phase 5 – Import und Export

- [ ] **K-501 Import-Ablauf** – Anbieter wählen, Anleitung, Vorschau mit Zuordnung, Duplikate,
  Markierung schwacher Passwörter, Hinweis zum Löschen der Datei.
- [ ] **K-502 Parser** – je Format aus dem Projektplan eine reine Funktion in `packages/core`.
  Fertig, wenn: je Anbieter echte, anonymisierte Fixtures bestehen und Fuzzing ohne Absturz läuft.
- [ ] **K-503 Authenticator-Import** – otpauth-migration-QR, Aegis, 2FAS, Microsoft.
- [ ] **K-504 Export** – verschlüsseltes JSON, CSV, KDBX; nur Verwalter, im Audit-Log.

## Phase 6 – Team-Funktionen

- [ ] **K-601 Einmal-Links** – mit Ablauf und begrenzten Abrufen.
- [ ] **K-602 Benachrichtigungen** – in der App, Web-Push, optional Mail.
- [ ] **K-603 Sicherheits-Übersicht** – schwache, mehrfache, geleakte Passwörter (k-Anonymität),
  monatlicher Bericht; „Zum Ändern“ mit `/.well-known/change-password`.
- [ ] **K-604 OpenID Connect und SCIM** – allgemeiner OIDC-Client mit groups-Claim, Gruppenwechsel
  als Anfrage, optional SCIM, Deep Links.
- [ ] **K-605 Handwerk und IT-Dienstleister** – QR-Etiketten, Übergabe an den Kunden, mehrere Firmen
  in einem Konto.
- [ ] **K-606 CLI** – Anmelden, Suchen, Lesen per Bestätigung, `bun build --compile`.
- [ ] **K-607 DSGVO** – Konto löschen, Daten exportieren, Datenschutz-Seite.

## Phase 7 – Härtung

- [ ] **K-701 Alle ETH-Angriffe** – jeder der 27 Angriffe als Test gegen den bösartigen Testserver.
- [ ] **K-702 Lasttest** – viele Geräte mit Live-Sync.
- [ ] **K-703 Installation und Betrieb** – Docker-Image, Compose, Quadlet, Caddy, Backups mit
  Wiederherstellung, Update-Hinweis; Release-Workflow aus firsttris/workflows.
- [ ] **K-704 Doku und Website** – alle Seiten aus dem Projektplan, Startseite als Produkt-Website,
  README aktuell.
- [ ] **K-705 Screenshots** – Workflow „Update screenshots“, hell und dunkel.
- [ ] **K-706 Demo ohne Server** – unter `/demo/` mit Testdaten „Weber Haustechnik“.

## Phase 8 – Mobile-App (Android)

Ganz am Schluss, damit Tauri 3 bis dahin möglichst stabil ist. iOS baut der Loop nicht (siehe
„Schritte für Menschen“); die gemeinsamen Teile legt er so an, dass die iOS-App sie nur einbindet.

- [ ] **K-801 Tauri-Gerüst** – Tauri 3 (stabil, sonst die neueste Alpha; Rückfall auf 2.x) mit
  `packages/ui`, Projekt für Android und iOS angelegt.
- [ ] **K-802 Android-Autofill** – `AutofillService`, Biometrie, Keystore.
  Fertig, wenn: der Autofill-Dienst im Android-Emulator in CI ausfüllt.
- [ ] **K-803 Zwischenablage und Bildschirmschutz** – Leeren nach 30 s, sensibel markiert.

## Zurückgestellt

Punkte, die dreimal gescheitert sind, mit Grund; der Loop kommt am Ende auf sie zurück.

## Schritte für Menschen

Nicht auf dem Weg des Loops; alles erst nach der letzten Phase.

- [ ] Default-Branch auf `main`, GitHub Pages mit Domain kennwort.app
- [ ] **iOS-App** (nicht im Loop, auf einem Mac): AutoFill-Credential-Provider-Extension mit
  Passkeys und Schlüsselbund in Xcode, Signatur, App Store
- [ ] Signatur-Schlüssel für Release-Manifest, Extension und Apps
- [ ] Store-Einreichungen und Antworten auf Reviews
- [ ] Pilotbetrieb bei einem echten Betrieb
- [ ] Externes Audit vor der Veröffentlichung
