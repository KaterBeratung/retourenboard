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
