---
title: FAQ
description: >-
  Häufige Fragen zu Kennwort: Kosten, Selbsthosten, Sicherheit bei einem gehackten Server,
  vergessene Passphrase, Umzug von anderen Passwortmanagern und Anmeldedienste.
---

# FAQ

## Was kostet Kennwort?

Nichts pro Benutzer. Kennwort ist Open Source (AGPL-3.0); du bezahlst nur den Server, auf dem es
läuft.

## Gibt es Kennwort als Cloud-Dienst?

Nein. Kennwort betreibst du selbst, auf einem kleinen Server, einem NAS oder einer VM, oder dein
IT-Dienstleister tut es für dich ([Installation](installation.md)).

## Was passiert, wenn der Server gehackt wird?

Der Server speichert nur Verschlüsseltes und öffentliche Schlüssel. Jede Mitgliedschaft ist
unterschrieben und jeder Geheimtext an seinen Eintrag gebunden; dein Gerät prüft beides. So kann
auch ein gehackter Server weder mitlesen noch jemandem Zugriff geben. Alle 27 Angriffe der
ETH-Studie zu Passwortmanagern mit bösartigem Server laufen als Tests
([Sicherheitsdesign](sicherheitsdesign.md)).

## Ich habe meine Passphrase vergessen.

Mit dem Recovery-Kit setzt du eine neue ([Passphrase vergessen](konto.md#passphrase-vergessen)).
Hat deine Firma die Firmen-Recovery eingeschaltet, hilft auch ein Inhaber
([Firmen-Recovery](konto.md#firmen-recovery)). Sonst kann sie niemand zurücksetzen, auch der
Betreiber nicht.

## Kann ich von Bitwarden, LastPass oder 1Password umziehen?

Ja, auch von KeePass, Team Password Manager, Passbolt und den Browsern. Der Export wird auf deinem
Gerät gelesen und nie hochgeladen ([Import und Export](import-export.md)).

## Brauche ich einen Anmeldedienst wie Keycloak?

Nein. OpenID Connect ist ein Zusatz für Firmen, die schon einen haben; entsperrt wird weiter mit
deiner Passphrase ([Anmeldedienst](anmeldedienst.md)).

## Füllt die Extension Passwörter von selbst aus?

Nein, erst nach deinem Klick, nur auf dem exakten Host und nie in fremde iFrames
([Browser-Extension](extension.md)).

## Gibt es eine App fürs Handy?

Die Web-App lässt sich heute schon installieren; die App für Android und iOS kommt zuletzt
([Handy und App](handy.md)).

## Kann ich Kennwort ausprobieren, ohne etwas zu installieren?

Ja, in der <a href="/demo/">Demo</a> mit den Testdaten von „Weber Haustechnik“. Sie läuft nur im
Browser; gib dort keine echten Passwörter ein.
