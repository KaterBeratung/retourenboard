# Allgemeine Fehlerprüfung und Release 4.0.71 — 28.10.2026

## Ergebnis

- Öffentlicher Quellstand auf `main`: **29076275b90c504257cf6b21bcf78a250b968759**. 104 geänderte Dateien gegenüber dem letzten Remote-Stand; der öffentliche Baum umfasst 891 Dateien.
- Erwarteter und auf GitHub erzeugter Git-Baum stimmen exakt überein: `9a9db75a08eb36fb57a602b2b6d7c65bae4e0818`. Folgecommit von `13c2c11560dd9580072971cad37a9773e3dd1327`, kein Force-Push.
- [Release 4.0.71](https://github.com/KaterBeratung/retourenboard/releases/tag/v4.0.71) ist veröffentlicht und als Latest markiert. Tag und Release zeigen auf den geprüften Commit.
- Alle **neun** selbst hochgeladenen Dateien sind vollständig vorhanden. GitHub meldet für jede Datei genau die lokal geprüfte Größe und SHA256. Hinzu kommen die zwei von GitHub erzeugten Quellcodearchive.
- Linuxpakete unter `releases/4.0.71/`, `releases/latest/` und `releases/release-manifest.json` im aktiven Projekt sind konsistent aktualisiert. Ältere versionierte Pakete bleiben erhalten.

## Gefunden und behoben

### Nodemailer-Adressauflösung

Die frische Installation meldete eine moderate Abhängigkeitslücke mit drei Adressparser-Advisories. Die drei Offline-Regressionen erzeugten mit Nodemailer 10.0.15 tatsächlich einen Empfänger an der falschen Beispieldomain. Die feste Abhängigkeit ist jetzt **10.2.1**. Dieselben Eingaben bleiben nach dem Update beim vorgesehenen Empfänger beziehungsweise der vorgesehenen Domain. Die Prüfung verwendet den realen Mail-Envelope ohne Netzwerkversand.

Die Quote-/Localpart-Serialisierung normalisiert ein Zeichen; der dritte Test prüft deshalb die relevante Domain-Grenze und genau einen Empfänger. Ein unabhängiger Prüfer bestätigte das auch gegen das kompilierte SMTP-Bundle. TLS-/Zertifikatsprüfung und bestehende SMTP-Tests bleiben erhalten. Die aktualisierte vollständige Abhängigkeitsinstallation meldet **0 bekannte Schwachstellen**.

Quellen: [verschachtelte Kommentare](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8), [Gruppenkommentare](https://github.com/advisories/GHSA-m943-m63m-w62w), [angeführte Adressbestandteile](https://github.com/advisories/GHSA-85x2-q946-cp5h).

### Fehlende Projektlizenz im Paketbau

Die Archivprüfung fand, dass die maßgebliche Projektlizenz nicht automatisch mitverpackt wurde. Der vorhandene Linuxpakettest reproduzierte den fehlenden Inhalt. Der Paketbau kopiert die Lizenz jetzt zentral nach **docs/readme/LICENSE**, ohne Arbeitsdateien zu verändern. Dieser Pfad erhält die Kompatibilität mit den bisherigen strengen Updater-Archivregeln. Eine zunächst erprobte Ablage auf oberster Archivebene wurde durch den Laufzeittest abgewiesen und verworfen; die bestehenden Schutzregeln wurden nicht aufgeweicht.

Der Test prüft sowohl Vorhandensein als auch unveränderten vollständigen Lizenzinhalt. Das Fixture für einen unvollständigen Build enthält ebenfalls die Ausgangslizenz, sodass seine ursprüngliche Laufzeitprüfung aussagekräftig bleibt.

### GitHub Container Registry

Der automatische Lauf baute die Docker-Images für **linux/amd64 und linux/arm64** erfolgreich. Die Veröffentlichung wurde mit **permission_denied: write_package** abgewiesen. Beim bestehenden öffentlichen Paket war unter „Manage Actions access“ kein Repository eingetragen.

Die automatische Freigabeprüfung lehnte bereits das Vormerken des Repositorys ohne konkrete Zustimmung ab. Es wurde kein anderer Weg versucht. Danach hat der Nutzer ausdrücklich nur die Freigabe von **KaterBeratung/retourenboard** und den erneuten Docker-Lauf erlaubt. Genau dieses Repository wurde hinzugefügt und von der voreingestellten Leserolle auf **Write** gesetzt. Keine Adminrolle, weiteren Repositorys, Personen- oder Codespaces-Freigaben wurden hinzugefügt. Screenshot der gespeicherten Zuordnung liegt im Nachweisordner.

Der fehlgeschlagene [Lauf 40712636039](https://github.com/KaterBeratung/retourenboard/actions/runs/40712636039) wurde nach dieser Freigabe über die GitHub-Schnittstelle erneut gestartet. **Wiederholung erfolgreich:** Job 122909847664 hat sämtliche Schritte einschließlich Build, Upload und Nacharbeiten erfolgreich abgeschlossen. Beide Architekturen sind auf der öffentlichen Paketseite als Version 4.0.71 sichtbar; die Tags 4.0.71 und latest zeigen auf den neuen Manifest-Digest `sha256:a1408128c36905c7f406bd51c4b96ee9dc67cb59b4e4ff429a7b494b18a9cff7`. [Docker-Paket](https://github.com/KaterBeratung/retourenboard/pkgs/container/retourenboard).

## Durchgeführte Prüfung

- Node.js **24.22.1**. Frisches `npm ci`, `npm run build`, vollständiges `npm test`, `npm run package` und zusätzliche Prüfung der extrahierten Laufzeit.
- Abschließende Suite des bereinigten Kandidaten nach allen Codekorrekturen: **1.461 Tests, 1.458 bestanden, 0 fehlgeschlagen, 3 übersprungen**, 163,70 Sekunden.
- Die drei unveränderten Windows-Auslassungen betreffen Dateisymlinks. Linux- und Junction-Prüfungen bleiben ansonsten enthalten.
- Zusätzlich **10 gezielte Paket-/Installations-/Laufzeittests** nach dem Lizenzfix erfolgreich.
- Compiler und Build erfolgreich. Das bereinigte Paket startet ohne `node_modules`. `/api/session` und Gesundheitsprüfung liefern 4.0.71. Migration aus einer synthetischen SQLite-Datei wurde geprüft, einschließlich unveränderter Quellbytes und Sequenz-Höchststand. Anmeldung, private Assets, Entsorgungsfreigabe/-abschluss und Nachweis erfolgreich.
- **1.400 Archivdateien** gegen den bereinigten Quellstand/Build geprüft, einschließlich normalisierter Shell-Zeilenenden und aus der maßgeblichen Lizenz abgeleiteter Paketkopie. Keine Links oder verbotenen Laufzeitpfade enthalten. Die vier primären Paketdateien und deren Prüfsummen sowie das Manifest stimmen überein.
- Hauptansichten Übersicht, Retouren, Produkte, Entsorgung, Scan und Chat bei 1440 × 900 und 320 × 852, Dunkel/Deutsch und Hell/Englisch: 24 Kombinationen. Zusätzlich drei Admin-Smokechecks. Kein gemessener horizontaler Seitenüberlauf in den insgesamt **27** Messungen.
- Produktwebseite zusätzlich in vier Desktop-/Mobil-/Theme-/Sprachkombinationen geprüft; Datenschutzdialog und Geräteumschaltung kontrolliert. Keine horizontalen Überläufe oder Browserkonsolenfehler. Desktop-Beispielbild lädt mit 3840 × 2160 Pixeln.
- Unabhängiges Read-only-Schlussreview der aktuellen Quelländerungen und kompilierten Mail-/Laufzeitverträge ohne weiteren konkreten wichtigen Blocker. Der später durch die Archivprüfung gefundene Lizenzfehler ist mit RED→GREEN, zehn gezielten Fällen und der vollständigen Suite abgesichert.
- Temporäre Release-Prüfvorschauen 3023/3024, deren Tabs und ausschließlich zugehörige synthetische Tempdaten entfernt; bestehende Vorschauen und Benutzertabs erhalten. Viewport-Vorgaben zurückgesetzt.

## Öffentlichkeitsprüfung

Der Kandidat entstand als isolierte Kopie auf Basis des aktuellen GitHub-main. Die ursprünglichen lokalen Änderungen und deren Git-Verlauf wurden nicht zurückgesetzt. Der separate Veröffentlichungsklon ist auf den publizierten Commit abgeglichen.

Ausgeschlossen bleiben private `.env`, produktive Daten, Datenbanken, Anhänge, Schlüsseldateien, lokale Werkzeuge und interne neue QA-/Planungsdokumente. Bereits öffentliche ältere Prüfnotizen wurden unverändert erhalten. Der SMTP-Testschlüssel und das Testzertifikat sind wie beauftragt nicht veröffentlicht; die Tests erhielten sie über einen lokalen Fixturepfad außerhalb des Kandidaten.

Der Inhaltsscan zeigte keine privaten Schlüssel, bekannten GitHub-/AWS-/Servicetoken oder Werte aktiver Geheimniskonfiguration. Generische Passwort-/URL-Treffer stammen aus synthetischen Tests, Beispieldokumentation und Vorschaukonten; die zwei vermeintlichen lokalen Pfadtreffer waren generische Backup-Dateinamen. Kritische Dateien wurden auch im extrahierten Paket ausgeschlossen. Es wurden keine produktiven Konfigurationen, Zugänge oder Anwendungsdaten geändert.

## Geänderte Dateien dieses Prüf- und Releaseauftrags

- `package.json`, `package-lock.json`: Version 4.0.71 und feste Nodemailer-Version 10.2.1.
- `README.md`, `README_EN.md`, `docs/readme/README.md`, `docs/readme/README_EN.md`: Versionsangaben.
- `scripts/build-linux-installer.mjs`: zentrale, mit bisherigen Updatern kompatible Lizenzbeilage.
- `tests/mail-address-parser.test.js`: drei Offline-Regressionen.
- `tests/linux-package.test.js`, `tests/installer-testing.test.js`: Lizenzinhalt und passendes Buildfixture.
- `docs/RELEASE-4.0.71.md`: öffentliche Änderungen, Installation und Prüfgrenzen.
- Generierte Builds, versionierte/stabile Pakete und Release-Manifest. Die übrigen auf GitHub nachgeführten Änderungen stammen aus den zuvor autorisierten Kundenstatus-/UI-Aufträgen.

## Grenzen und verbleibende Hinweise

Dies ist eine allgemeine Regression-, Abhängigkeits-, Darstellungs- und Veröffentlichungsprüfung, kein vollständiges unabhängiges Sicherheitsaudit. Kein physisches iPhone/Safari, realer Drucker/Scanner, externer SMTP-Versand oder produktiver OpenID-Anbieter wurde neu getestet.

Die unveränderte lokale Vorschau meldet einen Hinweis zu künftig nicht mehr unterstützter Abfrageparallelität in pg9; eingebunden bleibt pg8.23.1. Keine aktuelle Funktionsstörung beobachtet. Ein Upgrade auf pg9 wird dadurch nicht als geprüft ausgewiesen. Betreiber-/Hostingangaben in `website/legal.json` müssen vor eigener Veröffentlichung der Werbeseite ergänzt werden. Diese Hinweise wurden nicht mit erfundenen Angaben beseitigt.

Nachweise: `.qa/release-4.0.71/` sowie `C:\Users\Alex\.codex\visualizations\2026\10\05\01a10b8a-04dc-77c0-8111-4c536d046e6d\release-4.0.71`. Öffentliche Releasehinweise liegen zusätzlich im veröffentlichten GitHub-Tag. Keine zusätzliche Cloud-Sicherung ausgelöst.
