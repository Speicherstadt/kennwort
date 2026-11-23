---
title: Handy und App
description: >-
  Kennwort am Handy: die Web-App zum Installieren (PWA), die Extension in Firefox für Android und
  die App für Android (Alpha, noch ohne Release) mit systemweitem Ausfüllen; iOS folgt.
---

# Handy und App

Am Handy gibt es Kennwort auf zwei Wegen, dauerhaft nebeneinander: die Web-App, die du ohne App
Store installierst, und eine App für Android und iOS, die in allen Apps ausfüllt. In Firefox für
Android läuft zusätzlich die [Browser-Extension](extension.md).

| Angebot | Stand | Ausfüllen am Handy |
| --- | --- | --- |
| Web-App (PWA) | da | Kopieren mit einem Tipp |
| Extension in Firefox für Android ab 142 | da | Inline-Menü zeigt Treffer; kopieren aus dem Popup |
| App für Android und iOS | unter Android mit dem Server verbunden und mit Autofill-Dienst, noch ohne Release (letzte Bauphase) | unter Android in anderen Apps und Browsern; iOS und Passkeys folgen |

## Die Web-App

Öffne die Adresse deines Kennwort-Servers im Browser und installiere sie:

- **Android**: im Browsermenü **App installieren** oder **Zum Startbildschirm hinzufügen**.
- **iPhone und iPad**: in Safari **Teilen → Zum Home-Bildschirm**.

