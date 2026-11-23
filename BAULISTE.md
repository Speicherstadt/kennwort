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
4. **Unabhängiges Review nur für Sicherheitsrelevantes**: Berührt der Pull Request Kryptografie,
   Sync, Mitglieder-Log, Freigaben, Anmeldung, Zugriffsprüfung, Entsperren, Schlüssel, Kopplung,
   Autofill, das signierte Update, die CSP oder die Liste erlaubter Pakete (genaue Liste in
   `CLAUDE.md`, „The agent loop“), prüft ihn ein eigener Sub-Agent (`tdd-review`): ein Befund braucht
   einen fehlschlagenden Test, Befunde fixen, bis keine mehr kommen. Alles andere geht ohne Review.
5. **CI grün → selbst mergen** (Squash), den Punkt hier im selben Pull Request abhaken. Der Loop
   wartet nie auf einen Menschen, auch nicht bei `packages/crypto`: Dort gilt statt einer Freigabe
   ein strengeres Gate – Testvektoren und Property-Tests in CI, Mutation-Tests zu 100 % jede Nacht
   (CI bleibt unter fünf Minuten); ein roter nächtlicher Lauf wird zuerst behoben.
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
- [x] **K-307 Austritt und Recovery** – Schlüsselwechsel, Änderungs-Markierung, Austritts-Bericht,
  Firmen-Recovery, Notfallzugriff mit Wartezeit, Wechsel des Account Key (AK), wenn ein
  Recovery-Kit in fremde Hände geraten ist (P-12).
  In Teilen, je ein Pull Request; abgehakt wird K-307, wenn alle stehen:
  - [x] Teil a: Schlüsselwechsel beim Austritt in Core und Server (P-11) – `entfernen` und
    `schlüsselwechsel` signiert, das neue VK an jedes verbleibende Mitglied verpackt, jeder Eintrag
    neu verschlüsselt, Änderungs-Markierung im Inhalt, Austritts-Bericht als reine Funktion,
    Austritt aus der Firma auf dem Server. Fertig, wenn: der Server einen Schlüsselwechsel nur mit
    dem neuen Schlüssel für genau die Mitglieder des Logs und Versionen nur in der aktuellen Epoche
    nimmt (Vertrag gegen Server und Stand-in), ein ausgetretenes Konto sofort keine Anfrage mehr
    durchbekommt, ein Client nie unter einem überholten Schlüssel schreibt, jede Version, die die
    Person lesen konnte, markiert wird und die Angriffe „Server hält den Wechsel zurück“, „Server
    gibt dem Ausgetretenen den alten Schlüssel“ und „Server spielt das Log zurück“ als Tests gegen
    den lügenden Server erkannt werden; Mutation-Tests in `packages/core` bei 100 %.
  - [x] Teil b: Austritt in der Web-App – „Aus der Firma entfernen“ und „Aus dem Tresor entfernen“
    mit Schlüsselwechsel und Neuverschlüsseln, Freigaben neu verpackt (`reshare`), Markierte unter
    „Zum Ändern“ mit Grund, Austritts-Bericht; ein Verwalter-Client holt ausstehende Wechsel nach
    (`dueExits`), ein Eintrag aus einer Epoche vor einem Austritt bekommt beim Schreiben seine
    Markierung, auch wenn der Server ihn vor dem Wechsel versteckt hat, andere Clients schreiben nicht, solange einer aussteht, und warnen. Fertig, wenn:
    Entfernen aus Firma und Tresor, die Markierung und der Bericht als Playwright-Test desktop und
    `@phone` laufen und die entfernte Person danach keinen neuen Eintrag öffnet.
  - [x] Teil c: Firmen-Recovery (P-13) – Schlüssel anlegen und an Inhaber verpacken, Schalter in
    der Richtlinie (F-07), Hinterlegung jedes Kontos, Wiederherstellen über ein neues Gerät, neuer
    Schlüssel, wenn ein Inhaber geht. Fertig, wenn: eine Hinterlegung an einen Schlüssel, den die
    Richtlinie nicht nennt, nie entsteht, ein vom Server verpackter AK abgelehnt wird (Test gegen
    den lügenden Server) und Wiederherstellen als Playwright-Test desktop und `@phone` läuft.
  - [x] Teil d: Notfallzugriff mit Wartezeit (P-14). Fertig, wenn: die Pakete erst nach Ablauf der
    Wartezeit herauskommen, ein Widerspruch sie sperrt, ein Schlüssel ohne passende Bindung im Log
    abgelehnt wird und Anlegen, Anfragen und Widersprechen als Playwright-Test desktop und `@phone`
    laufen.
  - [x] Teil e: Wechsel von AK und Benutzer-Schlüsseln nach einem Recovery-Kit in fremden Händen
    (P-12). Fertig, wenn: der alte Recovery Key und alte Geheimtexte nichts mehr öffnen, was danach
    geschrieben wird, das neue Bündel erst mit neuem Zertifikat gilt und der Ablauf als
    Playwright-Test desktop und `@phone` läuft.
  - [x] Teil f: neuer Firmen-Wurzelschlüssel, wenn ein Inhaber oder Admin geht (P-07). Fertig,
    wenn: ein Client den Wechsel nur nach Bestätigung nimmt, keinen zweiten vom alten Schlüssel
    annimmt und Zertifikate des alten Schlüssels danach nicht mehr gelten.
