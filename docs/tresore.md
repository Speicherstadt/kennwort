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

## Was dein Gerät prüft

Zu jedem Tresor gehört ein Protokoll: Wer ihn angelegt hat, wer aufgenommen, geändert oder
entfernt wurde, jeweils von einem Verwalter signiert. Dein Gerät prüft das ganze Protokoll, bevor
es den Tresor öffnet, und merkt sich, wie weit es reichte. Fehlt ein Eintrag, ist einer verändert
oder ist das Protokoll kürzer als beim letzten Mal, zeigt Kennwort den Hinweis, dass das
Protokoll nicht stimmt, und öffnet den Tresor nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-06-mitgliedschafts-log).
