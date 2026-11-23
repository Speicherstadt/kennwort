---
title: Datenschutz
description: >-
  Was der Kennwort-Server über ein Konto speichert, was er nie sieht, wie du deine Daten
  herunterlädst und dein Konto löschst (DSGVO, Art. 15, 17 und 20).
---

# Datenschutz

Kennwort ist Ende-zu-Ende-verschlüsselt: Der Server speichert Geheimtexte, öffentliche Schlüssel und
das, was er braucht, um Anfragen zu beantworten. Was verschlüsselt ist, kann er nicht lesen. Diese
Seite sagt genau, was das ist, wie du es herunterlädst und wie du dein Konto löschst. In der App
findest du dasselbe unter **Einstellungen → Datenschutz**.

## Was der Server speichert

| Was | Wozu | Lesbar für den Server |
| --- | --- | --- |
| Konto: eine zufällige ID, die Firma, die Rolle, wann es angelegt wurde und wann es ausgetreten ist | Anmelden, Rechte prüfen | ja |
| öffentlicher Anmeldeschlüssel und Salt, fehlgeschlagene Anmeldungen (Zeitpunkte) | Anmelden mit der Passphrase, Sperre nach zu vielen Versuchen | ja (aus dem Schlüssel lässt sich die Passphrase nicht erraten) |
| öffentliche Schlüssel und Zertifikat, frühere Zertifikate nach einer Schlüsselerneuerung | damit andere prüfen können, was du signiert hast | ja |
| Schlüsselbund, Kontozustand und die beiden Kopien des Kontoschlüssels | Entsperren auf jedem Gerät | nein, verschlüsselt |
| Geräte und Sitzungen: Name des Geräts, Browser, IP-Adresse, wann angemeldet und zuletzt gesehen | Geräteliste, Abmelden einzelner Geräte | ja |
| Passkeys: Name, Gerätetyp, ID des Schlüssels | Anmelden mit Passkey | ja |
| Push-Adressen deiner Geräte | Push-Mitteilungen | ja (ein Push trägt keinen Inhalt) |
| Mitteilungen: Art, IDs, Zeit, gelesen | die Glocke in der App | ja, nur IDs, keine Namen |
| Tresore und Einträge, jede Version | Abgleich zwischen Geräten und Mitgliedern | nein, verschlüsselt; sichtbar sind IDs, Größen, Zeiten und wer geschrieben hat |
| Mitgliedschafts-Logs der Tresore | wer Mitglied ist, signiert von den Verwaltern | ja |
| Gruppen, Zugriffsanfragen, geteilte Einträge, Notfallzugriff, Einmal-Links, Einladungen | die Funktionen dahinter | IDs und Zeiten; die Inhalte nur verschlüsselt; Gruppennamen und die Beschriftung einer Einladung im Klartext |
| mit OpenID Connect: Issuer, `sub` und Name beim Anmeldedienst | Anmelden über den Anmeldedienst | ja |
| Audit-Log der Firma: wer wann was getan hat | Nachvollziehbarkeit für Inhaber und Admins | ja, mit Konto-IDs |

## Was der Server nie sieht

- deine Passphrase, deinen Secret Key und deinen Recovery Key
- Passwörter, Benutzernamen, Adressen, Notizen und alle anderen Inhalte deiner Einträge
- die Namen von Tresoren, Einträgen und Firmen

Wie das technisch gesichert ist, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-15-was-der-server-sieht).

## Daten herunterladen

Unter **Einstellungen → Datenschutz → Daten herunterladen** lädst du alles, was der Server über dein
Konto speichert, als JSON-Datei herunter (Auskunft und Datenübertragbarkeit nach Art. 15 und 20
DSGVO). Verschlüsseltes steht darin so, wie der Server es hat; öffnen kann es nur ein Gerät deines
Kontos. Nicht darin sind Sitzungs-Token und Daten anderer Personen; andere Konten erscheinen nur mit
ihrer ID.

Deine Einträge selbst stehen im verschlüsselten [Export](import-export.md) der App, den nur ein Gerät
machen kann. Exportieren dürfen Inhaber und Admins der Firma; als Mitarbeiter fragst du sie.

## Konto löschen

Unter **Einstellungen → Datenschutz → Konto löschen** löschst du dein Konto (Art. 17 DSGVO). Du
bestätigst mit deiner Passphrase; eine falsche Passphrase löscht nichts. Danach vergisst das Gerät
das Konto und zeigt die Begrüßung.

Gelöscht werden:

- deine Sitzungen, Geräte, Passkeys, Push-Adressen und Mitteilungen
- dein Anmeldeschlüssel, dein verschlüsselter Schlüsselbund und Kontozustand
- deine Verknüpfung mit dem Anmeldedienst, Notfallzugriffe von und für dich, deine Einmal-Links,
  offene Einladungen von dir und die Einladung, mit der du gekommen bist
- jeder Tresor, in dem nur du Mitglied bist, mit allen Einträgen

Aus geteilten Tresoren nimmt dich das Gerät eines Verwalters heraus und wechselt den Schlüssel, so
wie beim [Austritt aus der Firma](konto.md#austritt-aus-der-firma). Verwaltest du einen geteilten
Tresor mit, trägt dein Gerät dein Austreten vorher selbst signiert ein. Was du beim Löschen schon
entschlüsselt hattest, kann kein Protokoll zurückholen; die Einträge, die du lesen konntest, stehen
bei den anderen unter „Zum Ändern“.

Es bleiben, solange die Firma besteht:

- deine Konto-ID mit Firma, Rolle und dem Zeitpunkt des Austritts
- deine öffentlichen Schlüssel und Zertifikate: Ohne sie könnten die anderen nicht mehr prüfen, was
  du signiert hast, und jedes Log und jeder Eintrag von dir würde ungültig
- das Audit-Log der Firma mit deiner Konto-ID: Es ist eine Hash-Kette und lässt sich nicht stellenweise
  kürzen, ohne dass es jedem Prüfenden auffällt

Das sind Daten ohne Namen; dein Name steht beim Server höchstens in der Beschriftung einer Einladung
oder beim Anmeldedienst, und beides wird gelöscht.

**Grenzen:**

- Der letzte Inhaber einer Firma kann sein Konto nicht löschen, solange noch jemand in der Firma ist.
  Mach zuerst jemand anderen zum Inhaber.
- Wer als einziger einen geteilten Tresor verwaltet, macht zuerst ein anderes Mitglied zum Verwalter.
- Bist du der Letzte in deiner Firma, wird die ganze Firma mit allem gelöscht, das Audit-Log
  eingeschlossen.
- Hast du [mehrere Firmen](handwerk.md) in deinem Konto, löschst du es in deiner eigenen Firma; die
  Konten der weiteren Firmen werden zuerst gelöscht, mit denselben Grenzen. Lässt sich eine davon
  nicht löschen, wird gar nichts gelöscht.
- In Backups des Servers bleiben gelöschte Daten, bis der Betreiber die Backups nach seiner eigenen
  Frist löscht ([Backups](backup.md)).