- [x] **K-308 PWA** – installierbar, offline lesbar, signiertes Release-Manifest, Service Worker
  prüft Hashes vor jedem Update.
  In Teilen, je ein Pull Request; abgehakt wird K-308, wenn beide stehen:
  - [x] Teil a: installierbar, signiertes Release-Manifest, Service Worker prüft Signatur und
    Hashes vor jedem Update (P-16). Fertig, wenn: ein Update mit falschem Hash oder falscher
    Signatur nicht aktiv wird und ein richtiges aktiv wird (Playwright-Test).
  - [x] Teil b: offline lesbar – Geheimtexte und der verpackte AK auf dem Gerät, Entsperren ohne
    Server (P-22). Fertig, wenn: Entsperren und Lesen offline als Playwright-Test (desktop und
    `@phone`) laufen, ein Test IndexedDB nach den bekannten Klartexten und der Passphrase durchsucht
    und nichts findet, Abmelden die Kopie löscht und ein Server, der eine ältere Version, ein
    älteres Log oder einen älteren Kontozustand liefert, das Gerät nicht zurückwirft (Vitest).
- [x] **K-309 CSP und Sicherheits-Kopfzeilen** – strenge Content Security Policy und die übrigen
  Kopfzeilen für die Web-App, das CI-Gate „CSP“ aus dem Projektplan (nachgetragen).
  nach: K-308. Fertig, wenn: der Server die gebaute Web-App auf Wunsch selbst ausliefert
  (`KENNWORT_WEB_ROOT`) und jede Seite (`/`, tiefe Pfade, `/s/<id>`) und jede Datei des Builds die
  Policy ab `default-src 'none'` samt `nosniff`, `no-referrer`, COOP, CORP, `X-Frame-Options`,
  Permissions-Policy und, hinter https, HSTS und `upgrade-insecure-requests` trägt, seine eigenen
  Antworten dieselben Kopfzeilen mit einer Sandbox-Policy (Server-Test je Kopfzeile); der Service
  Worker dieselben Kopfzeilen auf jede Antwort aus seinen Caches setzt (Vitest und Playwright);
  `e2e/csp.spec.ts` (desktop und `@phone`) Einrichten, Eintrag, Entsperren und Einmal-Link ohne
  einen einzigen Verstoß oder Konsolenfehler durchläuft und ein eingeschleustes Inline-Skript
  blockiert sieht; alle E2E-Tests gegen den Server mit Build laufen; jede Direktive mit Grund und
  die Hinweise für Betreiber in `docs/sicherheitsdesign.md` (P-16) und eine Zeile in `docs/plan.md`
  stehen. Die Extension bleibt unverändert (eigene CSP).

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
- [x] **K-402 Popup** – entsperren, Treffer für die Seite, Suche, Favoriten, Generator.
  Fertig, wenn: Playwright mit der geladenen Extension in einem echten Chromium gegen den e2e-Server
  ein Konto verbindet und entsperrt, für den Host einer Testseite den passenden Eintrag zeigt und
  für einen anderen Host keinen (exakter Host, ohne Subdomains), Benutzername und Passwort kopiert,
  sucht (nie in geheimen Werten), Favoriten filtert, ein Passwort erzeugt und sperrt – auf Deutsch
  und Englisch, und axe nichts findet; entsperrte Schlüssel und das Sitzungs-Token nur in
  `chrome.storage.session` liegen und beim Sperren und nach Ablauf der Sperrzeit daraus verschwinden
  (Test); die Extension nichts ausfüllt.
- [x] **K-403 Inline-Menü und Ausfüllen** – Extension-iFrame im geschlossenen Shadow DOM, Ausfüllen
  nur nach Klick oder Enter, exakter Host per `tldts`, nie in fremden Frames.
  Fertig, wenn: Playwright mit geladener Extension Phishing-Domain, fremdes iFrame und überdecktes
  Menü abwehrt.
- [x] **K-404 Speichern und Aktualisieren** – neues Login und geändertes Passwort erkennen.
  Fertig, wenn: Playwright mit geladener Extension gegen den e2e-Server ein neues Login auf einer
  Testseite nach einem echten Absenden zum Speichern anbietet, es verschlüsselt im gewählten Tresor
  speichert und das Popup es zeigt; ein geändertes Passwort als Aktualisieren anbietet und das alte
  danach unter den früheren Passwörtern steht; dasselbe Passwort, ein verstecktes Passwortfeld und
  ein Absenden per Skript (`form.submit()` ohne Nutzeraktion) nichts anbieten; „Nie für diese Seite“
  im verschlüsselten Kontozustand landet und danach nichts mehr angeboten wird; eine verdeckte
  Leiste nichts speichert. Das Passwort geht nur vom Content Script an den Service Worker, liegt nur
  in dessen Arbeitsspeicher (nie in `chrome.storage.local` oder im DOM der Seite) und verfällt nach
  kurzer Zeit (Test); Leser und Tresore mit ausstehendem Schlüsselwechsel speichern nichts.
