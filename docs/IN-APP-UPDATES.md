> Ab 3.2.58 verwendet retourenboard PostgreSQL. Der **erste Wechsel von SQLite** erfolgt über den neuen Installer beziehungsweise Compose, nicht über den alten In-App-Updater. Erst nach dessen Neueinrichtung gelten PostgreSQL-Updates. [Migration, TLS/CA und Wiederherstellung](POSTGRESQL.md).

# In-App-Updates ab 3.2.0

## Einrichten

Auf Debian/Ubuntu oder einem Debian-LXC das aktuelle Installskript **3.2.6 oder neuer** einmal als root ausführen. Vorhandene Daten und Konten bleiben erhalten. Es installiert `retourenboard-updater.service` zusätzlich zum Anwendungsdienst `retourenboard.service`. Eine vorhandene `retourenverwaltung.service` wird dabei zum Kompatibilitätsalias. Die Dienstumbenennung und die Aktualisierung des privilegierten Updaterdienstes erfolgen über dieses Installskript; ein In-App-Update allein tauscht nur die Anwendungsdateien aus. Lokale Windowsvorschauen und Dockercontainer ohne diese systemd-Installation zeigen einen Hinweis statt einer Installationsmöglichkeit.

## Benutzen

1. Als Administrator **Adminbereich → Version & Updates** öffnen.
2. **Jetzt prüfen** auswählen. Nur ein neueres stabiles Release wird angeboten.
3. **Update installieren …** auswählen und mit aktuellem Passwort, gegebenenfalls 2FA-Code/Recoverycode und der Bestätigung abschließen.
4. Fortschritt abwarten. Während des Updates sind Änderungen gesperrt; nach dem Dienstneustart erneut anmelden. Der letzte Auftrag bleibt im Adminbereich sichtbar.

Ab Version **3.2.23** gibt die Oberfläche nach einem beendeten, fehlgeschlagenen
Auftrag einen erneuten Versuch frei. Die Statusabfrage berücksichtigt dabei die
Auftrags-ID, damit ein älteres Fehlerergebnis keinen neuen Versuch beendet.
Nach einer Zeitüberschreitung wird der Status weiter geprüft, solange dieser
Adminbereich geöffnet ist. Wenn `recoveryRequired` gesetzt ist, bleibt die
Installation gesperrt, bis die Wiederherstellung geklärt ist.

Bei älteren Oberflächen kann nach einem Fehler ein Neuladen der Seite die
verbliebene Klicksperre lösen. Damit wird keine Wartungs- oder Wiederherstellungs-
sperre auf dem Server entfernt.

Quelle ist ausschließlich `KaterBeratung/retourenboard`. Ein Release benötigt die Dateien `retourenboard-linux-<Version>.tar.gz` und `retourenboard-linux-<Version>.tar.gz.sha256`. Die Versionsprüfung, Veröffentlichung auf GitHub und Installation erfolgen nur auf Anforderung. Tags wie `v3.3.0` oder `3.3.0` werden unterstützt; Entwürfe, Vorabversionen, dieselbe Version und Downgrades werden abgelehnt.

Nach dem Wechsel von `AS0020` zu `KaterBeratung` den aktuellen Linuxinstaller einmal ausführen, damit auch der fest installierte Updaterdienst die neue Quelle verwendet. Ein reines In-App-Update ersetzt diesen Helper nicht. Docker benötigt ein passendes PostgreSQL-Image beziehungsweise einen geprüften lokalen Build; ein altes SQLite-`latest` darf nicht als PostgreSQL-Version gestartet werden; siehe [Docker-Anleitung](DOCKER.md).

Für Docker Compose im Verzeichnis der `compose.yaml`, nach einer Sicherung:

```sh
# Im vollständigen PostgreSQL-Paket; Datenvolumes beibehalten:
docker compose --env-file deploy/docker/.env -f deploy/docker/compose.yml up -d --build
```

Der Dienstname muss zur eigenen Compose-Datei passen. Das neue Image wird vom
Dockerhost geladen und der Container mit demselben Datenvolume neu erstellt.
Der UI-Versionscheck funktioniert auch im Container; die UI-Installation eines
Linuxpakets ersetzt jedoch kein Docker-Image.

## Sicherung und Rückfall

