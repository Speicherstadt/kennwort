---
title: Einträge
description: >-
  Wie Kennwort Zugänge in Tresoren speichert: die Arten von Einträgen und eigene Felder, einen
  Eintrag anlegen und ändern, Passwörter und Passphrasen erzeugen, was ein Gerät prüft, bevor es
  einen Eintrag zeigt, und was der Server davon sieht.
---

# Einträge

Ein Eintrag ist etwas, das die Firma geheim halten will, etwa der Online-Banking-Login, das
WLAN-Passwort oder die Firmenkarte. Er liegt in genau einem Tresor; wer dort Mitglied ist, sieht
ihn.

## Arten von Einträgen

Jede Art bringt ihre Felder mit:

| Art | Felder |
| --- | --- |
| Login | Benutzername, Passwort, Website, Einmalcode |
| Notiz | Notiz (mehrzeilig) |
| WLAN | Netzwerkname, Passwort, Sicherheit |
| Karte | Karteninhaber, Kartennummer, Gültig bis, Prüfnummer, PIN |
| SSH-Schlüssel | Privater Schlüssel, Öffentlicher Schlüssel, Passphrase |
| API-Schlüssel | Schlüssel, Adresse |
| Identität | Name, E-Mail, Telefon, Anschrift |

Geheime Felder – Passwort, Kartennummer, Prüfnummer, PIN, Schlüssel – zeigt Kennwort als Punkte,
bis du sie aufdeckst. In der Liste steht unter dem Titel das erste ausgefüllte Feld, das nicht
geheim ist, etwa der Benutzername oder der Netzwerkname.

**Eigene Felder:** Mit **Feld hinzufügen** bekommt ein Eintrag weitere Felder mit eigenem Namen
und einer Art: Text, Geheim, Adresse (URL), E-Mail, mehrzeiliger Text oder Einmalcode (TOTP). Ein eigenes Feld
entfernst du mit dem Papierkorb daneben; ein neues Feld, dem du keinen Namen gibst, speichert
Kennwort nicht.

## Einmalcodes (TOTP)

Viele Dienste verlangen beim Anmelden einen zweiten Faktor: einen sechsstelligen Code, der alle
30 Sekunden wechselt. Kennwort erzeugt diese Codes selbst. Beim Einrichten zeigt der Dienst einen
QR-Code und meist auch einen Schlüssel zum Abtippen. Neben dem Feld **Einmalcode** des Logins
öffnet **QR-Code scannen** zwei Wege: **Kamera verwenden** (am Handy die Kamera auf der Rückseite)
oder **Bild wählen**, etwa einen Screenshot der Einrichtungsseite; ein Bild aus der
Zwischenablage kannst du auch einfügen. Das Bild bleibt auf deinem Gerät. Du kannst den Schlüssel
oder den `otpauth://`-Link auch selbst eintragen. Passt er nicht, sagt Kennwort das sofort.

Im Eintrag steht dann statt des Schlüssels der aktuelle Code und wie viele Sekunden er noch gilt.
**Einmalcode kopieren** legt den Code in die Zwischenablage, nie den Schlüssel. Der Schlüssel ist
ein Feld des Eintrags wie das Passwort: auf deinem Gerät verschlüsselt, für den Server unlesbar.
Die Codes rechnet dein Gerät aus (RFC 6238, mit SHA-1, SHA-256 oder SHA-512, sechs bis acht
Stellen); es braucht dafür nur eine richtig gehende Uhr.

Wer einen Eintrag lesen darf, sieht auch seine Codes. Liegen Passwort und Einmalcode im selben
Eintrag, schützt der zweite Faktor nicht mehr vor dem, der Kennwort öffnet, wohl aber vor jedem,
der nur das Passwort kennt.

## Einen Eintrag anlegen

In der Liste der Einträge öffnet **Neu** den Dialog **Neuer Eintrag**. Du wählst den Tresor –
angeboten werden nur Tresore, in denen du bearbeiten oder verwalten darfst – und die Art, gibst
den Titel und die Felder ein und wählst **Speichern**. Wechselst du die Art, bevor du speicherst,
bleiben Titel, eigene Felder und Felder, die beide Arten haben (etwa das Passwort), erhalten; was
du in ein Feld geschrieben hast, das die neue Art nicht kennt, wird ein eigenes Feld. Kennwort
verschlüsselt den Eintrag auf deinem Gerät und zeigt ihn danach an.

## Einen Eintrag ändern

In einem Eintrag öffnet **Bearbeiten** denselben Dialog mit den bisherigen Werten; die Art eines
gespeicherten Eintrags bleibt. Jede Änderung
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
eines Eintrags füllt **Passwort erzeugen** (bei SSH-Schlüsseln **Passphrase erzeugen**) das Feld
mit den zuletzt gewählten Einstellungen für Passwörter.

## Was dein Gerät prüft

Bevor Kennwort einen Eintrag zeigt, prüft dein Gerät, dass ihn ein Mitglied mit dem Recht zu
bearbeiten signiert hat, dass er zu diesem Tresor und dieser Stelle gehört und dass er nicht
älter ist als eine Version, die das Gerät schon kannte. Einen Eintrag, der nicht passt, zeigt es
nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-09-eintrage-speichern-und-lesen).

Der Server bekommt nur Geheimtexte: Er sieht, dass es einen Eintrag gibt, wie groß er ist und wann
er sich geändert hat, aber weder Titel noch Benutzername, Passwort oder Website. Einträge und
ihre Änderungen gibt er nur an Mitglieder des Tresors.