- [x] **K-405 Phishing-Warnung** – Warnung beim Eintippen eines gespeicherten Passworts auf fremder
  Domain.
  Fertig, wenn: Playwright mit geladener Extension gegen den e2e-Server warnt, sobald jemand das
  gespeicherte Passwort eines Eintrags auf einer ähnlich aussehenden Domain selbst eintippt und das
  Feld verlässt oder absendet – oben rechts, ohne die Seite zu sperren, mit „Das ist nicht <Host> –
  trotzdem fortfahren“, „Passwort ändern“ und einem Link zum Eintrag, auf Deutsch und Englisch –,
  aber nicht auf dem exakten Host eines Eintrags mit diesem Passwort, nicht bei einem anderen
  Passwort, nicht in einem versteckten Feld, nicht für einen Wert, den die Seite selbst einsetzt,
  und nicht gesperrt; eine verdeckte oder durchsichtig gemachte Warnung kommt wieder nach oben und
  „trotzdem fortfahren“ zählt verdeckt nicht. Das Content Script hält keine gespeicherten Passwörter
  und schickt dem Service Worker nur einen kurzen, gesalzenen, langsamen Hash (F-10, Testvektoren)
  des getippten Werts, nie den Wert selbst und nie etwas an den Server; die Hashes liegen nur
  entsperrt in `chrome.storage.session` und verschwinden beim Sperren und nach der Sperrzeit (Test);
  weder `chrome.storage.local` noch der Sitzungsbereich enthalten Passwort oder Host im Klartext.
- [x] **K-406 Passkey-Anbieter** – Passkeys in Kennwort speichern und damit anmelden.
  Fertig, wenn: Playwright mit geladener Extension gegen den e2e-Server auf einer Testseite, die
  mit SimpleWebAuthn prüft, einen Passkey anlegt (ES256 aus `@noble/curves`, Attestation „none“,
  verschlüsselt als Eintrag der Art „Passkey“ im gewählten Tresor) und sich damit anmeldet, beides
  erst nach einem echten Klick in die sichtbare, unverdeckte Leiste; eine fremde Domain, die die
  rpId einer anderen beansprucht, `SecurityError` bekommt; ein fremdes iFrame, gesperrtes Kennwort,
  „Anderes Gerät verwenden“ und kein passender Passkey an das WebAuthn des Browsers zurückgeben; eine
  verdeckte Leiste nichts signiert. Das Skript in der Seite erfährt nur das Ergebnis der Zeremonie,
  die der Nutzer bestätigt hat, und erreicht den Service Worker nur über das Content Script; der
  private Schlüssel liegt nur im verschlüsselten Eintrag und beim Signieren im Arbeitsspeicher der
  Leiste. Der Schlüssel hat ein Format mit Version (F-12) und Testvektoren aus `node:crypto`, die
  WebAuthn-Strukturen bestehen die Prüfung von SimpleWebAuthn in Vitest, Texte auf Deutsch und
  Englisch.
- [x] **K-407 Firefox für Android und Safari** – Build und Tests je Browser.
  Fertig, wenn: `build:firefox` den Firefox-Build für Desktop und Android baut (`gecko` mit fester
  ID ab 140, `gecko_android` ab 142, Hintergrundskript) und `addons-linter` ihn ohne Fehler prüft,
  `build:safari` nach `dist/safari` den Ordner für `xcrun safari-web-extension-converter` baut
  (Service Worker, Safari ab 18, ohne `use_dynamic_url`), jeder Build sein fertiges Manifest prüft
  (gleiche vier Berechtigungen, keine Hosts, kein Schlüssel eines anderen Browsers), Vitest die
  Manifeste je Browser prüft, der Service Worker Menü und Leiste unter `moz-extension:` und
  `safari-web-extension:` annimmt und der Server CORS für Safaris Herkunft beantwortet, das Popup
  ohne `windows`-API (Firefox für Android, Safari auf iOS) die Seite findet und zum Entsperren
  notfalls einen Tab öffnet, Playwright in Firefox und WebKit (`e2e/engines`, in CI nebeneinander)
  das gebaute Popup des jeweiligen Builds gegen den e2e-Server entsperren und sperren lässt und
  den Code von Content Script und Service Worker beim Ausfüllen prüft (exakter Host, kein fremder
  Frame, nur auf echten Klick, nichts bei verdecktem oder durchsichtigem Menü, nichts in versteckte
  Felder, kein IntersectionObserver v2 außerhalb von Chromium), und `docs/extension.md`,
  `docs/sicherheitsdesign.md` (P-17, „Je Browser“) und `docs/plan.md` Unterschiede, Restrisiken
  und die Schritte einer Person (Xcode, Signatur, App Store, Android-Gerät) beschreiben.
- [x] **K-408 Reproduzierbarer Build** – zweimal bauen, Hashes vergleichen, in CI.
  Fertig, wenn: `bun run reproducible` denselben Commit zweimal sauber baut, das zweite Mal in
  anderer Zeitzone und Locale, jede Datei per SHA-256 vergleicht und mit der Liste der
  abweichenden Dateien (bei Text mit der ersten abweichenden Zeile) fehlschlägt; die Web-App samt
  `release.json` und `release.sig`, die Extension für Chrome, Firefox und Safari und der
  kompilierte Server Byte für Byte gleich sind; die Folgenummer des Release-Manifests ohne
  `SOURCE_DATE_EPOCH` aus der Commit-Zeit entlang der Geschichte kommt statt aus der Bauzeit, mit jedem Commit wächst; `--release` die Web-App
  mit einem veröffentlichten `release.json` vergleicht (Version und jeder Hash); der `unit`-Job in
  CI nach `bun run build` mit `bun run reproducible --reuse` einen zweiten Build vergleicht, ohne
  neuen Job; Vitest die reinen Teile prüft und `docs/sicherheitsdesign.md` (P-16), `docs/plan.md`
  und `docs/extension.md` beschreiben, wie jeder nachbaut und vergleicht.

