# retourenboard 4.0.103

Die Produktseite erhält zusätzliche Animationen: gestaffelt einlaufende Abschnitte, kleine Szenen in den Funktionskarten, einen Lichtglanz auf der Hauptüberschrift, eine Zeigertiefe im Einstieg, eine Fortschrittslinie beim Scrollen und einen getippten Installationsbefehl. Die Anwendung selbst, Berechtigungen und Datenstrukturen bleiben unverändert.

## Verbessert
- **Einstieg:** „Chaos raus.“ bekommt einmal einen Lichtglanz, in hellem und dunklem Farbschema sichtbar. Der Punkt im Abzeichen pulsiert ruhig, und der Haken im Hinweis „Seriennummer erfasst“ zeichnet sich bei jedem Scandurchlauf der Illustration neu. Mit einem Mauszeiger neigt sich die Szene leicht zur Zeigerposition; bei Touchbedienung bleibt sie still.
- **Fortschrittslinie:** Ein dünner Balken am oberen Seitenrand zeigt die Leseposition. Er läuft ohne Skript über die Scrollposition und fehlt in Browsern ohne diese Unterstützung.
- **Abschnitte:** Überschrift, graue zweite Zeile und Einleitungstext laufen nacheinander ein. Vorteilsleiste, Workflow-Schritte, Funktionskarten, Häkchenliste, Installationsschritte und Fragen werden gestaffelt aufgebaut; nebeneinanderstehende Funktionskarten beginnen leicht versetzt.
- **Funktionskarten und Workflow:** Jede Funktionskarte spielt beim ersten Erscheinen eine kleine Szene einmal ab, etwa Ablaufkette, Strichcode, Scan mit gezeichnetem Haken, auffächernde Dokumente, Chat, Zugriffsliste und Entsorgungsnachweis. Im Workflow-Beispiel erscheinen bei jedem Schritt Nachricht, Avatar oder Haken und Dateichips neu.
- **Dein Server und Installation:** Die Server blinken, die Verbindung wächst und ein Datenpaket läuft zum Board. Das Terminal tippt den Installationsbefehl, auch nach dem Wechsel zwischen „Ausprobieren“ und „Installieren“. „Befehl kopieren“ bestätigt mit einem Ring; der Befehlstext bleibt unverändert kopierbar.
- **Rücksicht auf Bewegung:** Alle neuen Effekte stehen unter normaler Bewegung. Bei reduzierter Bewegung im System, ausgeschaltetem Schalter „Animationen“ und im Druck bleibt die fertige Seite ohne Bewegung stehen. Elemente mit bestehender Hover-Animation bekommen keine zweite Einblendanimation, damit beim Verlassen einer Karte nichts erneut abläuft.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.103.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.587 Tests, 1.584 bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows. Neu sind 15 Tests für die Animationen der Produktseite.
- Szenen bei festgesetzten Zeitpunkten angesehen: Desktop und Handy, hell und dunkel, Deutsch und Englisch. Zeigertiefe, Touch, reduzierte Bewegung, erneutes Tippen und Kopierbestätigung im Browser geprüft.
- Die fertige Seite hat bei 390, 768, 1024 und 1440 px dieselbe Geometrie wie mit reduzierter Bewegung, ohne seitliches Scrollen.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
