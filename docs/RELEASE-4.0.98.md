# retourenboard 4.0.98

Der Etikettendruck legt keine Seitenhöhe mehr an, die eine zusätzliche leere Seite verursachen kann, und die Schalter für Sprache und Farbschema auf der Anmeldeseite sitzen am Handy auf einer Höhe. Bestehende Funktionen, Berechtigungen und Datenstrukturen bleiben erhalten.

## Behoben
- **Etikett drucken:** Das gedruckte Etikett war genau so hoch wie das Papier. Rundet ein Druckertreiber die Seite minimal ab, rutschte ein winziger Rest auf eine zweite, leere Seite. A4 und das allgemeine Drucklayout richten sich jetzt nach ihrem Inhalt und werden nie breiter als der bedruckbare Bereich; 103 × 164 mm und 62 × 29 mm bleiben 0,6 mm unter der Papierhöhe. Die Vorschau am Bildschirm ändert sich nicht. Bei 62 × 29 mm erscheinen weiterhin zusätzliche Geräteetiketten für Seriennummer und Austauschseriennummer, wie in der Vorschau angekündigt.
- **Anmeldeseite am Handy:** Der Sprachschalter saß bis 760 px Breite 4 px höher beziehungsweise tiefer als der Knopf für Hell und Dunkel. Beide haben jetzt bei jeder Breite denselben oberen Rand, dieselbe Höhe und einen gleichbleibenden Abstand.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.98.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.555 von 1.558 Tests bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Druck als PDF für alle vier Etikettengrößen bei Retouren sowie für Entsorgungsetiketten und -nachweise: eine Seite pro Etikett, auch bei erzwungenem A4-, Letter- und A6-Papier.
- Schalter der Anmeldeseite bei 320 bis 1280 px Breite gemessen, in Deutsch und Englisch, hell und dunkel.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