## Phase 5 – Import und Export

- [x] **K-501 Import-Ablauf** – Anbieter wählen, Anleitung, Vorschau mit Zuordnung, Duplikate,
  Markierung schwacher Passwörter, Hinweis zum Löschen der Datei.
  Fertig, wenn: die Seite „Importieren“ (aus den Einstellungen) jeden Anbieter aus
  `IMPORT_FORMATS` und „Andere Tabelle (CSV)“ mit Anleitung auf Deutsch und Englisch anbietet, die
  Datei nur auf dem Gerät liest (keine Anfrage trägt ihren Inhalt), jeden `ImportError` als
  verständlichen Text zeigt, für „Andere Tabelle“ die Spalten zuordnen lässt, die Vorschau Anzahl
  je Art, Titel, Benutzername und Adresse zeigt (nie ein Geheimnis), Ziel-Tresor und Ordner als
  Tags wählen lässt, Duplikate (gleicher Titel, Benutzername und Adresse) markiert und überspringt,
  bis man sie trotzdem nimmt, schwache Passwörter nach der Regel von K-306 markiert, über den
  normalen Schreibweg der Einträge in Stapeln mit Fortschritt schreibt (nichts bei
  `rotation-due` oder offline) und danach zum Löschen der Exportdatei auffordert und auf „Zum
  Ändern“ verweist; der Klartext der Datei verschwindet mit dem Ablauf; Vitest dafür, und
  Playwright desktop und `@phone` importiert ein Bitwarden-JSON und ein Chrome-CSV, überspringt
  ein Duplikat, markiert ein schwaches Passwort, zeigt den Hinweis zum Löschen und ordnet bei
  „Andere Tabelle“ Spalten zu.
- [x] **K-502 Parser** – je Format aus dem Projektplan eine reine Funktion in `packages/core`.
  Fertig, wenn: je Anbieter echte, anonymisierte Fixtures bestehen und Fuzzing ohne Absturz läuft.
  In Teilen, je ein Pull Request; abgehakt wird K-502, wenn alle stehen:
  - [x] Teil 1: Textformate – Bitwarden JSON und CSV, LastPass CSV, 1Password CSV, KeePass-2-XML,
    KeePassXC- und KeePass-CSV, Passbolt CSV, Dashlane CSV, Proton Pass JSON, Keeper CSV,
    NordPass CSV, Enpass JSON, Chrome/Edge, Firefox und Safari CSV, beliebige Tabelle mit
    Spaltenzuordnung (`packages/core/src/import/`). Fertig, wenn: je Format Fixtures mit der
    echten Struktur (Weber Haustechnik; Anführungszeichen, Zeilenumbrüche in Notizen, BOM, CRLF,
    leere Felder, Unicode) bestehen, Fuzzing mit fast-check (Zufallstext, Zufallsbytes, kaputte
    Fixtures, tiefe Verschachtelung) ohne Absturz und Hänger läuft und die Mutation-Tests der
    neuen Dateien bei 100 % stehen.
  - [x] Teil 2: ZIP-Container – 1Password 1PUX, Dashlane- und Proton-Pass-ZIP, entpackt mit
    `DecompressionStream` (asynchron) und eigenem ZIP-Verzeichnis. Fertig, wenn: je Anbieter ein
    ZIP-Fixture besteht, auch mit gespeicherten und komprimierten Dateien, und kaputte ZIPs
    (falsche Längen, Zip-Bomben über eine Größengrenze) als Fehler enden.
  - [x] Teil 3: KDBX 4 – Header, HMAC-Blöcke, Argon2d/id, AES-256 und ChaCha20 aus `@noble` in
    `packages/crypto`, Rahmung und Gzip (`DecompressionStream`) in `packages/core`, innerer Strom
    (ChaCha20) für geschützte Werte, dann der KeePass-XML-Parser; auch Passbolts KDBX. Fertig,
    wenn: Fixtures aus KeePassXC und KeePass 2 (Passwort, Schlüsseldatei) bestehen, falsches
    Passwort und geänderte Bytes als Fehler enden, Testvektoren für die Bausteine bestehen.
  - [x] Teil 4: Verschlüsselte Fremdexporte – Bitwardens verschlüsseltes und passwortgeschütztes
    JSON (PBKDF2/Argon2id, AES-CBC mit HMAC). Fertig, wenn: Fixtures mit Testvektoren aus
    Bitwardens Exporten bestehen und ein falsches Passwort als Fehler endet.
  - [x] Teil 5: Team Password Manager CSV (Projekte als Tresore) nach dessen Export-Doku und
    FIDO Credential Exchange (CXF), sobald der Standard stabil ist. Fertig, wenn: je Format
    Fixtures mit der echten Struktur bestehen und das Fuzzing sie einschließt. CXF ist seit dem
    14.08.2025 Proposed Standard der FIDO Alliance (Errata 09.03.2026, geprüft am 22.11.2026) und
    damit stabil genug; gelesen wird das unverschlüsselte JSON, CXP nicht.
