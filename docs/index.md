---
title: Kennwort – der Passwortmanager für dein Team
description: >-
  Kennwort: der selbst gehostete, Ende-zu-Ende-verschlüsselte Passwortmanager für Teams in kleinen
  Betrieben. Web-App, Browser-Extension und App, ohne Kosten pro Benutzer.
---

# Kennwort

**Die Zugänge deines Teams – nur für euch lesbar, auf deinem eigenen Server.**

Kennwort ist ein selbst gehosteter Passwortmanager für kleine Betriebe: Tresore und Gruppen fürs
Team, eine Browser-Extension, die erst nach Klick ausfüllt, und eine Web-App fürs Handy.
Ende-zu-Ende-verschlüsselt, mit Post-Quanten-Schutz, Open Source und ohne Kosten pro Benutzer.

<a href="/demo/" class="md-button md-button--primary">Demo ausprobieren</a>
[Installieren](installation.md){ .md-button }

!!! warning "Noch nicht veröffentlicht"
    Kennwort ist fertig gebaut bis auf die App fürs Handy, aber noch ohne externes Audit. Bitte
    noch keine echten Passwörter damit verwalten. In der Demo gibst du ohnehin nur Testdaten ein.

## Was Kennwort kann

- **Tresore fürs Team**: Logins, Notizen, WLAN, Karten, SSH- und API-Schlüssel, Einmal-Codes und
  Passkeys in [Tresoren](tresore.md) mit Gruppen, Rollen und Zugriff auf Zeit.
- **Entsperren mit Passkey**: statt Master-Passwort, die Passphrase bleibt der Notweg; dazu
  Recovery-Kit, Firmen-Recovery und Notfallzugriff ([Konto und Entsperren](konto.md)).
- **Browser-Extension**: Treffer nur für den exakten Host, Ausfüllen erst nach deinem Klick,
  Speichern neuer Logins, Phishing-Warnung und Passkeys ([Browser-Extension](extension.md)).
- **Für Handwerk und IT-Dienstleister**: QR-Etiketten für Geräte, Übergabe an den Kunden, mehrere
  Firmen in einem Konto ([Handwerk und IT-Dienstleister](handwerk.md)).
- **Im Alltag sicher**: [Sicherheits-Übersicht](sicherheit.md) mit schwachen, doppelten und
  geleakten Passwörtern, [Einmal-Links](einmal-links.md) für Externe, [Mitteilungen](mitteilungen.md)
  und eine [Kommandozeile](cli.md).
- **Umzug in Minuten**: Import aus Bitwarden, 1Password, LastPass, KeePass, Team Password Manager,
  Passbolt und den Browsern, direkt auf deinem Gerät ([Import und Export](import-export.md)).

## Rundgang

Die Web-App zeigt am Rechner Liste und Eintrag nebeneinander, mit der Seitenleiste für Tresore; am
Handy einen Bildschirm nach dem anderen mit der Tab-Leiste unten ([Handy und App](handy.md)). Die
Extension öffnet ein Popup mit den Treffern der Seite und legt ein Menü unter Login-Felder. Am
schnellsten siehst du es in der <a href="/demo/">Demo</a>.

## Was Kennwort verspricht

Kennwort ist gegen einen Server gebaut, der selbst angegriffen wird:

- **Der Server sieht nur Verschlüsseltes.** Verschlüsselt wird auf deinem Gerät, mit
  XChaCha20-Poly1305, X25519 und ML-KEM-768 gegen künftige Quantencomputer, Ed25519 und Argon2id.
  Passphrase und Schlüssel verlassen das Gerät nie.
- **Niemand bekommt heimlich Zugriff.** Jede Mitgliedschaft ist unterschrieben, jeder Geheimtext an
  Eintrag, Tresor und Version gebunden; dein Gerät prüft beides. Alle 27 Angriffe der ETH-Studie zu
  Passwortmanagern mit bösartigem Server laufen als Tests.
- **Updates nur signiert.** Die installierte Web-App nimmt nur vom Kennwort-Projekt signierte
  Versionen an, auch wenn dein Server etwas anderes ausliefert.
- **Ausfüllen nur nach Klick**, nur auf dem exakten Host und nie in fremde iFrames.
- **Offen und prüfbar.** Quellcode unter AGPL-3.0, reproduzierbare Builds, eine Handvoll
  Abhängigkeiten im Client.

Die Einzelheiten stehen im [Sicherheitsdesign](sicherheitsdesign.md), was der Server über dich
speichert unter [Datenschutz](datenschutz.md).

## Installation

Ein Container mit Caddy davor für TLS, mit Docker Compose oder Podman Quadlet:

```sh
curl -fsSLO https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/compose.yaml
curl -fsSLO https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/Caddyfile
curl -fsSL -o .env https://raw.githubusercontent.com/Speicherstadt/kennwort/main/docker/kennwort.env.example
# KENNWORT_DOMAIN, KENNWORT_AUTH_SECRET und KENNWORT_SETUP_CODE in .env eintragen
docker compose up -d
```

Danach legst du mit dem Einrichtungs-Code deine Firma an. Alles Weitere: [Installation](installation.md),
[Backups](backup.md), [Updates](updates.md) und [Verwaltung](verwaltung.md).

## Fragen

Kosten, Umzug, vergessene Passphrase: Antworten stehen in der [FAQ](faq.md).
