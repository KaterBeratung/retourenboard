# retourenboard 4.0.102

Der Chat zeigt jetzt genau eine angeheftete Nachricht, die immer oben steht, Abstände und Ränder der Oberfläche folgen einheitlichen Maßen, und die Datenbankschicht führt Abfragen innerhalb einer Transaktion geordnet nacheinander aus. Bestehende Funktionen, Berechtigungen und Datenstrukturen bleiben erhalten. Dieser Release fasst die Versionen 4.0.99 bis 4.0.102 zusammen.

## Behoben und verbessert
- **Chat: eine angeheftete Nachricht, immer sichtbar:** Pro Unterhaltung gibt es eine Anheftung. Wer eine andere Nachricht anheftet, ersetzt die bisherige; dieselbe Nachricht erneut anzuheften ändert nichts, „Anheftung lösen“ lässt die Unterhaltung ohne Anheftung. Ein Banner oben im Chat zeigt Absender, bis zu drei Zeilen Text (am Handy zwei) und „Anheftung lösen“; ein Klick auf den Text springt zur Nachricht im Verlauf. Man muss nichts mehr aufklappen. Das Höchstlimit von 50 Anheftungen entfällt. Gleichzeitiges Anheften sperrt die Unterhaltung kurz, damit nicht zwei Anheftungen nebeneinander bestehen bleiben. Hatte eine Unterhaltung früher mehrere Anheftungen, bleibt beim Start nur die neueste bestehen. Die Rechte bleiben wie bisher.
- **Abstände vereinheitlicht:** Seitenköpfe haben auf allen Seiten denselben Abstand zum Inhalt (24 px, am Handy 20 px). Fußzeilen und Seitenwechsel der Listen, die Werkzeugleiste am Handy und die Listenkarten am Handy nutzen denselben Innenrand wie ihre Karten. Im Chat teilen sich Kopfzeile, Verlauf, Eingabefeld, Suche, angeheftete Nachricht und Hinweise denselben seitlichen Rand (20 px, auf Tablet und Handy 16 px). In der Verwaltung folgen die Abstände am Handy denselben Maßen.
- **Datenbank:** Innerhalb einer Transaktion starteten einige Stellen Abfragen gleichzeitig auf derselben Verbindung. Das gab beim Öffnen eines Chats die Treiberwarnung „Calling client.query() when the client is already executing a query is deprecated“ und würde mit pg 9 zum Fehler. Die Abfragen einer Transaktion laufen jetzt in Aufrufreihenfolge nacheinander, einschließlich Savepoints, Commit und Rollback. Verhalten und Fehlerbehandlung bleiben gleich.
- **Suchfelder am Handy:** Lange Hinweistexte in den Suchfeldern von Retouren, Entsorgung und Scannen wurden mitten im Wort abgeschnitten und enden jetzt mit „…“.

Bekannt und unverändert: Die Listen Retouren und Entsorgung scrollen bei einer Fensterbreite knapp über 1100 px noch seitlich, bevor sie auf Karten wechseln. Ab 1200 px passen sie.

## Installation
Node.js mindestens 24 und PostgreSQL 16–18. Vor Updates eine Sicherung erstellen.

```sh
sudo bash retourenboard-install-4.0.102.sh
```

Der kleine Installer lädt den Release und prüft SHA256. Ein daneben abgelegtes Programmpaket wird ebenfalls unterstützt. Der In-App-Updater bleibt verwendbar. Nach manuellem Dateiaustausch den Anwendungsprozess neu starten.

## Installationsdateien
Versionierte und stabile Namen für Installer und Linuxpaket, jeweils mit `.sha256`, plus `release-manifest.json`. Das Paket enthält den kompilierten Server, Frontend, Produktwebseite und Dokumentation.

## Prüfung
- 1.572 Tests, 1.569 bestanden, kein Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Neue Tests für die Abfragereihenfolge in Transaktionen (der erste schlägt ohne die Warteschlange nachweislich fehl), die Hinweistexte der Suchfelder, die einzelne Anheftung (Backend und Oberfläche) und die Abstandsmaße.
- Oberfläche in der Demo auf Desktop und Handy geprüft, hell und dunkel, Deutsch und Englisch; Abstände vor und nach der Änderung gemessen, keine seitlich überlaufende Seite bei 360, 390, 768 und 1024 px.
- `npm audit`: keine bekannten Sicherheitslücken in den Abhängigkeiten.
- Linuxpakete lokal gebaut, Prüfsummen und Manifest stimmen überein.