- [x] **K-503 Authenticator-Import** – otpauth-migration-QR, Aegis, 2FAS, Microsoft.
  Fertig, wenn: je App ein Parser in `packages/core/src/import/` jedes TOTP-Konto als Login mit
  otpauth-Link (Schlüssel, Aussteller, Konto, Algorithmus, Ziffern, Dauer) liefert, was Kennwort
  nicht berechnet (HOTP, Steam, …), überspringt und zählt, verschlüsselte Exporte als `encrypted`
  meldet, die Codes dem passenden Login zugeordnet werden können (Projektplan) und Fixtures,
  Fuzzing und Mutation-Tests wie bei K-502 bestehen. In Teilen, je ein Pull Request; abgehakt wird
  K-503, wenn alle stehen. Abgehakt mit Teil 1 und 2: Teil 3 (Microsoft) ist nicht zu bauen,
  solange Microsoft keinen Export hat, und steht deshalb unter „Zurückgestellt“:
  - [x] Teil 1: Google Authenticator, Aegis und 2FAS. Fertig, wenn: Fixtures (Weber Haustechnik)
    für Googles Export aus zwei QR-Codes, Aegis-JSON und 2FAS-Backup, unverschlüsselt und
    verschlüsselt, bestehen; Googles `MigrationPayload` ein eigener Protobuf-Leser ohne neues
    Paket liest; QR-Codes eines Exports (`batch_id`, `batch_index`, `batch_size`) in jeder
    Reihenfolge zusammenkommen, doppelte einmal zählen und fehlende als `incomplete` enden; die
    Import-Seite die QR-Codes mit dem QR-Scanner von K-306 (Kamera oder Screenshot) liest oder
    die eingefügten Links nimmt, „1 von 2 QR-Codes gelesen“ zeigt und in der Vorschau sagt, wie
    viele Codes draußen bleiben; Anleitungen auf Deutsch und Englisch; Fuzzing mit fast-check je
    Parser und für den Protobuf-Leser ohne Absturz und Hänger läuft; die Mutation-Tests der neuen
    Dateien bei 100 % stehen; Playwright desktop und `@phone` einen Google-Export aus zwei
    QR-Code-Screenshots und ein 2FAS-Backup importiert.
  - [x] Teil 2: Codes dem passenden Login zuordnen. Fertig, wenn: die Vorschau zu jedem Code aus
    einer Authenticator-App den Login im Ziel-Tresor mit gleichem Dienst (Titel oder Host der
    Adresse) und Benutzernamen vorschlägt, der Code auf Wunsch dort ins Feld „Einmalcode“ kommt,
    statt einen eigenen Login anzulegen, ein vorhandener anderer Code nie still überschrieben
    wird und Vitest und Playwright desktop und `@phone` das prüfen.
  - [ ] Teil 3: Microsoft Authenticator. Hat keinen Export (Stand 11/2026): Die Sicherung geht nur
    in Microsofts Cloud und nur zurück in Microsoft Authenticator; Aegis liest die App-Datenbank
    (`PhoneFactor`) nur mit Root-Rechten auf Android. Fertig, wenn: Microsoft einen dokumentierten
    Export anbietet und Kennwort ihn wie Teil 1 liest; bis dahin sagt die Doku, die Codes bei den
    Diensten neu einzurichten. Steht unter „Zurückgestellt“.
- [x] **K-504 Export** – verschlüsseltes JSON, CSV, KDBX; nur Verwalter, im Audit-Log.
  Fertig, wenn: die Seite „Exportieren“ (aus den Einstellungen) nur Inhabern und Admins der Firma
  erscheint und einen Tresor oder alle, die das Gerät öffnen kann, als verschlüsseltes JSON (F-13:
  Argon2id und XChaCha20-Poly1305 aus `packages/crypto`, Version im Format, Testvektoren aus einem
  unabhängigen Generator), als CSV mit den Spalten von Bitwarden (mit deutlicher Warnung vor dem
  Klartext) oder als KDBX 4 (Argon2id, ChaCha20, mit denselben Bausteinen wie der Leser aus K-502
  Teil 3) schreibt; das JSON trägt alle Felder, Verlauf, Tags, Favoriten, Einmalcodes und Passkeys
  und lässt sich als eigener Eintrag in `IMPORT_FORMATS` wieder importieren; vor dem Schreiben ein
  signiertes Audit-Ereignis `export` (wer, Umfang, Format, wann) beim Server liegt, den der Server
  nur von Inhabern und Admins annimmt; die Datei auf dem Gerät entsteht und direkt als Download
  geht (Blob, URL sofort widerrufen) und nichts außer dem Audit-Ereignis zum Server geht;
  Rundläufe aller drei Formate (KDBX auch mit `keepassxc-cli`, wo vorhanden), Fuzzing des
  F-13-Lesers, Mutation-Tests der geänderten Dateien in `packages/crypto` und `packages/core` bei
  100 % und Playwright desktop und `@phone` bestehen: ein Admin exportiert ein verschlüsseltes JSON
  und importiert es wieder, ein Mitglied sieht keinen Export, und das Audit-Log nennt den Export.

## Phase 6 – Team-Funktionen