Am Handy zeigt Kennwort einen Bildschirm nach dem anderen und unten die Tab-Leiste. Die Web-App
nimmt nur Updates an, die vom Kennwort-Projekt signiert sind und Datei für Datei der Signatur
entsprechen; liefert dein Server etwas anderes aus, bleibt die bisherige Version aktiv
([Als App installieren](konto.md#als-app-installieren)). Ohne Verbindung entsperrst du trotzdem
und liest deine Einträge ([Ohne Verbindung](konto.md#ohne-verbindung)).

Die Web-App passt für Aushilfen, geteilte Geräte, Baustellen-Tablets und alle, die nichts
installieren wollen oder dürfen.

## Die App

Die App für Android und iOS ist die letzte Bauphase im [Projektplan](plan.md#handy-und-mobile-app).
Sie ist eine Tauri-3-App (3.0.0-alpha.6; Tauri 3 ist noch nicht stabil) in `apps/mobile`, die genau
den Build der Web-App zeigt, mit derselben Oberfläche und derselben
[Kryptografie](kryptografie.md).

### Stand

| Was | Android | iOS |
| --- | --- | --- |
| Verbindung zum eigenen Server | da | fehlt, kommt mit dem Bau auf dem Mac |
| Live-Sync von Mitteilungen und Tresoren | da | – |
| Ausfüllen in anderen Apps und Browsern | da (Autofill-Dienst) | AutoFill-Erweiterung mit Passkeys folgt |
| Zwischenablage leeren, Bildschirmschutz | da | kopiert wie die Web-App |
| Entsperren mit Fingerabdruck oder Gesicht | noch nicht (siehe [unten](#ausfullen-in-anderen-apps)) | noch nicht |
| Anmeldung über OIDC | noch nicht | noch nicht |
| Release | noch keins, nur Debug-APKs zum Testen | noch nie gebaut |

Bis zum ersten Release ist die Web-App der Weg am Handy.

### Mit dem Server verbinden

Beim ersten Start fragt die App nach der Adresse deines Kennwort-Servers, wie die
[Extension](extension.md): Sie steht in deinem Recovery-Kit, etwa
`https://kennwort.weber-haustechnik.de`. Nur HTTPS geht; die App merkt sich nur den Server selbst
(Schema, Host und Port), nicht den Pfad. Danach meldest du dich an wie in der Web-App.

Die App spricht von da an nur mit diesem einen Server. Die Oberfläche schickt ihre Anfragen nicht
selbst ins Netz, sondern an den Kern der App, und der sendet sie nur an den eingerichteten Server,
nur an dessen Schnittstelle und ohne einer Weiterleitung zu folgen; das Zertifikat prüft Android
wie bei jeder anderen App. Ihre Inhaltsrichtlinie erlaubt deshalb weiterhin keine Verbindung zu
irgendeinem Host. Für einen **anderen Server** löschst du die Daten der App (unter Android
**Einstellungen → Apps → Kennwort → Speicher → Daten löschen**) und richtest sie neu ein.

Neue Mitteilungen und Änderungen anderer kommen **live**, wie in der Web-App. Auch dafür öffnet
nicht die Oberfläche die Verbindung, sondern der Kern der App: nur zu den beiden Live-Strömen des
eingerichteten Servers, ohne Weiterleitung, und jede Nachricht darf höchstens 4 KiB groß sein und
nicht schneller kommen als 20 je Sekunde (kurz bis zu 200 auf einmal). Schickt der Server mehr,
beendet die App den Strom und verbindet nach einer Pause neu: erst nach 2 Sekunden, dann jeweils
doppelt so lange, höchstens nach 30 Sekunden. Beim Sperren und Abmelden schließt die App den Strom.
Protokolliert wird davon nichts.

Noch nicht in der App: die Anmeldung über den Identitätsanbieter deiner Firma (OIDC). Auf dem
iPhone fehlt die Verbindung noch ganz, sie kommt mit dem Bau auf dem Mac.

### Ausfüllen in anderen Apps

Unter Android füllt Kennwort Benutzername und Passwort in anderen Apps und in Browsern aus.
Einschalten: **Einstellungen → Passwörter, Passkeys und Konten** (je nach Gerät auch **System →
Sprachen und Eingabe → Autofill-Dienst**) und dort **Kennwort** wählen.

So läuft es:

1. Du tippst in ein Anmeldefeld. Android zeigt **Mit Kennwort ausfüllen**; noch steht nichts im
   Feld.
2. Du tippst darauf. Kennwort öffnet sich; ist es gesperrt, entsperrst du es wie gewohnt mit
   Passphrase.
3. Kennwort zeigt nur die Einträge, die genau für diese App oder Website gespeichert sind. Du
   wählst einen, und Kennwort springt zurück und füllt Benutzername und Passwort aus. Mit
   **Nicht ausfüllen** bleibt das Feld leer.

Welche Einträge passen:

- **Websites** im Browser (Chrome, Firefox, Edge, Brave, Samsung Internet und andere): nur der
  exakte Host, wie in der [Extension](extension.md), ohne Eltern- oder Subdomain. Eine Seite über
  http bekommt nichts, und ein Feld in einem eingebetteten Frame einer anderen Domain auch nicht.
- **Apps**: Trag im Eintrag als Website `android://` und den Paketnamen der App ein, etwa
  `android://com.heizungsapp.monteur`. Den Paketnamen siehst du in der Adresse der App im Play
  Store (`id=…`). Logins aus dem Passwort-Export von Chrome bringen ihn schon mit. Eine App
  bekommt nie die Einträge einer Website, auch wenn sie so heißt wie die Website.

Speichern: Tippst du ein neues Login in einer App oder auf einer Website ein, fragt Android, ob
Kennwort es speichern soll. Sagst du ja, öffnet Kennwort den Editor mit Benutzername, Passwort und
App oder Website; gespeichert wird erst, wenn du dort auf **Speichern** tippst.

Noch nicht: Entsperren mit Fingerabdruck oder Gesicht. Dafür müsste die App einen Schlüssel auf
dem Gerät ablegen, und das [Sicherheitsdesign](sicherheitsdesign.md#p-17-ausfullen) erlaubt das
erst mit einer eigenen, geprüften Regel. Einmal-Codes füllt Kennwort nicht aus; die kopierst du aus
dem Eintrag.

### Zwischenablage und Bildschirmschutz

Kopierst du ein Passwort, einen Einmalcode oder ein anderes Feld, leert Kennwort die
Zwischenablage nach 30 Sekunden wieder, aber nur, wenn dort noch genau dieser Wert liegt. Hast du
inzwischen etwas anderes kopiert, bleibt es unangetastet.

- **App unter Android**: Die Kopie ist als sensibel markiert; ab Android 13 zeigt das System
  dann keine Vorschau des Inhalts. Die App lässt keine Screenshots und Bildschirmaufnahmen zu, und
  in der Übersicht der zuletzt genutzten Apps erscheint sie leer. Android erlaubt das Lesen der
  Zwischenablage nur der App im Vordergrund: Bist du nach 30 Sekunden in einer anderen App, bleibt
  die Kopie liegen, bis Android sie selbst entfernt.
- **Web-App und Browser**: Kennwort liest die Zwischenablage nach 30 Sekunden zurück und leert sie,
  wenn noch der kopierte Wert darin liegt. Fragt der Browser dabei nach der Erlaubnis zum Einfügen
  oder ist die Seite nicht im Vordergrund, wird nichts geleert, damit nie eine fremde Kopie
  verschwindet.
- **App unter iOS**: kopiert vorerst wie die Web-App.

### Updates der App

Die App lädt nie Code von einem Server. Ihre Oberfläche liegt fertig gebaut in der App, und neue
Versionen kommen nur als ganzes App-Paket, signiert mit dem Schlüssel des Kennwort-Projekts: unter
Android als APK aus den GitHub-Releases (etwa über Obtainium oder ein F-Droid-Repo) oder aus dem
Play Store, auf dem iPhone aus dem App Store. Android und iOS nehmen ein Update nur an, wenn es mit
demselben Schlüssel signiert ist wie die installierte App. Darum hat die App
keinen Service Worker: Der Weg, auf dem die Web-App signierte Releases annimmt
([Als App installieren](konto.md#als-app-installieren)), gilt nur für die Web-App und bleibt dort
unverändert. Mit dem Server tauscht die App wie die Web-App nur verschlüsselte Daten.

Die Inhaltsrichtlinie (CSP) der App ist mindestens so streng wie die der Web-App: dieselben Regeln,
dazu nur der interne Kanal zwischen Oberfläche und App; der Server kommt darin nicht vor. Ein Test vergleicht beide bei jedem Lauf.

### Selbst bauen

Die App baut aus dem Repository heraus:

```sh
bun install
bun run --cwd apps/mobile build          # Web-App im Modus "mobile" nach apps/mobile/dist
bun run --cwd apps/mobile android:debug  # Debug-APK, braucht Android SDK, NDK und Rust
cd apps/mobile/src-tauri && cargo test --lib --no-default-features  # Regeln für den Server, ohne SDK
cd apps/mobile/src-tauri/gen/android && ./gradlew testUniversalDebugUnitTest  # Autofill-Logik, nach dem APK-Build
```

Für Android brauchst du Rust mit den Zielen `aarch64-linux-android` und `x86_64-linux-android`,
das Android SDK (`ANDROID_HOME`), das NDK (`NDK_HOME`) und ein JDK ab 17. Der Workflow „Android“
auf GitHub baut die Debug-APK bei jeder Änderung an `apps/mobile` und auf Knopfdruck
(**Actions → Android → Run workflow**); die APK liegt danach als Artefakt am Lauf. Sie ist mit dem
Debug-Schlüssel von Gradle signiert und nur zum Testen gedacht. Derselbe Lauf führt die
Unit-Tests des Autofill-Dienstes aus. Der Workflow „Android emulator“ startet nachts und auf
Knopfdruck einen Android-Emulator, wählt Kennwort als Autofill-Dienst und prüft, dass ein
Anmeldeformular den Vorschlag bekommt und vor dem Entsperren nichts ausgefüllt wird; er hält keinen
Merge auf. Das Ausfüllen nach dem Entsperren prüft vor einem Release eine Person auf einem echten
Handy.

### iOS auf einem Mac

Die iOS-App baut kein automatischer Lauf; das macht ein Mensch auf einem Mac. Das Projekt in
`apps/mobile/src-tauri/gen/apple` ist aus der Vorlage von Tauri angelegt, aber noch nie gebaut.
Auf dem Mac:

1. Xcode, die Xcode-Kommandozeilenwerkzeuge, [XcodeGen](https://github.com/yonaskolb/XcodeGen),
   Bun und Rust mit `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` installieren.
2. Im Repository `bun install`, dann in `apps/mobile` `bun run tauri ios init`. Das erzeugt das
   Xcode-Projekt neu aus `project.yml`; Änderungen gegenüber dem Stand im Repository prüfen und nur
   übernehmen, was gewollt ist.
3. `bun run tauri ios dev` startet die App im Simulator, `bun run tauri ios build` baut sie.
4. In Xcode das Team für die Signatur wählen (`bundle.iOS.developmentTeam` in
   `src-tauri/tauri.conf.json`) und die Bundle-ID `app.kennwort` im Apple-Konto anlegen.

Die AutoFill-Erweiterung (Credential Provider mit Passkeys) kommt später als eigenes Xcode-Target
dazu und nutzt dieselbe Brücke wie der Android-Autofill-Dienst (siehe
[Projektplan](plan.md#entscheidungen)).
