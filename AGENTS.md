# Projektregeln für retourenboard.

## Versionspflege

Der Benutzer möchte die Versionsnummer bei jeder abgeschlossenen Änderung mit anpassen.

- Die Version einmal je zusammenhängendem Änderungsauftrag erhöhen, nicht je Datei oder Testlauf.
- Ab jetzt bei jedem abgeschlossenen Änderungsauftrag ausschließlich die Patchnummer um `0.0.1` erhöhen, beispielsweise `3.2.0` → `3.2.1`.
- Diese Regel gilt auch für neue Funktionen und inkompatible Änderungen. Minor- und Majornummer nicht automatisch erhöhen.
- `package.json` ist die maßgebliche Versionsquelle. Eine vorhandene Lockdatei und vorhandene Build-Metadaten konsistent aktualisieren.
- Prüfen, dass die Anwendung die neue Version über `/api/session` und in ihrer Versionsanzeige ausgibt. Bei einem laufenden Server berücksichtigen, ob ein Neustart nötig ist.
- Bei jeder Versionsänderung die lokalen Linuxpakete mit `npm run package` neu erstellen und ihre Prüfsummen aktualisieren. Versionierte Pakete liegen unter `releases/<Version>/`, aktuelle Dateien unter `releases/latest/`. Beide und `releases/release-manifest.json` müssen denselben Stand enthalten. Ältere versionierte Pakete erhalten; keine erzeugten Pakete im Projekt-Hauptordner ablegen.
- GitHub nur auf ausdrücklichen Auftrag aktualisieren. Keine automatischen Pushes oder Veröffentlichungen.

## Einheitliches Logo

- `public/favicon.svg` ist die einzige maßgebliche Logo-Datei für retourenboard.
- Dasselbe SVG für Anwendung, Login, Adminbereich, Konto, Werbeseite, deren Produktvorschau und Favicons verwenden. Keine eigenen SVG-Kopien, Schriftzeichen oder Emoji als Markenlogo.
- Beide Builds übernehmen das Logo aus dieser Datei. Farben und Form bleiben in heller und dunkler Darstellung gleich; nur die Größe darf sich dem jeweiligen Platz anpassen.
- Bei Änderungen an der Oberfläche Desktop- und schmale mobile Ansichten, beide Farbschemata und DE/EN auf abgeschnittene Inhalte, Überdeckungen und unleserliche Texte prüfen.

## Lokales Ziel für Projektsicherungen

- Projektsicherungen unter `C:\Users\Alex\OpenCloud\Persönlich\retourenboard-backup` ablegen.
- Dieses Ziel ist für Projektdateien einschließlich Quellcode, Dokumentation und Beispielbilder vorgesehen. Datenbank- und Anhangssicherungen der Anwendung bleiben davon getrennt.
- Sicherungen mit Version und Zeitstempel eindeutig benennen, vorhandene Archive erhalten und Inhalt sowie Prüfsumme kontrollieren.
- Zugangsdaten, `.env`, produktive Daten, `.git`, Entwicklungsabhängigkeiten, temporäre Prüfdateien und das zusätzliche Unterprojekt `retourenboard/` nicht in Projektsicherungen übernehmen. Erzeugte Builds und Releasepakete können aus den Quellen neu erstellt werden.
- Der hinterlegte Pfad allein richtet keinen automatischen Sicherungszeitplan ein.
