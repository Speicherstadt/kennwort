---
title: Handy und App
description: >-
  Kennwort am Handy: die Web-App zum Installieren (PWA), die Extension in Firefox für Android und
  die geplante App für Android und iOS mit systemweitem Ausfüllen.
---

# Handy und App

Am Handy gibt es Kennwort auf zwei Wegen, dauerhaft nebeneinander: die Web-App, die du ohne App
Store installierst, und eine App für Android und iOS, die in allen Apps ausfüllt. In Firefox für
Android läuft zusätzlich die [Browser-Extension](extension.md).

| Angebot | Stand | Ausfüllen am Handy |
| --- | --- | --- |
| Web-App (PWA) | da | Kopieren mit einem Tipp |
| Extension in Firefox für Android ab 142 | da | Inline-Menü zeigt Treffer; kopieren aus dem Popup |
| App für Android und iOS | Gerüst da, unter Android mit dem Server verbunden (letzte Bauphase) | systemweit in allen Apps und Browsern, dazu Passkeys |

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
Geplant ist:

- dieselbe Oberfläche und dieselbe Kryptografie wie in der Web-App;
- Entsperren mit Fingerabdruck oder Gesicht, der Kontoschlüssel im Android Keystore bzw. im
  iOS-Schlüsselbund verpackt;
- Ausfüllen in allen Apps und Browsern über den Android-Autofill-Dienst und die
  AutoFill-Erweiterung von iOS, mit Passkeys;
- die Zwischenablage nach 30 Sekunden leeren, kein Screenshot in der Eintragsansicht.

Bis dahin ist die Web-App der Weg am Handy.

### Stand

Das Gerüst steht: eine Tauri-3-App (3.0.0-alpha.6; Tauri 3 ist noch nicht stabil) in
`apps/mobile`, die genau den Build der Web-App zeigt, keine eigene Oberfläche. Das Android-Projekt
und das iOS-Projekt sind angelegt.

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

Noch nicht in der App: die Anmeldung über den Identitätsanbieter deiner Firma (OIDC) und die
Live-Aktualisierung; Änderungen anderer siehst du nach dem nächsten Abgleich. Auf dem iPhone fehlt
die Verbindung noch ganz, sie kommt mit dem Bau auf dem Mac.

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
```

Für Android brauchst du Rust mit den Zielen `aarch64-linux-android` und `x86_64-linux-android`,
das Android SDK (`ANDROID_HOME`), das NDK (`NDK_HOME`) und ein JDK ab 17. Der Workflow „Android“
auf GitHub baut die Debug-APK bei jeder Änderung an `apps/mobile` und auf Knopfdruck
(**Actions → Android → Run workflow**); die APK liegt danach als Artefakt am Lauf. Sie ist mit dem
Debug-Schlüssel von Gradle signiert und nur zum Testen gedacht.

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
