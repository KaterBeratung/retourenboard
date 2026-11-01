# GitHub-Veröffentlichung 4.0.93 – 31.10.2026

Release: https://github.com/KaterBeratung/retourenboard/releases/tag/v4.0.93
Quellcode: https://github.com/KaterBeratung/retourenboard/commit/d838a8fc3c1aefe9b8945f151de357f8e65bb116

- `main` per Vorwärts-Update von `b101d97` auf `d838a8f` aktualisiert (ein Commit, 168 Dateien, 4.684 Einfügungen, 1.487 Löschungen); keine Historie überschrieben. Autor ist die öffentliche Noreply-Adresse des Kontos. Das Tag `v4.0.93` (annotiert) zeigt auf diesen Commit.
- Der Veröffentlichungsstand wurde aus einem frischen Klon von `main` erzeugt, in den die öffentlichen Quelldateien des Arbeitsstands 4.0.93 übernommen wurden (nach `.gitignore`; ohne `.claude/`, `releases/`, `AGENTS.md` und die internen Änderungsnotizen). Die drei nur auf GitHub vorhandenen Bilder `docs/readme/screenshots/retourenboard-banner*.png` und `retourenboard-icon.png` blieben erhalten. Die Änderungen wurden vor dem Senden auf Schlüssel, private Konfigurationen, Sicherungen und Datenbankdateien durchsucht; es gab keine Treffer.
- Vollständiger Build und `npm test`: 1.542 Tests, 1.539 bestanden, null Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Stabile Veröffentlichung v4.0.93, als neueste Version markiert. Neun Uploads: versionierter und stabiler Installer, versioniertes und stabiles Linuxpaket, jeweils SHA256-Datei, sowie `release-manifest.json`. Größen und SHA256-Prüfsummen aller neun Dateien auf GitHub stimmen mit den lokalen Dateien unter `releases/4.0.93/`, `releases/latest/` und `releases/release-manifest.json` überein. Der stabile Download-Link `releases/latest/download/retourenboard-install.sh` antwortet erfolgreich.

Linuxarchiv: 65.164.461 Bytes, SHA256 `e1003ecf7e090b5d162ad654b9dde5a4bd71e562aef1f5a98e3affa23b30d2b4`.

Docker: Der bestehende Veröffentlichungsablauf (Lauf 41230810518) ist erfolgreich abgeschlossen. Die öffentlichen Tags `ghcr.io/katerberatung/retourenboard:4.0.93` und `latest` zeigen auf denselben OCI-Index `sha256:a189a3f1f98c468936cfc4dbd720a501533c76a9de36a7d6362f265d2f50c0e3` mit Linux AMD64 und ARM64.

Zugang: Die Anmeldung erfolgte einmalig über die GitHub-Befehlszeile (`gh` 2.103.3, per winget für das Benutzerkonto installiert; Browser-Anmeldung als `KaterBeratung`). Der Zugangsschlüssel liegt im Windows-Anmeldeinformationsspeicher; in Git-Einstellungen oder Dateien wurde nichts hinterlegt.

Hinweis: Der Arbeitsordner `D:\retourenboard` steht weiterhin auf Version 4.0.72 und ist gegenüber GitHub veraltet. Der Stand 4.0.93 wurde nicht dorthin übertragen.

Bekannte Grenzen: drei Windows-/Linux-Dateisymlinktests übersprungen; Website-Betreiber-/Hostingangaben bleiben erforderlich. Keine vollständige neue Sicherheitsprüfung und keine Cloud-Sicherung in diesem Veröffentlichungsauftrag.

## Nachtrag: 4.0.97 (31.10.2026)

Release: https://github.com/KaterBeratung/retourenboard/releases/tag/v4.0.97
Quellcode: https://github.com/KaterBeratung/retourenboard/commit/ff987f6338bf21e424708526aac0f240ed4fb41c

