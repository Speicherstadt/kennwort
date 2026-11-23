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
| App für Android und iOS | in Arbeit (letzte Bauphase) | systemweit in allen Apps und Browsern, dazu Passkeys |

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
