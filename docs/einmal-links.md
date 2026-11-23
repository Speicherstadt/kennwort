---
title: Einmal-Links
description: >-
  Wie du mit Kennwort ein Passwort oder einen Text an jemanden ohne Konto schickst: Einmal-Link aus
  einem Eintrag oder für freien Text, Ablauf, Zahl der Abrufe, Passphrase, Widerruf – und was der
  Server davon sieht.
---

# Einmal-Links

Manchmal braucht jemand außerhalb der Firma ein Geheimnis: der Elektriker das WLAN der Baustelle,
die Steuerberaterin den Zugang zum Firmenkonto, der neue Dienstleister den Code der Alarmanlage.
Ein **Einmal-Link** bringt es dorthin, ohne dass die Person ein Konto braucht und ohne dass es im
Klartext in einer Mail oder einem Chat liegen bleibt. Der Link läuft ab und lässt sich nur so oft
öffnen, wie du wählst.

## Einen Link erstellen

**Aus einem Eintrag:** Öffne den Eintrag und tippe auf **Einmal-Link**. Der Dialog nennt die
Felder, die in den Link kommen: jedes Feld mit einem Wert, außer dem Schlüssel eines Einmalcodes
(TOTP). Den gibt Kennwort nie nach außen, sonst hätte die Person den zweiten Faktor für immer.
Aus einem Passkey kommt nichts in den Link: Mit seinem privaten Schlüssel könnte sich die Person
für immer als du anmelden.
Einen Link aus einem Eintrag erstellen kann, wer im Tresor bearbeiten oder verwalten darf, wie beim
Teilen; für einen Eintrag, der mit dir geteilt wurde, gibt es keinen.

**Für freien Text:** Unter **Einmal-Links** in der Navigation (unter dem Generator) schreibst du einen Titel (freiwillig)
und das Geheimnis selbst, etwa einen Tür-Code oder eine kurze Anleitung.

Dann wählst du:

- **Gültig für**: eine Stunde, einen Tag (voreingestellt), drei oder sieben Tage. Länger als sieben
  Tage lebt kein Link.
- **Abrufe**: wie oft der Link geöffnet werden darf, 1 bis 10 (voreingestellt einmal).
- **Passphrase (optional)**: Mit ihr öffnet der Link erst, wenn die Person auch die Passphrase
  eintippt. Sag sie auf einem anderen Weg weiter, etwa am Telefon; dann reicht der Link allein,
  etwa in einer weitergeleiteten Mail, nicht.

**Link erstellen** verschlüsselt den Inhalt auf deinem Gerät und zeigt den Link mit
**Link kopieren**. Kennwort zeigt ihn nur dieses eine Mal: Der Schlüssel im Link steht nirgends
sonst, auch nicht auf dem Server. Hast du ihn verloren, erstelle einen neuen.

## Was die Person sieht

Der Link führt auf eine Seite von Kennwort, die ohne Konto funktioniert, auf Deutsch oder Englisch
nach der Sprache des Browsers. Sie zeigt zuerst nur einen Hinweis und **Anzeigen**. Erst dieser
Klick ruft den Inhalt vom Server ab und zählt als Abruf. So verbrauchen Linkvorschauen in Chats und
Mailprogrammen, die eine Adresse vorab laden, und Virenscanner, die jeden Link öffnen, keinen
Abruf.

Ist der Link mit einer Passphrase geschützt, fragt die Seite nach dem Abruf danach; eine falsche
Passphrase kostet keinen weiteren Abruf. Dann stehen Titel und Felder da, geheime Felder als Punkte
mit **aufdecken** und jedes Feld mit einem Knopf zum Kopieren. Darunter steht, wie oft sich der
Link noch öffnen lässt, oder dass er jetzt verbraucht ist. Ist er abgelaufen, widerrufen oder
schon so oft geöffnet wie erlaubt, sagt die Seite das, und die Person bittet dich um einen neuen.

Den Schlüssel liest die Seite aus dem Teil des Links hinter dem `#` und nimmt ihn sofort aus der
Adresszeile und dem Verlauf des Browsers. Die Seite sendet keine Statistiken und keinen Referrer.

## Deine Links

Unter **Einmal-Links** in der Navigation (unter dem Generator) stehen deine Links, die noch gelten, mit dem Tag, an dem du
sie erstellt hast, wie viele Abrufe übrig sind und bis wann sie gelten. **Widerrufen** löscht einen
Link sofort auf dem Server; wer ihn danach öffnet, sieht nur, dass er nicht mehr gilt. Ein Link,
der abläuft oder dessen letzter Abruf vorbei ist, verschwindet von selbst. Jedes Konto kann bis zu
50 Links zugleich haben.

Erstellen, jeder Abruf und jeder Widerruf stehen im Audit-Log der Firma, mit der öffentlichen ID
des Links, nie mit dem Inhalt oder dem Link selbst.

## Was der Server sieht

Der Server speichert den verschlüsselten Inhalt, wann der Link abläuft und wie viele Abrufe übrig
sind, dazu wer ihn erstellt hat. Den Schlüssel bekommt er nie: Browser schicken den Teil hinter dem
`#` nicht mit. Die Passphrase und der Inhalt verlassen das Gerät nur verschlüsselt.

Wichtig zu wissen:

- **Wer den ganzen Link hat, kann den Inhalt lesen**, solange Abrufe übrig sind. Schick ihn nur an
  die Person, für die er gedacht ist, oder schütze ihn zusätzlich mit einer Passphrase.
- **Ablauf und Zahl der Abrufe setzt der Server durch.** Ein ehrlicher Server hält sich daran und
  löscht den Link danach. Ein gehackter Server könnte den verschlüsselten Inhalt öfter oder länger
  ausliefern; lesen könnte er ihn trotzdem nicht. Bitwarden Send und andere Dienste dieser Art
  haben dieselbe Grenze.
- Was die Person kopiert oder abschreibt, behält sie. Ändere ein Passwort, wenn die Person es nicht
  mehr kennen soll.

Wie das technisch geht, steht im [Sicherheitsdesign](sicherheitsdesign.md#p-18-einmal-links).
