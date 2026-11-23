---
title: Handwerk und IT-Dienstleister
description: >-
  QR-Etiketten für Geräte und Anlagen, die Übergabe eines Tresors an den Kunden und mehrere Firmen
  in einem Konto – für Handwerksbetriebe und IT-Dienstleister, die Zugänge ihrer Kunden verwalten.
---

# Handwerk und IT-Dienstleister

Wer Heizungen, Netzwerke oder Server für Kunden einrichtet, hat ständig mit fremden Zugängen zu
tun: der Router der Heizungsanlage, das WLAN im Laden, das Admin-Konto der Telefonanlage. Kennwort
hilft an drei Stellen: ein Etikett am Gerät führt zum richtigen Eintrag, am Ende des Auftrags geht
der Tresor an den Kunden, und wer für mehrere Firmen arbeitet, wechselt zwischen ihnen, ohne sich
neu anzumelden.

## QR-Etiketten

Öffne einen Eintrag und wähle **Etikett**. Du siehst eine Vorschau mit QR-Code und Beschriftung:

- **Beschriftung**: Am Anfang der Titel des Eintrags, z. B. „Router Heizung Müller“. Ändere sie, wenn
  der Titel nicht an das Gerät gehört.
- **Größe**: 62 × 29 mm, 89 × 36 mm oder 50 × 50 mm, die üblichen Größen von Etikettendruckern.
- **Drucken** öffnet den Druckdialog des Browsers. Gedruckt wird nur das Etikett, auf einer Seite in
  seiner Größe; wähle dort deinen Etikettendrucker.

Der QR-Code enthält **nur die Adresse des Eintrags** in Kennwort, kein Passwort, keinen
Benutzernamen und auch nicht die Beschriftung. Scannt jemand das Etikett mit dem Handy, öffnet sich
Kennwort; gezeigt wird der Eintrag erst nach dem Entsperren und nur, wenn das Konto ihn lesen darf.
Wer das Etikett fotografiert, kommt damit an nichts heran. Der Code entsteht auf deinem Gerät, an
den Server geht dabei nichts.

## Mehrere Firmen in einem Konto

Ein IT-Dienstleister betreut viele Firmen, ein Handwerker ist oft auch in der Firma seines Kunden
eingetragen. Unter **Einstellungen → Firmen** siehst du alle Firmen deines Kontos und wechselst mit
**Wechseln** zwischen ihnen. Ab dem Desktop mit Seitenleiste wechselst du auch oben in der
Seitenleiste.

So kommt eine Firma dazu – immer aus deiner **eigenen Firma** heraus, der, mit der du dich
entsperrst:

- **Einer Firma beitreten**: Ein Inhaber oder Admin der anderen Firma lädt dich unter
  **Mitglieder** ein. Füge den Einladungslink unter **Firmen** ein und gib der Firma einen Namen.
  Danach bestätigt die andere Firma deine Schlüssel wie bei jedem neuen Mitglied.
- **Neue Firma anlegen**: Mit dem Einrichtungs-Code des Servers legst du eine Firma an, deren
  Inhaber du bist – etwa für einen Kunden, dem du Kennwort einrichtest.

Du brauchst dafür keine neue Passphrase und kein neues Recovery-Kit: Dein Konto merkt sich den Weg
in jede Firma verschlüsselt und öffnet sie für dich. Jede Firma bleibt trotzdem für sich: eigene
Schlüssel, eigene Tresore, eigene Mitglieder. Die Kollegen in der einen Firma sehen nicht, in
welchen anderen Firmen du bist, und keine Firma kommt an die Daten einer anderen. Mit
**Entfernen** nimmst du eine Firma aus deinem Konto; aus der Firma selbst nimmt dich deren
Inhaber.

Gut zu wissen:

- Sperrst du Kennwort, sind alle Firmen gesperrt. Nach dem Entsperren bist du wieder in deiner
  eigenen Firma.
- Ohne Server liest Kennwort nur deine eigene Firma (die Offline-Kopie gehört zu ihr).
- Die Browser-Extension kennt nur das Konto, das du in ihr eingegeben hast.
- Über den Anmeldedienst (OpenID Connect) bist du in einer Firma; weitere Firmen kommen über
  Einladungen.

## Übergabe an den Kunden

Am Ende eines Auftrags gehören die Zugänge dem Kunden. So gibst du ihm einen Tresor:

1. Der Kunde hat eine eigene Firma in Kennwort, und du bist dort Mitglied und bestätigt (siehe
   oben). Der Kunde selbst ist dort ebenfalls bestätigt.
2. In deiner Firma wählst du unter **Einstellungen → Tresore** beim Tresor **Übergeben** und dann
   die Firma des Kunden.
3. Kennwort wechselt in die Firma des Kunden. Wähle, wer den Tresor übernimmt, und dann
   **Übergeben**.

Kennwort legt in der Firma des Kunden einen neuen Tresor an und verschlüsselt jeden Eintrag auf
deinem Gerät neu, für den Kunden. Der Kunde wird Verwalter des Tresors; du bleibst mit
**Bearbeiten**, etwa für die Wartung, verwaltest aber keine Mitglieder mehr. Ab dann entscheidet der
Kunde: Unter **Mitglieder** des Tresors kann er dich jederzeit entfernen. Dann bekommt der Tresor
einen neuen Schlüssel, und was der Kunde danach ändert, siehst du nicht mehr.

Der Tresor in deiner eigenen Firma bleibt, wie er war. Was du vor der Übergabe kanntest, kennst du
natürlich weiter – will der Kunde sichergehen, ändert er die Passwörter nach der Übergabe.

Wie das alles abgesichert ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-27-mehrere-firmen-ubergabe-an-den-kunden-und-qr-etiketten).