- `main` per Vorwärts-Update von `bcab8a8` (4.0.94) auf `ff987f6` aktualisiert (ein Commit, 31 Dateien, 388 Einfügungen, 33 Löschungen); keine Historie überschrieben. Das annotierte Tag `v4.0.97` zeigt auf diesen Commit. Der Stand umfasst 4.0.95 bis 4.0.97: Nachrichten öffnen den Vorgang, neue Meldungsbalken, Etikettendruck ohne Seitenhintergrund, drei feste Standard-Status mit optionalen eigenen Status.
- Vorgehen wie bei 4.0.93: frischer Stand von `main`, öffentliche Quelldateien übernommen (ohne `.claude/`, `releases/`, `AGENTS.md` und interne Änderungsnotizen), die drei nur auf GitHub vorhandenen Bilder blieben erhalten. Vor dem Senden Suche nach Schlüsseln und sensiblen Dateien ohne Treffer.
- Vollständiger Testlauf: 1.555 Tests, 1.552 bestanden, null Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Stabile Veröffentlichung v4.0.97, als neueste Version markiert. Neun Uploads: versionierter und stabiler Installer, versioniertes und stabiles Linuxpaket, jeweils SHA256-Datei, sowie `release-manifest.json`. Größen und SHA256-Prüfsummen aller neun Dateien auf GitHub stimmen mit den lokalen Dateien überein; der stabile Download-Link antwortet mit 200.
- Linuxarchiv: 65.176.970 Bytes.
- Docker: Veröffentlichungslauf 41240129321 erfolgreich. `ghcr.io/katerberatung/retourenboard:4.0.97` und `latest` zeigen auf den OCI-Index `sha256:5fc86ec2cfc42357fa46c6fd7f83fb878257497951c71ae0f53006004f150f91` mit Linux AMD64 und ARM64.
- Zwischenstand 4.0.94 (31.10.2026): Release v4.0.94 und Docker-Lauf 41233200609 erfolgreich, `main` bei `bcab8a8`.
- `D:\retourenboard` steht weiterhin auf 4.0.72; der Stand wurde nicht dorthin übertragen.

## Nachtrag: 4.0.98 (31.10.2026)

Release: https://github.com/KaterBeratung/retourenboard/releases/tag/v4.0.98
Quellcode: https://github.com/KaterBeratung/retourenboard/commit/c58603d2c063205340704de8a3f158cd3bd1dcc1

- `main` per Vorwärts-Update von `ff987f6` auf `c58603d` aktualisiert (ein Commit, 12 Dateien, 87 Einfügungen, 8 Löschungen); keine Historie überschrieben. Das annotierte Tag `v4.0.98` zeigt auf diesen Commit. Inhalt: Etikettendruck ohne zusätzliche leere Seite, Sprach- und Farbschema-Schalter der Anmeldeseite am Handy auf einer Höhe. Vorgehen, Ausschlüsse und Schlüsselsuche wie bei 4.0.97 (keine Treffer).
- Vollständiger Testlauf: 1.558 Tests, 1.555 bestanden, null Fehler, drei umgebungsbedingte Auslassungen unter Windows.
- Stabile Veröffentlichung v4.0.98, als neueste Version markiert. Neun Uploads wie bei 4.0.97. Größen und SHA256-Prüfsummen aller neun Dateien auf GitHub stimmen mit den lokalen Dateien überein; der stabile Download-Link antwortet mit 200.
- Linuxarchiv: 65.177.972 Bytes.
- Docker: Veröffentlichungslauf 41247163370 erfolgreich. `ghcr.io/katerberatung/retourenboard:4.0.98` und `latest` zeigen auf den OCI-Index `sha256:e9bc327aa415eeb2b1d67c3e6a08197cc247767a7ef6cd35398c37572954a82a` mit Linux AMD64 und ARM64.
- Diese Ergänzung der Veröffentlichungsnotiz liegt nur lokal und geht beim nächsten Veröffentlichungsauftrag mit.