- [x] **K-601 Einmal-Links** – mit Ablauf und begrenzten Abrufen.
  Fertig, wenn: ein Mitglied aus einem Eintrag (Felder mit Wert, nie ein TOTP-Schlüssel, nur wo es
  bearbeiten darf) oder für freien Text einen Link erstellt, mit Ablauf bis sieben Tage, 1 bis 10
  Abrufen und optionaler Passphrase; der Client nach F-15 verschlüsselt (eigenes 256-Bit-Geheimnis
  nur im Fragment, Argon2id für die Passphrase, Version im Format, Testvektoren aus einem
  unabhängigen Generator, Property-Tests, Mutation-Tests der neuen Dateien in `packages/crypto` und
  `packages/core` bei 100 %); der Server nur Geheimtext, Ablauf und Abrufe hält, mit Sitzung,
  Grenzen und Ratenbegrenzung annimmt, einen Abruf ohne Konto atomar abzieht (auch bei vielen
  gleichzeitigen), danach und nach dem Ablauf mit 404 antwortet und löscht, unbekannte, falsche,
  abgelaufene und widerrufene IDs nicht unterscheidet, nur den Ersteller widerrufen lässt und
  Erstellen, Abruf und Widerruf ohne Geheimnis ins Audit-Log schreibt (Test je Punkt); die Seite
  `/s/<id>` das Fragment sofort aus der Adresse nimmt, erst nach „Anzeigen“ abruft, ohne Konto,
  ohne Referrer und auf Deutsch und Englisch; „Einstellungen → Einmal-Links“ die eigenen Links mit
  Widerruf zeigt; ein Test des bösartigen Servers zeigt, dass er Geheimnis und Inhalt nie sieht;
  Playwright desktop und `@phone`: Jonas erstellt einen Link mit zwei Abrufen, eine Vorschau
  verbraucht keinen, ein Externer öffnet ihn zweimal, beim dritten Mal „abgelaufen“, das Fragment
  ist weg und nichts Geheimes erreicht den Server; dazu Passphrase und Widerruf.
- [x] **K-602 Benachrichtigungen** – in der App, Web-Push, optional Mail.
  Fertig, wenn: der Server je Konto Mitteilungen nur aus Ereignissen schreibt, die er ohnehin
  bearbeitet (Zugriffsanfrage an die Verwalter, Aufnahme in einen Tresor, erstmals geteilter
  Eintrag, angenommene Einladung an ihren Ersteller, neue Schlüssel an Inhaber und Admins, neuer
  Firmenschlüssel an alle, Bitte um Notfallzugriff an den Gebenden, Antwort und erste Freigabe an die
  Vertrauensperson, Wiederherstellung durch einen Inhaber, abgerufener Einmal-Link an seinen
  Ersteller; dazu die Art `security-report` als Haken für K-603), mit Art und IDs und nie mit einem
  Namen, nie an den Auslöser, an Ausgetretene oder eine andere Firma (Test je Ereignis und ein Test,
  dass keine Zeile einen Namen trägt); die Routen nur die eigenen Zeilen lesen, als gelesen markieren
  und löschen (Test je Route im Mandanten-Test); ein SSE-Strom je Konto nur „neu“ sagt; die Glocke
  in Rail und Tab-Leiste den Zähler zeigt, die Seite „Mitteilungen“ mit den Namen, die das Gerät
  selbst kennt, auf Deutsch und Englisch; Web-Push leer (RFC 8030) mit VAPID (RFC 8292, ES256 per
  WebCrypto, das JWT mit `node:crypto` geprüft), der VAPID-Schlüssel beim ersten Start entsteht und
  Tests einen festen nehmen, Push nur nach einem Klick, je Art wählbar, nur an die Push-Dienste der
  Browser (SSRF), ein Abo bei 404/410 oder mit seiner Sitzung endet (Tests gegen einen nachgebauten
  Push-Dienst); der Service Worker einen festen Text in der Sprache des Browsers zeigt und
  Release-Signatur und Nachbau (K-408) weiter bestehen; P-24 im Sicherheitsdesign, eine Seite für
  Nutzer und Betreiber; Playwright desktop und `@phone`: Anna nimmt Jonas' Einladung an und fragt
  Zugriff auf Büro an, beides erscheint live in Jonas' Glocke, „Gelesen“ und das Öffnen leeren den
  Zähler. Mail ist zurückgestellt (unten).
- [x] **K-603 Sicherheits-Übersicht** – schwache, mehrfache, geleakte Passwörter (k-Anonymität),
  monatlicher Bericht; „Zum Ändern“ mit `/.well-known/change-password`.
  Fertig, wenn: die Seite „Sicherheit“ (Einstellungen, Seitenleiste ab `lg`) Zahlen und Listen der
  schwachen und mehrfachen Passwörter nach der Regel von K-306, der geleakten und der markierten
  Einträge der eigenen Tresore zeigt, nie ein Passwort; „Jetzt ändern“ je Zeile
  `/.well-known/change-password` der Website in neuem Tab mit `noopener,noreferrer` öffnet (Port,
  IDN, IP-Adressen und Namen ohne Punkt auf die Startseite, andere Schemata ohne Knopf; Vitest);
  die Datenleck-Prüfung je Person aus ist, bis sie sie einschaltet (Wahl versiegelt im
  Kontozustand, spätere Wahl gewinnt, bei Gleichstand „aus“), ohne Einschalten keine Anfrage
  hinausgeht (Vitest und Playwright), nur die ersten fünf Hex-Zeichen von SHA-1 (`@noble/hashes`,
  Testvektoren) an den eigenen Server gehen, der nur genau fünf große Hex-Zeichen annimmt, mit
  `Add-Padding: true` beim eingestellten Dienst fragt (`KENNWORT_PWNED_URL`, Spiegel oder `off`),
  den Bereich eine Stunde im Speicher hält, je Konto begrenzt und kein Präfix ins Log schreibt
  (Server-Tests), und das Gerät die Suffixe vergleicht, Polsterzeilen auslässt und je Präfix im
  Speicher behält (Vitest); Inhaber und Admins einmal im Monat einen Bericht mit Zahlen je Tresor
  ohne Titel sehen, bis sie ihn als gelesen markieren (Monat im Kontozustand); Mutation-Tests der
  neuen und geänderten Dateien in `packages/crypto` und `packages/core` bei 100 %; Playwright
  desktop und `@phone` mit einem Ersatz-Dienst: die Übersicht zeigt ein schwaches, ein mehrfaches
  und nach dem Einschalten ein geleaktes Passwort, „Jetzt ändern“ öffnet die well-known-Adresse,
  der Bericht verschwindet nach „Gelesen“ auch nach dem Neuladen. Zustellung des Berichts per Push
  oder Mail kommt mit K-602.
