---
title: Tresore
description: >-
  Wie Kennwort Einträge in Tresore ordnet: der persönliche Tresor, geteilte Tresore anlegen, und was
  jedes Gerät prüft, bevor es einen Tresor öffnet.
---

# Tresore

Jeder Eintrag liegt in einem Tresor. Ein Tresor hat einen eigenen Schlüssel, und nur seine
Mitglieder bekommen ihn: verpackt an ihre bestätigten Schlüssel, so dass der Server ihn nie sieht.
Auch der Name eines Tresors ist mit diesem Schlüssel verschlüsselt; der Server kennt nur seine
Nummer und wer Mitglied ist.

## Der persönliche Tresor

Beim ersten Öffnen legt Kennwort für dich den Tresor **Persönlich** an, sobald deine Schlüssel
bestätigt sind – einmal, auch wenn du mehrere Geräte zugleich öffnest. In ihm bist nur du; was du dort ablegst, sieht niemand sonst in der Firma.

## Einen Tresor anlegen

Unter **Einstellungen → Tresore** (auf dem Desktop auch über **Alle Tresore** in der Seitenleiste)
stehen alle Tresore, in denen du Mitglied bist, mit deiner Rolle darin:

- **Lesen**: Einträge ansehen und kopieren.
- **Bearbeiten**: dazu Einträge anlegen und ändern.
- **Verwalten**: dazu Mitglieder aufnehmen, ihre Rolle ändern und sie entfernen.

Unter **Neuer Tresor** gibst du einen Namen ein und wählst **Tresor anlegen**. Wer einen Tresor
anlegt, verwaltet ihn.

## Mitglieder eines Tresors

Neben jedem Tresor öffnet **Mitglieder** die Liste der Mitglieder mit ihrer Rolle. Wer den Tresor
verwaltet, kann dort:

- unter **Mitglied aufnehmen** eine Person der Firma mit einer Rolle aufnehmen. Angeboten werden
  nur Konten, deren Schlüssel bestätigt sind; dein Gerät verpackt den Tresor-Schlüssel an genau
  diese Schlüssel.
- die **Rolle** eines Mitglieds ändern.
- ein Mitglied **aus dem Tresor entfernen**. Was es vorher entschlüsselt hat, kann es behalten
  haben; deshalb wechselt dein Gerät dabei gleich den Tresor-Schlüssel (siehe
  [Wenn jemand geht](#wenn-jemand-geht)).

Beim Aufnehmen kannst du unter **Zugriff bis** einen Tag wählen. Nach diesem Tag öffnet kein Gerät
den Tresor mehr für die Person, und der Server gibt ihr das Protokoll und den Schlüssel nicht mehr;
in der Liste steht dann **abgelaufen**. Ein Tag, der schon vorbei ist, lässt sich nicht wählen. Wer
abgelaufen ist, kann über den Link zum Tresor erneut Zugriff anfragen; Freigeben verlängert dann
seinen Zugriff ohne Ende.

Hat ein anderes Gerät den Tresor gerade geändert, lädt Kennwort den neuen Stand und bittet dich,
die Änderung noch einmal zu machen.

## Wenn jemand geht

**Aus dem Tresor entfernen** macht auf dem Gerät des Verwalters vier Dinge in einem Zug:

1. Es unterschreibt im Protokoll, dass die Person draußen ist, und gleich danach einen
   **Schlüsselwechsel**.
2. Es erzeugt einen neuen Tresor-Schlüssel und verpackt ihn für jedes Mitglied, das bleibt, an
   dessen bestätigte Schlüssel. Hat ein Mitglied keine bestätigten Schlüssel, bricht Kennwort ab
   und entfernt niemanden, statt jemanden still auszulassen.
3. Es schreibt jeden Eintrag neu, verschlüsselt mit dem neuen Schlüssel, den die Person nie
   bekommt; auch den Namen des Tresors. Was danach geschrieben wird, kann sie nicht lesen.
4. Es verpackt die [Freigaben einzelner Einträge](eintraege.md#einen-einzelnen-eintrag-teilen) neu, damit
   sie weiter gelten. Freigaben, die die entfernte Person selbst gemacht hat, enden dabei.

Jedes geheime Feld, das die Person lesen konnte, steht danach unter
[Zum Ändern](eintraege.md#zum-andern), mit ihrem Namen und dem Tag, bis zu dem sie Zugriff hatte.
Ändere diese Passwörter beim jeweiligen Dienst: Ein neuer Tresor-Schlüssel schützt nur, was nach
dem Austritt geschrieben wird.

Verlässt jemand die ganze Firma ([Austritt aus der Firma](konto.md#austritt-aus-der-firma)), holt
das Gerät jedes Verwalters das von selbst nach, sobald er Kennwort öffnet: Es nimmt die Person aus
jedem Tresor, den er verwaltet, und wechselt den Schlüssel. Ebenso einen Schlüsselwechsel, der nach
einem Entfernen noch fehlt, und Einträge, die beim Wechsel nicht neu geschrieben wurden.

Bis der Schlüssel gewechselt ist, kennt die entfernte Person noch den aktuellen. Solange zeigen
alle Geräte oben den Hinweis, dass im Tresor ein Schlüsselwechsel aussteht, und niemand kann dort
etwas anlegen oder ändern. Lesen geht weiter, auch ohne Verbindung.

## Zugriff anfragen

Schickt dir jemand den Link zu einem Tresor, in dem du nicht Mitglied bist, zeigt Kennwort **Kein
Zugriff** und nichts vom Tresor. Mit **Zugriff anfragen** landet deine Anfrage bei seinen
Verwaltern: Sie sehen sie unter **Mitglieder → Anfragen** und können sie **freigeben** (mit einer
Rolle) oder **ablehnen**. Der Server gibt dir dabei nie selbst Zugriff; den Tresor-Schlüssel
verpackt erst das Gerät eines Verwalters an deine bestätigten Schlüssel. Freigeben geht darum nur,
wenn deine Schlüssel schon bestätigt sind.

## Gruppen

Unter **Gruppen** legen Inhaber und Admins Gruppen an, etwa „Büro-Team“, und nehmen Personen der
Firma auf oder heraus. Eine Gruppe gibt selbst keinen Zugriff: Ein Verwalter verknüpft sie im
Dialog **Mitglieder** eines Tresors mit einer Rolle. Danach erscheint jedes Gruppenmitglied, das
noch nicht im Tresor ist, unter **Anfragen** – auch wer der Gruppe später beitritt – und kommt erst
mit **Freigeben** hinein, vorgeschlagen mit der Rolle der Gruppe. Löst ein Verwalter die Gruppe
wieder, verschwinden die Anfragen, die nur sie gestellt hat. Verlässt jemand die Gruppe, bleibt er im Tresor; der Dialog markiert ihn
mit **in keiner verknüpften Gruppe**, damit ein Verwalter ihn entfernen kann. Gruppennamen und wer
in welcher Gruppe ist, sieht der Server.

## Was dein Gerät prüft

Zu jedem Tresor gehört ein Protokoll: Wer ihn angelegt hat, wer aufgenommen, geändert oder
entfernt wurde, jeweils von einem Verwalter signiert. Dein Gerät prüft das ganze Protokoll, bevor
es den Tresor öffnet, und merkt sich, wie weit es reichte. Fehlt ein Eintrag, ist einer verändert
oder ist das Protokoll kürzer als beim letzten Mal, zeigt Kennwort den Hinweis, dass das
Protokoll nicht stimmt, und öffnet den Tresor nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-06-mitgliedschafts-log).
