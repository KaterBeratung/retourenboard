# retourenboard 4.0.93

Neues Erscheinungsbild „Nachtgrün“, klarer gegliederte Oberfläche, weiche Animationen, überarbeitetes Retourenetikett und eine im selben Stil neu gestaltete Werbeseite. Bestehende Funktionen, Berechtigungen und Datenstrukturen bleiben erhalten.

## Verbesserungen
- **Look „Nachtgrün“:** Tiefe Marineblau-Flächen, das leuchtende Grün des App-Symbols, ein ruhiger gekörnter Hintergrund mit feinen Lichtkurven (hell und dunkel), überarbeitete Anmeldeseite und Fehlerseiten. Abmelden und der Hinweis auf neue Versionen sitzen jetzt in der Seitenleiste.
- **Übersicht und Listen:** Die Übersicht ist klarer gegliedert und zeigt mehr Informationen (zum Beispiel offener Warenwert und überfällige Retouren). Aktionen zu einer Retoure liegen am Desktop und am Handy hinter einem Drei-Punkte-Menü. Ruhigere Werkzeugleisten am Handy, Tabellen ohne überflüssige Trennlinien, Stammdaten-Reiter im Stil der Statusreiter, sinnvoll sortierte Menüs.
- **Weiche Animationen:** Kennzahlen zählen hoch, Kachel-Symbole poppen auf, Balken werden gezeichnet, die Anmeldeseite baut sich nacheinander auf. Alles bleibt abschaltbar (Einstellung „Animationen“ und „Bewegung reduzieren“), und kein Element, das man anklickt, bewegt sich.
- **Retourenetikett:** Klare Rangfolge mit großer Retourennummer, größerer QR-Code, Seriennummern mit Strichcode in einer Zeile. Das Format 103 × 164 mm passt jetzt auch voll befüllt auf die Fläche. Das Entsorgungsetikett nutzt denselben Aufbau.
- **Hover und Menüs geprüft:** Die Suche in der Seitenleiste ist im hellen Farbschema beim Darüberfahren wieder lesbar. Hover-Zustände bleiben auf Touch-Geräten nicht mehr hängen. Aufklappmenüs, Auswahllisten, Kurzinfos und Tastaturfokus wurden in allen Ansichten geprüft.
- **Handy und Bedienung:** Schriftgrößen mindestens 11 px, größere Trefferflächen für Textlinks, kein Springen und Flackern beim Seitenwechsel.
- **Werbeseite:** Im selben Look wie die Anwendung, mit neuem Symbol, Markenverlauf und dem Hintergrund der Anwendung. Alle Beispielbilder und alle README-Aufnahmen zeigen die aktuelle Oberfläche (Deutsch/Englisch, hell/dunkel, Desktop und Handy).

## Intern
- Serverstruktur: Anfragebehandlung in eigene Routenmodule aufgeteilt, ohne Änderung des Verhaltens.
- Statische Prüfung des Frontends auf vergessenes HTML-Escaping.
- Neue Tests für Animationen, Etikett, Hover-Schutz und Werbeseite.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.93.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.539 Tests bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Oberfläche in Desktop- und Handybreite, hell und dunkel, Deutsch und Englisch geprüft; Hover, Aufklappmenüs, Auswahllisten und Tastaturfokus in allen Hauptansichten gemessen.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