- [x] **K-604 OpenID Connect und SCIM** – allgemeiner OIDC-Client mit groups-Claim, Gruppenwechsel
  als Anfrage, optional SCIM, Deep Links.
  Fertig, wenn: der Server mit `KENNWORT_OIDC_*` einen Anmeldedienst per Discovery anspricht (der
  Issuer muss genau passen, TLS außer auf dem eigenen Rechner), mit Authorization Code, PKCE (S256),
  `state`, `nonce` und einem Cookie gegen Login-CSRF anmeldet und das ID-Token mit WebCrypto prüft
  (nur RS256, PS256, ES256, EdDSA; `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`, Schlüssel aus dem
  JWKS nach `kid`, einmal neu geladen), ohne neues Paket; falscher Issuer, falsche Audience,
  abgelaufenes Token, falsche Nonce, `none`, HS256 mit dem öffentlichen Schlüssel, unbekannter
  `kid`, falsche Signatur, fremdes oder fehlendes Cookie, wiederholter Rückruf und wiederholter Code
  scheitern (Server-Tests gegen einen nachgebauten Anmeldedienst); ein Konto nur über Issuer und
  `sub` gefunden und nur aus der eigenen Sitzung verknüpft wird, nie über die Mail-Adresse; ein
  bestehendes Konto vom Anmeldedienst keine Sitzung bekommt, nur seine ID, und weiter mit der
  Passphrase entsperrt; eine unbekannte Person nur in einer Firma, deren Inhaber oder Admin es
  erlaubt hat, ein Konto als Mitglied ohne Zertifikat und ohne Tresor anlegt (Wurzelschlüssel beim
  ersten Kontakt, Inhaber und Admins bekommen `member-enrolled`) und erst nach dem Vergleich zweier
  Codes (Bündel und Firma) als Mitglied zertifiziert wird (`certifyEnrolled`, Mutation-Tests der
  geänderten Dateien in `packages/core` bei 100 %); eine Gruppe gleichen Namens im groups-Claim
  (Name des Claims einstellbar) nur Zugriffsanfragen mit `access-requested` an die Verwalter
  anlegt, eine nicht mehr genannte Gruppe ihre Anfragen zurücknimmt und den Verwaltern eines Tresors,
  in dem die Person noch ist, `group-left` meldet, und von Hand vergebene Gruppen bleiben; ein Test
  des bösartigen Anmeldedienstes zeigt, dass eine gemeldete Gruppe keinen Tresor, kein Log und keinen
  Schlüssel gibt; `/open` Deep Links `web+kennwort:` (`protocol_handlers`) nur mit IDs auf Tresor und
  Eintrag führt; Einstellungen → Anmeldedienst Verknüpfen, Aufnahme, Link zum Beitreten und die
  Gruppen zeigt, auf Deutsch und Englisch; P-25 und P-26 im Sicherheitsdesign, Entscheidungen im
  Projektplan, eine Seite für Nutzer und Betreiber mit Keycloak, Authentik und Entra ID; Playwright
  desktop und `@phone` mit dem nachgebauten Anmeldedienst: Sandra tritt über den Link bei, Jonas
  bestätigt sie erst nach dem Codevergleich, eine später gemeldete Gruppe erscheint bei Jonas als
  Anfrage, und ein Deep Link öffnet einen Tresor erst nach dem Entsperren. SCIM ist zurückgestellt
  (unten).
