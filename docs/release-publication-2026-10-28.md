# GitHub-Veröffentlichung 4.0.72 – 28.10.2026

Release: https://github.com/KaterBeratung/retourenboard/releases/tag/v4.0.72
Quellcode: https://github.com/KaterBeratung/retourenboard/commit/77db925b8f646512f552c613d62cbfe76501a40d

- `main` per geprüftem Vorwärts-Update von `4168aad` aktualisiert. Zwischenzeitliche README-Änderungen erhalten; keine Historie überschrieben.
- 896 öffentliche Quelldateien, 18 Änderungen. Der Git-Baum `c96f76f162d33e873b2270aacf49cc4cd3444b72` stimmt mit dem geprüften Veröffentlichungsstand überein. Ursprünglicher Arbeitsordner und seine unzugehörigen Änderungen bleiben erhalten.
- Frisches `npm ci`, `npm run build`, `npm test` und `npm run package` unter Node.js 24.22.1 erfolgreich. 1.475 Tests insgesamt, 1.472 bestanden, null Fehler, drei umgebungsbedingte Auslassungen unter Windows; 184,65 Sekunden.
- Abhängigkeitsprüfung meldet null bekannte Schwachstellen. Dies ersetzt keinen vollständigen Sicherheitsaudit.
- 1.405 Archivdateien mit dem bereinigten Quell-/Build-Stand verglichen, Lizenz enthalten. Keine private .env, SMTP-Testschlüssel, produktiven Daten, lokalen Sicherungen oder Entwicklungsabhängigkeiten veröffentlicht.
- Extrahiertes Paket ohne node_modules gestartet: Version, Anmeldung, private Assets, SQLite-Testmigration ohne Änderung der Quelldatei, fortlaufende IDs und Entsorgungsnachweis geprüft.
- Stabile Veröffentlichung v4.0.72, Release-ID 427010873. Tag zeigt auf den geprüften Commit 77db925.
- Neun Uploads: versionierter und stabiler Installer, versioniertes und stabiles Linuxpaket, jeweils SHA256-Datei, sowie release-manifest.json. Zusätzlich stellt GitHub zwei Quellcodearchive bereit.
- Alle neun GitHub-Dateigrößen und SHA256-Metadaten stimmen mit den lokalen Uploads überein. Alle öffentlichen Downloads antworten erfolgreich; kleinere Dateien zusätzlich heruntergeladen und gehasht, beide großen Archive per HEAD sowie GitHub-SHA256 geprüft.
- Lokale Dateien unter releases/4.0.72/, releases/latest/ und releases/release-manifest.json stimmen mit den veröffentlichten Paketen überein. Ältere Versionen bleiben erhalten.

Linuxarchiv: 53.149.535 Bytes, SHA256 `ca0c619d9733ae1f807bdbb593991e772b1a3e1d91fdd805be1c687eb109ca3c`.

Docker: Der bestehende Veröffentlichungsablauf https://github.com/KaterBeratung/retourenboard/actions/runs/40741712373 (Job 123004748145) ist erfolgreich abgeschlossen. Die öffentlichen Tags `ghcr.io/katerberatung/retourenboard:4.0.72` und `latest` zeigen auf denselben geprüften OCI-Index `sha256:adc57e8af83b68f479cafb951d253e4afac54b645753caeb368c99f382533858`, jeweils mit Linux AMD64 und ARM64. Keine zusätzlichen Zugriffsrechte oder Einstellungen geändert.

Bekannte Grenzen: drei Windows-/Linux-Dateisymlinktests übersprungen; Website-Betreiber-/Hostingangaben bleiben erforderlich, pg-9-Zukunftswarnung in der synthetischen Vorschau unverändert. Keine Cloud-Sicherung in diesem Veröffentlichungsauftrag.