Vor der Übergabe erstellt die Anwendung eine normale Sicherung, die unter **Sicherungen** sichtbar ist. Der Updater stoppt danach den Anwendungsdienst und hält eine PostgreSQL-Datenbanklease. Er erstellt einen technischen Dump mit passenden Clienttools und kopiert den vollständigen Datenordner einschließlich MFA-Schlüsseln, Anhängen und Sicherungskatalog in einen privaten Rootordner. Der neue Prozess muss innerhalb von 30 Sekunden die erwartete Version melden. Bei einem Startfehler werden das bisherige Release und der Offline-Datenstand wieder eingesetzt. Bei einem Rückfall wird zuerst PostgreSQL wiederhergestellt, danach Dateien und Code. Nach bestätigtem Wechsel von SQLite zu PostgreSQL wird niemals die veraltete SQLite-Quelle gestartet. Unklare Zustände bleiben in Wartung.

Das Journal erlaubt auch den Wiederanlauf nach einem unterbrochenen Update. Kopien und Ordnerwechsel werden vor dem nächsten Journalschritt auf den Datenträger geschrieben. Wenn der Rückfall ebenfalls fehlschlägt, bleibt der Wartungsmodus aktiv; der Dienst behauptet keine erfolgreiche Wiederherstellung.

Zusätzliche Offline-Kopien liegen unter `/var/lib/retourenboard-updater/snapshots/`, Downloadpakete unter `/var/lib/retourenboard-updater/downloads/`. Nach einem Rückfall kann der fehlgeschlagene Datenstand als `/var/lib/.retourenboard-failed-<Auftrags-ID>` erhalten bleiben. Diese Rootordner und alte installierte Releases bleiben für Diagnose und manuelle Wiederherstellung erhalten und sind nicht über HTTP zugänglich. Speicherplatz im Blick behalten; eine Offline-Kopie benötigt ungefähr die Größe des gesamten Datenordners zusätzlich, vor dem Kopieren werden zwei Datenordnergrößen plus 128 MiB freier Platz geprüft.

## Technische Grenzen

Die Web-App läuft weiterhin als `retourenverwaltung`, ohne sudo oder allgemeine Rootbefehle. Der Rootdienst ist beim Einrichten fest unter `/usr/local/lib/retourenboard-updater/` installiert. Über den lokalen Unix-Socket nimmt er Updateaufträge mit Versionsnummer und Auftrags-ID entgegen. Zusätzlich bietet er fest begrenzte Diagnose- und Dienstfunktionen: die letzten 200 Journaleinträge ausschließlich von retourenboard.service sowie vorbereitete Neustartaufträge mit Auftrags-ID, kurzer Ablaufzeit und ausdrücklichem Commit bzw. Abbruch. Die Web-App prüft dafür Administratorrechte und beim Neustart die erneute Identitätsbestätigung. Journalargumente und Dienstname sind im Helper fest vorgegeben. Es gibt keine frei wählbaren URLs, Pfade oder Shellbefehle. Release-Dateien werden über HTTPS und SHA256 geprüft; Archivlinks, doppelte Pfade, Pfadtraversal, spezielle Dateien und zu große Pakete werden abgelehnt. Heruntergeladene Installskripte werden nicht als root ausgeführt. Die neue Anwendung startet durch systemd als normaler Dienstbenutzer.

Unterstützt sind die Standardpfade des Linuxinstallers, Node.js-Kompatibilität und der bestehende systemd-Dienst. Ein Release, das eine neue Node-Laufzeit oder andere technische Installationsschritte braucht, muss über das Linuxinstallskript installiert werden. Der feste Updaterdienst wird bei manuellen Installerläufen ebenfalls aktualisiert. Ein manueller Installer stoppt den Helper vor seinen Änderungen und lehnt einen unterbrochenen In-App-Auftrag zunächst ab, damit dessen Wiederherstellung abgeschlossen werden kann.

## Diagnose

```sh
sudo systemctl status retourenboard-updater retourenboard
sudo journalctl -u retourenboard-updater -n 50 --no-pager
sudo journalctl -u retourenboard -n 50 --no-pager
sudo systemctl restart retourenboard-updater
```

Ein Neustart des Updaterdienstes versucht ein vorhandenes Journal wiederherzustellen. Wartungsmarker oder Journale nicht vor einer geprüften Wiederherstellung löschen. Bei geänderten Datenpfaden/Diensteinheiten oder einem fehlgeschlagenen Rückfall die Installation und den privaten Offline-Datenstand auf dem Server prüfen.
