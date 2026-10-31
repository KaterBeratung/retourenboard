# retourenboard 4.0.94

Kleine Korrektur der Oberfläche. Bestehende Funktionen, Berechtigungen und Datenstrukturen bleiben erhalten.

## Behoben
- **Streifen neben der letzten Tabellenspalte:** Auf der Übersicht („Aktuelle Retouren“) und in den Listen Retouren, Produkte und Entsorgung endeten Kopfzeile, Hover-Fläche und Trennlinien kurz vor dem Rand der Karte. Eine dauerhaft reservierte, leere Leiste für die Bildlaufleiste war die Ursache; Tabellen reichen jetzt bis an den Rand. Muss eine Liste scrollen, steht die schmale Leiste wie üblich am Rand.
- **Gleiche leere Leiste an drei weiteren Stellen entfernt:** Menü „Tabellenansicht“ (Inhalt war nach links verschoben), Trefferliste der Suche und PDF-Liste im Scandialog.
- Alle Bildlaufbereiche, Tabellen und möglicherweise abgeschnittenen Inhalte der Hauptansichten, Menüs, Dialoge, der Administration und des Chats wurden vermessen; weitere Stellen dieser Art gibt es nicht.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.94.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.541 Tests bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Tabellen, Menüs und Dialoge in hell und dunkel mit Hover gemessen und angesehen.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
