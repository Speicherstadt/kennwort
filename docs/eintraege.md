---
title: Einträge
description: >-
  Wie Kennwort Zugänge in Tresoren speichert: einen Eintrag anlegen und ändern, Passwörter und
  Passphrasen erzeugen, was ein Gerät prüft, bevor es einen Eintrag zeigt, und was der Server
  davon sieht.
---

# Einträge

Ein Eintrag ist ein Zugang, etwa der Online-Banking-Login der Firma: Titel, Benutzername,
Passwort und Website. Er liegt in genau einem Tresor; wer dort Mitglied ist, sieht ihn.

## Einen Eintrag anlegen

In der Liste der Einträge öffnet **Neu** den Dialog **Neuer Eintrag**. Du wählst den Tresor –
angeboten werden nur Tresore, in denen du bearbeiten oder verwalten darfst –, gibst Titel,
Benutzername, Passwort und Website ein und wählst **Speichern**. Kennwort verschlüsselt den
Eintrag auf deinem Gerät und zeigt ihn danach an.

## Einen Eintrag ändern

In einem Eintrag öffnet **Bearbeiten** denselben Dialog mit den bisherigen Werten. Jede Änderung
wird eine neue Version; frühere Versionen bleiben auf dem Server erhalten. Haben zwei Geräte
denselben Eintrag gleichzeitig geändert, führt Kennwort beide Stände zusammen, ohne einen
stillschweigend zu verwerfen. In einem Tresor, in dem du nur lesen darfst, ist **Bearbeiten**
ausgegraut.

Erreicht dein Gerät den Server gerade nicht, sagt Kennwort das; die Änderung wartet auf dem Gerät,
bis du es wieder versuchst.

## Passwörter und Passphrasen erzeugen

Der **Generator** erzeugt auf deinem Gerät ein zufälliges Passwort oder eine Passphrase:

- **Passwort**: 8 bis 64 Zeichen aus Klein- und Großbuchstaben, nach Wahl mit Ziffern und
  Sonderzeichen (`!#$%&*+-=?@^_`); von jeder gewählten Art ist mindestens ein Zeichen dabei.
- **Passphrase**: 3 bis 10 Wörter aus der Wortliste der Electronic Frontier Foundation (7776
  englische Wörter), getrennt durch Bindestrich, Punkt, Unterstrich oder Leerzeichen, nach Wahl
  groß beginnend und mit einer angehängten Ziffer.

Unter dem Ergebnis steht, wie stark es ist, in Bit: so viele Ja-Nein-Fragen müsste jemand
erraten, der deine Einstellungen kennt. Unter 60 Bit gilt als schwach, ab 80 Bit als stark; ein
Passwort mit 20 Zeichen und allen Arten hat 124 Bit, eine Passphrase aus fünf Wörtern 64 Bit.
**Neu erzeugen** würfelt neu, **Kopieren** legt das Ergebnis in die Zwischenablage.

Kennwort merkt sich auf diesem Gerät die Einstellungen, nie ein erzeugtes Passwort. Im Dialog
eines Eintrags füllt **Passwort erzeugen** das Passwortfeld mit den zuletzt gewählten Einstellungen
für Passwörter.

## Was dein Gerät prüft

Bevor Kennwort einen Eintrag zeigt, prüft dein Gerät, dass ihn ein Mitglied mit dem Recht zu
bearbeiten signiert hat, dass er zu diesem Tresor und dieser Stelle gehört und dass er nicht
älter ist als eine Version, die das Gerät schon kannte. Einen Eintrag, der nicht passt, zeigt es
nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-09-eintrage-speichern-und-lesen).

Der Server bekommt nur Geheimtexte: Er sieht, dass es einen Eintrag gibt, wie groß er ist und wann
er sich geändert hat, aber weder Titel noch Benutzername, Passwort oder Website. Einträge und
ihre Änderungen gibt er nur an Mitglieder des Tresors.
