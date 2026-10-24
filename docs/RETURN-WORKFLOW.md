# Retourenworkflow

## Eingang und Seriennummern

Eine Seriennummer eingeben oder mit Kamera, Foto, PDF beziehungsweise USB-Scanner übernehmen. Die Suche prüft ursprüngliche **und Austauschseriennummern** auf vollständige Übereinstimmung. Groß-/Kleinschreibung und kompatible Unicode-Zeichen werden vereinheitlicht, Bindestriche und führende Nullen bleiben erhalten. Vorhandene Vorgänge lassen sich direkt öffnen; ein erneuter Rückläufer desselben Geräts bleibt möglich. Die Scan-Erfassung verlangt dafür eine ausdrückliche Bestätigung.

## Bearbeitung und Übergabe

In den Retourendetails öffnet **Übergabe** ein gemeinsames Formular für offenen Status, aktive verantwortliche Person und nächsten Schritt. Die drei Angaben werden zusammen gespeichert. Bei einer zwischenzeitlich geänderten Retoure muss der Vorgang erneut geöffnet werden. Die Aktion benötigt Retourenbearbeitung und Statusberechtigung.

## Abschlussprüfung

Beim Auswählen eines abgeschlossenen Status zeigt das Formular die noch fehlenden Angaben. Standardmäßig sind eine entschiedene Lösung und bei Austausch eine Austauschseriennummer erforderlich. Ein offener verknüpfter Entsorgungsauftrag muss zuerst durchgeführt und dokumentiert sein. Die gleichen Regeln gelten für direkte API-Aufrufe, Statusaktionen, Sammeländerungen und CSV-/JSON-Importe.

Unter **Administration → Retourenregeln** lassen sich Ergebnisnotizen verlangen, der Schutz abgeschlossener Retouren einstellen und eigene Lösungen als Austausch oder Entsorgung zuordnen. Die Standardlösung „Austausch“ wird über ihre interne Kennung erkannt. Wurde sie umbenannt und dadurch als eigene Lösung geführt, kann sie ebenfalls ausdrücklich zugeordnet werden. Eine als Entsorgung markierte Lösung benötigt bei aktivierter Entsorgungsprüfung einen durchgeführten, zur ursprünglichen Seriennummer passenden Auftrag.

Bestehende abgeschlossene Vorgänge bleiben lesbar. Datenänderungen benötigen standardmäßig **Wieder öffnen**, einen offenen Zielstatus und eine Begründung. Der Verlauf hält den Grund fest. Der bisherige Statuswechsel lässt sich weiterhin kurz über die geschützte Rückgängig-Aktion zurücknehmen. Vollsicherungen und Datenbankmigrationen behalten historische Daten, ohne neue Abschlussanforderungen rückwirkend zu erzwingen.

## Namen im Verlauf

Bestehende Einträge im Retourenverlauf, Änderungsprotokoll und Entsorgungsverlauf zeigen den aktuellen Anzeigenamen des zugehörigen Kontos. Die Zuordnung erfolgt über die Konto-ID. Ist das Konto gelöscht oder nicht zuordenbar, bleibt der gespeicherte Name sichtbar. Zeitpunkte, Statusänderungen und protokollierte Vorher-/Nachher-Werte bleiben erhalten.

## Entsorgung verknüpfen

In den Retourendetails stehen verknüpfte Aufträge und deren Status; **Entsorgung erfassen** öffnet den Geräteworkflow mit passender Retoure. Standalone-Aufträge ohne Retoure bleiben möglich. Nach Dokumentation der Durchführung führt **Retourenabschluss vorbereiten** zurück zum Retourenformular und seiner Abschlussprüfung. Der Retourenstatus wird erst durch ausdrückliches Speichern geändert. Ein Geräteauftrag ändert keine Katalogprodukte.

Zu abgeschlossenen Retouren können keine neuen offenen Entsorgungsaufträge angelegt oder importiert werden. Bei nicht stornierten verknüpften Aufträgen bleibt die Gerätekennung geschützt; eine falsche Zuordnung muss vor der Änderung geprüft werden. Ohne Leserecht für Entsorgung werden keine Auftragsnummern oder Details angezeigt; die nötigen Abschlussanforderungen bleiben sichtbar.

## Sicher aktualisieren und importieren

**Aktualisieren** zeigt je geändertem Eintrag eine aufklappbare Gegenüberstellung der Felder. Bei größeren Dateien kann durch alle Änderungen geblättert werden. Leere Zellen, leere Texte und `null` lassen vorhandene Angaben und Produktbilder standardmäßig stehen. `false` und `0` bleiben echte Werte. **Leere Felder ausdrücklich übernehmen** erlaubt das Leeren optionaler Felder und das Entfernen mitgelieferter `null`-Bilder. Pflichtfelder können weiterhin nicht gelöscht werden; eine ausgelassene Spalte bleibt unverändert.

Vor dem Import werden Vorschau, Berechtigungen und Abschlussregeln erneut geprüft. Hat sich ein betroffener Eintrag seit der akzeptierten Vorschau geändert, fordert die Oberfläche eine neue Vorschau an. Änderungen am Importformular verwerfen die bisherige Bestätigung. Ein Import öffnet abgeschlossene Retouren nicht stillschweigend wieder; dafür zuerst die begründete Wiederöffnung verwenden. Vollsicherung und Bestandsdatei erfüllen unterschiedliche Zwecke: Kommentare, Anhänge, Konten und Einstellungen gehören in die Vollsicherung.

## English

Existing return activity, audit logs and disposal history display the current name of the same account, resolved by account ID. Deleted or unlinked accounts retain their recorded name. Event dates, status changes and literal before/after values remain unchanged.

Serial entry and scans check exact original and replacement serial numbers. Existing returns can be opened directly; legitimate repeat returns remain possible. **Handover** saves an open status, active assignee and next step together and rejects a stale return.

**Completion check** explains missing outcome, optional required notes, replacement serial and disposal documentation. Configure these rules and custom exchange/disposal outcomes in administration. The rules apply to forms, API, quick/bulk status actions and inventory imports. Completed historical records remain readable; ordinary edits require **Reopen** with a reason recorded in the timeline. Backups and database migrations preserve historical records.

Return details link disposal orders. A documented disposal offers **Prepare return completion**; the return closes only after an explicit save. Standalone disposal remains available. Linked device identifiers stay consistent, and new open orders cannot be attached to completed returns. Accounts without disposal read permission receive completion requirements without order identifiers.

Import previews compare changed fields for every affected record. Empty values preserve existing details and images by default; explicit clearing only affects supplied optional fields. Zero and false remain meaningful. Accepted previews are invalidated when affected records change. Reopening a completed return requires the dedicated action, not an import. Use full backups for comments, attachments, accounts and settings.
