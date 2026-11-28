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

Unter **Team → Tresore** (Team ist der dritte Punkt der Navigation; auf dem Desktop auch über
**Alle Tresore** in der Seitenleiste) stehen links alle geteilten Tresore, in denen du Mitglied bist,
und darunter dein persönlicher Tresor (**Nur für dich**).

Mit **Neuer Tresor** gibst du einen Namen ein und wählst **Tresor anlegen**. Wer einen Tresor
anlegt, verwaltet ihn.

## Mitglieder eines Tresors

Wählst du einen Tresor in der Liste, siehst du rechts seine Mitglieder, geordnet nach ihrer Rolle:

- **Verwalten**: Mitglieder hinzufügen, Rollen und Befristungen ändern, entfernen sowie Einträge
  anlegen und ändern.
- **Bearbeiten**: Einträge anlegen, ändern und kopieren.
- **Lesen**: Einträge ansehen und kopieren.

Wer den Tresor verwaltet, kann direkt dort:

- über **Person hinzufügen** (am Handy **Personen hinzufügen**) eine oder mehrere bestätigte
  Personen der Firma auswählen, eine Rolle festlegen und optional über **Befristen** ein Ablaufdatum
  (**Zugriff bis**) setzen. Noch nicht bestätigte Konten stehen ausgegraut mit einem Hinweis in der
  Auswahl, bis ihre Schlüssel unter **Team → Mitglieder** bestätigt wurden; dein Gerät verpackt den
  Tresor-Schlüssel nur an bestätigte Schlüssel.
- über das Menü **⋯** an einer Person ihre **Rolle** ändern, die **Befristung** anpassen oder
  aufheben und sie **aus dem Tresor entfernen**. Was die Person vorher entschlüsselt hat, kann sie
  behalten haben; deshalb wechselt dein Gerät beim Entfernen gleich den Tresor-Schlüssel (siehe
  [Wenn jemand geht](#wenn-jemand-geht)).

Rechts neben den Mitgliedern zeigt der **Verlauf** die signierten Änderungen aus dem Protokoll des
Tresors, zusammen mit einer kurzen Übersicht der Rollen. Ist ein geteilter Tresor in den Einträgen
offen, zeigt **Zugriff** über der Liste, wie viele ihn sehen, und führt zu ihm im Team.

Nach einem gesetzten Ablaufdatum öffnet kein Gerät den Tresor mehr für die Person, und der Server
gibt ihr das Protokoll und den Schlüssel nicht mehr; in der Liste steht dann **abgelaufen**. Ein
Tag, der schon vorbei ist, lässt sich nicht wählen. Wer abgelaufen ist, kann über den Link zum
Tresor erneut Zugriff anfragen; Freigeben verlängert dann seinen Zugriff ohne Ende.

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
Verwaltern: Am Tresor in der Liste erscheint ein Zähler, und über den Mitgliedern stehen die offenen
**Anfragen** zum **Freigeben** (zunächst mit der Rolle **Lesen**; die Rolle lässt sich danach über
**⋯** ändern) oder **Ablehnen**. Der Server gibt dir dabei nie selbst Zugriff; den Tresor-Schlüssel
verpackt erst das Gerät eines Verwalters an deine bestätigten Schlüssel. Freigeben geht darum nur,
wenn deine Schlüssel schon bestätigt sind.

## Was dein Gerät prüft

Zu jedem Tresor gehört ein Protokoll: Wer ihn angelegt hat, wer aufgenommen, geändert oder
entfernt wurde, jeweils von einem Verwalter signiert. Dein Gerät prüft das ganze Protokoll, bevor
es den Tresor öffnet, und merkt sich, wie weit es reichte. Fehlt ein Eintrag, ist einer verändert
oder ist das Protokoll kürzer als beim letzten Mal, zeigt Kennwort den Hinweis, dass das
Protokoll nicht stimmt, und öffnet den Tresor nicht. Wie das im Einzelnen geschützt ist, steht im
[Sicherheitsdesign](sicherheitsdesign.md#p-06-mitgliedschafts-log).