- [x] **K-605 Handwerk und IT-Dienstleister** – QR-Etiketten, Übergabe an den Kunden, mehrere Firmen
  in einem Konto.
  Fertig, wenn: ein Eintrag unter „Etikett“ ein QR-Etikett mit frei wählbarer Beschriftung in
  62 × 29, 89 × 36 oder 50 × 50 mm druckt, nur das Etikett auf einer Seite seiner Größe (benannte
  `@page`), dessen Code auf dem Gerät mit `uqr` entsteht und nur die https-Adresse
  `/vaults/<tresor>/<eintrag>` mit zwei IDs trägt, nie Passwort, Benutzername oder Titel (Vitest mit
  jsQR, der den Code zurückliest), und den Eintrag erst nach dem Entsperren öffnet (P-26); ein Konto
  mehrere Firmen hat, je Firma ein eigenes Konto mit eigenem AK, Schlüsseln, Zertifikat und Logs,
  deren Zugänge (Konto-ID, Secret Key, eine nie gezeigte Passphrase aus 32 Zufallsbyte) versiegelt im
  Kontozustand des Stammkontos liegen (`linked`, Grabstein beim Entfernen gewinnt beim
  Zusammenführen, Mutation-Tests von `linked.ts` und `state.ts` bei 100 %), beigetreten per
  Einladungslink (MAC und Wurzel-Fingerabdruck wie P-08) oder angelegt mit dem Einrichtungs-Code, nur
  vom Stammkonto aus und den Zugang vor dem Konto geschrieben (und bei einem Fehler wieder entfernt);
  „Einstellungen → Firmen“ und die Seitenleiste wechseln, das Stammkonto bleibt im Speicher, das
  Sperren überschreibt beide, die Offline-Kopie hält nichts aus einer anderen Firma (Vitest); der
  Server keine Daten einer Firma in die Sitzung der anderen Firma derselben Person gibt und eine
  Anmeldung von einem Gerät die Sitzung des anderen Kontos nicht beendet (Mandanten-Test mit echter
  Anmeldung), und eine über OpenID Connect bekannte Person über den Link einer anderen Firma nur ihr
  Konto genannt bekommt, keine Aufnahme (Server-Test); eine Übergabe den Tresor auf dem Gerät
  entschlüsselt, in der Firma des Kunden einen neuen Tresor anlegt, jeden Eintrag neu verschlüsselt
  und signiert, die Person des Kunden nach dem gemerkten Wurzelschlüssel als Verwalter aufnimmt und den
  Handwerker auf „bearbeiten“ setzt (nicht „lesen“, sonst gälten seine Einträge nicht mehr, P-09), der
  Server dabei nur bekommt, was jeder neue Tresor bringt, und ein Test des bösartigen Servers zeigt,
  dass sich der Handwerker danach nicht selbst zum Verwalter macht und ein zurückgespieltes oder
  gegabeltes Log auffällt; Texte de/en, P-27 im Sicherheitsdesign, Entscheidungen im Projektplan,
  eine Seite für Nutzer und das README; Playwright desktop und `@phone`: Jonas druckt ein Etikett für
  den Router der Heizung, dessen Adresse erst nach dem Entsperren öffnet, tritt Müller Elektro mit
  seinem Konto bei, wechselt die Firmen, übergibt den Tresor „Heizung Müller“ an Max, der ihn
  verwaltet, den Eintrag sieht und Jonas danach entfernt.
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

- **K-503 Teil 3 Microsoft Authenticator** – nicht gescheitert, aber nicht zu bauen: Die App hat
  keinen Export, nur eine Sicherung in Microsofts Cloud, die sich nur in Microsoft Authenticator
  wiederherstellen lässt (Aegis' `MicrosoftAuthImporter` liest die Datenbank nur mit Root).
  Wieder aufnehmen, sobald Microsoft einen Export dokumentiert.
- **K-602 Mitteilungen per Mail** – nicht gescheitert, aber bewusst ausgelassen: Der Server kennt
  keine Mail-Adressen (Konten haben nur IDs, die Adresse bei Better Auth ist ein Platzhalter). Mail
  bräuchte neue persönliche Daten mit Bestätigung der Adresse und einen SMTP-Client über Buns
  TCP/TLS ohne Paket; das ist mehr Angriffsfläche als Nutzen, solange Glocke und Push reichen.
  Wieder aufnehmen mit einer Kontaktadresse je Konto (etwa aus OpenID Connect, K-604): dann
  `KENNWORT_SMTP_*`, aus und nur mit einem festen Text und einem Link zur App, und `mail` als
  zweiter Kanal neben `push` in den Einstellungen.

- **K-604 SCIM** – nicht gescheitert, aber bewusst ausgelassen: Mit Ende-zu-Ende-Verschlüsselung
  kann der Server ein Konto weder wirklich anlegen (die Schlüssel macht das Gerät) noch entfernen
  (den Schlüsselwechsel macht der Client eines Verwalters, K-307). SCIM (RFC 7643/7644) brächte
  Tokens je Firma, eine zweite Schnittstelle, über die Konten entstehen, und am Ende nur Markierungen,
  die ein Admin ohnehin selbst ausführt. Wieder aufnehmen, wenn ein Betrieb es braucht: `/scim/v2`
  mit `Users` und `Groups`, Bearer-Token je Firma (nur als Hash gespeichert), Gruppen wie beim
  groups-Claim als Anfragen und `active=false` als Markierung „aus der Firma entfernen“ mit Mitteilung
  an Inhaber und Admins.

## Schritte für Menschen

Nicht auf dem Weg des Loops; alles erst nach der letzten Phase.

- [ ] Default-Branch auf `main`, GitHub Pages mit Domain kennwort.app
- [ ] **iOS-App** (nicht im Loop, auf einem Mac): AutoFill-Credential-Provider-Extension mit
  Passkeys und Schlüsselbund in Xcode, Signatur, App Store
- [ ] Signatur-Schlüssel für Release-Manifest, Extension und Apps
- [ ] Store-Einreichungen und Antworten auf Reviews
- [ ] Pilotbetrieb bei einem echten Betrieb
- [ ] Externes Audit vor der Veröffentlichung
