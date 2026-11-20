---
title: Einträge
description: >-
  Wie Kennwort Zugänge in Tresoren speichert: einen Eintrag anlegen und ändern, was ein Gerät
  prüft, bevor es einen Eintrag zeigt, und was der Server davon sieht.
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

## Was dein Gerät prüft

Bevor Kennwort einen Eintrag zeigt, prüft dein Gerät, dass ihn ein Mitglied mit dem Recht zu
bearbeiten signiert hat, dass er zu diesem Tresor und dieser Stelle gehört und dass er nicht
älter ist als eine Version, die das Gerät schon kannte. Einen Eintrag, der nicht passt, zeigt es
nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-09-eintrage-speichern-und-lesen).

Der Server bekommt nur Geheimtexte: Er sieht, dass es einen Eintrag gibt, wie groß er ist und wann
er sich geändert hat, aber weder Titel noch Benutzername, Passwort oder Website. Einträge und
ihre Änderungen gibt er nur an Mitglieder des Tresors.
