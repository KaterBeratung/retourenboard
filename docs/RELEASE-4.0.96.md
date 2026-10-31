# retourenboard 4.0.96

Nachrichten öffnen jetzt den Vorgang, die Meldungsbalken passen zum Erscheinungsbild der Anwendung, und der Etikettendruck enthält nicht mehr den Seitenhintergrund. Bestehende Funktionen, Berechtigungen und Datenstrukturen bleiben erhalten.

## Verbessert
- **Nachrichten:** „Öffnen“ bei Hinweisen zu neuen oder überfälligen Retouren führt zur Retoure selbst statt nur zur Liste. Auch ältere Hinweise werden aufgelöst. Ein Klick irgendwo auf den Eintrag öffnet ihn, markiert ihn als gelesen und schließt die Nachrichtenübersicht.
- **Meldungsbalken:** Ungespeicherte Änderungen, Fehler und Erfolgsmeldungen im Stil der Anwendung: angehobene Fläche wie die Menüs, rundes farbiges Symbol, zarter Rand, kein halbmondförmiger Randstreifen mehr. Gleiches Aussehen auf der Anmeldeseite und am Handy.

## Behoben
- **Etikett drucken:** Der Hintergrund der Seite (Verlauf, Körnung, Lichtkurven) wurde beim Druck mit ausgegeben. Der Druck bleibt jetzt auf dem Etikett: weißes Papier, helles Farbschema, keine Meldungsbalken, in allen Etikettengrößen.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.96.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.546 Tests bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Nachrichten mit echtem Klick geprüft; Meldungsbalken in hell und dunkel, Desktop und Handy aufgenommen.
- Etikettendruck mit Druckmedium und PDF-Ausgabe (Hintergrundgrafiken an) für alle Größen geprüft.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
