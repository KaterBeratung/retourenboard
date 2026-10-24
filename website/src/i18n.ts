import {privacyEnglish} from './privacy-copy.js';
export type Language = 'de' | 'en';

// This catalog covers the static product page, including its fictional examples.
// Real application data is never passed to this page's translator.
export const englishText: Readonly<Record<string, string>> = {
 'Geräteansicht':'Device preview',
 'Desktop':'Desktop',
 'Mobil':'Mobile',
 'Mobile Übersicht mit Beispieldaten':'Mobile overview with sample data',
 'Mobile Retourenliste mit Beispieldaten':'Mobile returns list with sample data',
 'Mobiler Teamchat mit Beispieldaten':'Mobile team chat with sample data',
 ...privacyEnglish,
 "Ein Blick ins Board.": "A look inside your workspace.",
 "Echte Ansichten aus der Anwendung. Mit Beispieldaten.": "Actual application screens. With sample data.",
 "Die Produktansichten zeigen ausschließlich Beispieldaten.": "The product screens show sample data only.",
 "Übersicht mit Beispieldaten": "Overview with sample data",
 "Retourenliste mit Beispieldaten": "Returns list with sample data",
 "Teamchat mit Beispieldaten": "Team chat with sample data",
 "Export": "Export",
 "Sicherungen": "Backups",
 "Updates": "Updates",
 "Alles am Vorgang.": "Everything with the return.",
 "Board entdecken": "Explore the board",
 "Animationen": "Animations",
 "Animationen ein- oder ausschalten": "Turn animations on or off",
 "Abschnitte": "Sections",
 "01 / Einblick": "01 / Preview",
 "02 / Workflow": "02 / Workflow",
 "03 / Funktionen": "03 / Features",
 "04 / Dein Server": "04 / Your server",
 "05 / Installation": "05 / Installation",
 "06 / Gut zu wissen": "06 / Good to know",
 "Dunkles Farbschema": "Dark color scheme",
 "Farbschema wechseln": "Switch color scheme",
 "Selbst gehostet. Gemeinsam organisiert.": "Self-hosted. Organized together.",
 "Ein Arbeitsbereich.": "One workspace.",
 "Für den ganzen Ablauf.": "For the whole workflow.",
 "Produkte": "Products",
 "Dateien": "Files",
 "Zusammenarbeit": "Collaboration",
 "Konten": "Accounts",
 "Verwaltung": "Administration",
 "Scan-Erfassung": "Scan intake",
 "Vom Scan direkt ins Board.": "From scan to workspace.",
 "Ein Produkt auswählen und Seriennummern sammeln – mit Kamera, USB-Scanner, Foto oder PDF. Erkannte Geräte prüfen und einzeln als Retoure anlegen.": "Select a product and collect serial numbers — with a camera, USB scanner, photo or PDF. Review the detected devices and create an individual return for each.",
 "Seriennummer erfasst": "Serial number captured",
 "Entsorgung": "Disposal",
 "Auch das letzte Kapitel zählt.": "The final step matters, too.",
 "Geräte zur Entsorgung erfassen, freigeben und die Durchführung dokumentieren. Eigenständig oder mit einer Retoure verknüpft – inklusive druckbarem Nachweis.": "Register devices for disposal, approve the work and document its completion. Independently or linked to a return — including a printable record.",
 "DIS-2026-000003": "DIS-2026-000003",
 "Dokumentiert. Nachvollziehbar.": "Documented. Traceable.",
 'retourenboard. – Ein Ort für alle Rückläufer': 'retourenboard. – A home for every return',
 'retourenboard bringt Retouren, Produkte und Teamarbeit an einen Ort. Auf deinem eigenen Server, mit persönlichen Konten und anpassbaren Berechtigungen.': 'retourenboard brings returns, products and teamwork together. On your own server, with personal accounts and configurable permissions.',
 'Retouren erfassen. Produkte zuordnen. Im Team den Überblick behalten. Die Retourenverwaltung zum Selbsthosten.': 'Log returns. Link products. Keep your team in the loop. Self-hosted returns management.',
 'Zum Inhalt': 'Skip to content',
 'retourenboard Startseite': 'retourenboard home',
 'Ein Ort für alle Rückläufer': 'A home for every return',
 'Menü': 'Menu',
 'Hauptnavigation': 'Main navigation',
 'Funktionen': 'Features',
 'So läuft’s': 'How it works',
 'Einblick': 'Preview',
 'Zum Projekt': 'View project',
 'Dein Rücklauf. Dein Flow.': 'Your returns. Your flow.',
 'Retouren rein.': 'Returns in.',
 'Chaos raus.': 'Chaos out.',
 'Produkte, Rückläufer und dein Team. Ein Board, das alles zusammenbringt – vom ersten Eingang bis zum letzten Haken.': 'Products, returns and your team. One board that brings it all together — from the first arrival to the final checkmark.',
 'Dein Board starten': 'Start your board',
 'Im Board umsehen': 'Explore the board',
 'Selbst gehostet': 'Self-hosted',
 'Persönliche Konten': 'Personal accounts',
 'Alles an einem Ort': 'All in one place',
 'Ein Board. Viele Möglichkeiten.': 'One board. Many possibilities.',
 'Interaktive Vorschau · Beispieldaten': 'Interactive preview · Sample data',
 'Alles direkt am Vorgang.': 'Everything with the return.',
 'Fotos · Belege · PDFs': 'Photos · Receipts · PDFs',
 '@Max, du bist dran.': '@Max, your turn.',
 'Zusammen wird’s übersichtlich.': 'Keeping it clear, together.',
 'Dein Arbeitsbereich': 'Your workspace',
 'Beispielperson Max': 'Sample user Max',
 'Beispielansichten': 'Sample views',
 'Übersicht': 'Overview',
 'Retouren': 'Returns',
 'Dein Retouren-Arbeitsplatz': 'Your returns workspace',
 'Alles im Blick': 'Everything at a glance',
 'Neue Retoure': 'New return',
 'Offene Retouren': 'Open returns',
 'Alles bereit für den nächsten Schritt': 'Ready for the next step',
 'In Prüfung': 'Under review',
 'Dein Team ist schon dran': 'Your team is on it',
 'Abgeschlossen': 'Completed',
 'Ein Haken mehr. Ein Thema weniger.': 'One more checkmark. One less task.',
 'Aktuelle Retouren': 'Recent returns',
 '3 Vorgänge': '3 returns',
 'Studio Kopfhörer': 'Studio headphones',
 'In Bearbeitung': 'In progress',
 'Office Tastatur': 'Office keyboard',
 'Eingegangen': 'Received',
 'Schreibtischlampe': 'Desk lamp',
 'Alles am Vorgang': 'Everything with the return',
 'Artikel KH-104 · EAN 4000000000016': 'Item KH-104 · EAN 4000000000016',
 'Seriennummer': 'Serial number',
 'Lieferant': 'Supplier',
 'Retourengrund': 'Return reason',
 'Ton fällt aus': 'Audio cuts out',
 'Nächster Schritt': 'Next step',
 'Gerät überprüfen': 'Inspect the device',
 'Alles dabei.': 'Everything attached.',
 'Fotos, Belege und PDFs direkt an der Retoure.': 'Photos, receipts and PDFs attached to the return.',
 'Kommentare zur Retoure': 'Return comments',
 'Gemeinsam weiter': 'Moving forward together',
 'Der Kopfhörer ist angekommen.': 'The headphones have arrived.',
 'kannst du die Prüfung übernehmen?': 'can you take care of the inspection?',
 'Ja, ich schaue ihn mir an. Die Fotos liegen schon am Vorgang.': 'Yes, I will take a look. The photos are already attached to the return.',
 'Weniger Rückfragen. Mehr Kontext.': 'Fewer questions. More context.',
 'Kommentare, Erwähnungen und Teamchat verbinden die Arbeit.': 'Comments, mentions and team chat keep everyone connected.',
 'Beispielansicht': 'Sample view',
 'Dein Team. Dein Bestand.': 'Your team. Your inventory.',
 'Interaktive Illustration mit erfundenen Daten. Die Anwendung bietet weitere Ansichten und Einstellungen.': 'Interactive illustration with fictional data. The application includes additional views and settings.',
 'Retouren & Produkte': 'Returns & products',
 'Dateien am Vorgang': 'Files with the return',
 'Vom Rücklauf zum nächsten Schritt': 'From return to next step',
 'Ein klarer Ablauf.': 'A clear process.',
 'Ein gutes Gefühl.': 'Peace of mind.',
 'Jede Retoure erzählt eine Geschichte. Dein Board hält den roten Faden – und dein Team weiß, was als Nächstes ansteht.': 'Every return has a story. Your board keeps it connected — so your team knows what comes next.',
 'Retourenablauf erkunden': 'Explore the returns workflow',
 'Rein ins Board.': 'Onto the board.',
 'Produkt auswählen. Seriennummer eintragen. Fertig.': 'Select a product. Enter the serial number. Done.',
 'Alles auf dem Schirm.': 'Keep track of it all.',
 'Prüfen, Fotos ergänzen und gemeinsam weiterarbeiten.': 'Inspect, add photos and work together.',
 'Haken dran.': 'Check it off.',
 'Lösung festhalten. Vorgang abschließen. Weiter geht’s.': 'Record the resolution. Close the return. Move on.',
 'Klicke dich durch den Beispielvorgang': 'Click through the sample return',
 'Beispieldaten': 'Sample data',
 'Seriennummer SN-DEMO-0042': 'Serial number SN-DEMO-0042',
 'Die Retoure ist angekommen.': 'The return has arrived.',
 'Produkt und Seriennummer sind erfasst. Das Team kann direkt übernehmen.': 'The product and serial number are recorded. Your team can get started.',
 'EAN zugeordnet': 'EAN linked',
 'Lieferant ausgewählt': 'Supplier selected',
 'Lena hat die Prüfung übernommen.': 'Lena is handling the inspection.',
 '„@Max, die Fotos sind dabei. Kannst du einen Blick darauf werfen?“': '“@Max, the photos are attached. Can you take a look?”',
 '▧ Fehlerbild.jpg': '▧ Issue-photo.jpg',
 '▤ Kaufbeleg.pdf': '▤ Receipt.pdf',
 'Erledigt. Und dokumentiert.': 'Done. And documented.',
 'Die Lösung ist hinterlegt. Der Verlauf bleibt für das Team nachvollziehbar.': 'The resolution is recorded. Your team can follow the history.',
 '✓ Lösung gespeichert': '✓ Resolution saved',
 '✓ Vorgang abgeschlossen': '✓ Return completed',
 'Weniger suchen. Mehr erledigen.': 'Less searching. More doing.',
 'Viel drin.': 'Everything you need.',
 'Wenig Hin und Her.': 'Less back and forth.',
 'Keine verteilten Listen und losen Belege. Das Board hält zusammen, was zusammengehört.': 'No scattered lists or loose receipts. Your board brings related information together.',
 '01 / Retouren': '01 / Returns',
 'Jeder Vorgang hat seinen Platz.': 'A place for every return.',
 'Produkte zuordnen, Seriennummer erfassen und den Status verfolgen. Gründe, Zustände und Lösungen passend zu deinem Ablauf auswählen.': 'Link products, record serial numbers and track status. Select reasons, conditions and resolutions that fit your workflow.',
 'Beispiel eines Retourenablaufs': 'Sample returns workflow',
 'Abgeschlossen ✓': 'Completed ✓',
 '02 / Produkte': '02 / Products',
 'Ein Bestand für dein Team.': 'One inventory for your team.',
 'Artikelnummer, EAN, Hersteller und Lieferant: Produktdaten einmal pflegen und bei der nächsten Retoure wieder auswählen.': 'Item number, EAN, manufacturer and supplier: maintain product details once and select them again for the next return.',
 '03 / Dateien': '03 / Files',
 'Belege direkt dabei.': 'Keep receipts close.',
 'Fotos und Dokumente am Vorgang hochladen. Bilder und PDFs direkt ansehen, ohne zwischen Ordnern zu wechseln.': 'Upload photos and documents to the return. View images and PDFs directly, without switching between folders.',
 'Kaufbeleg': 'Receipt',
 '04 / Zusammenarbeit': '04 / Collaboration',
 'Absprachen mit Kontext.': 'Conversations with context.',
 'Kommentare an Retouren, @Erwähnungen, private Nachrichten und Gruppen. So landet eine Rückfrage bei der richtigen Person.': 'Comments on returns, @mentions, private messages and groups. Get your questions to the right person.',
 'Prüfung abgeschlossen.': 'Inspection complete.',
 'du kannst übernehmen. ✓': 'you can take over. ✓',
 '05 / Konten': '05 / Accounts',
 'Jede Person mit eigenem Zugang.': 'A personal account for everyone.',
 'Persönliche Konten, anpassbare Berechtigungen und Zwei-Faktor-Anmeldung. Dein Admin verwaltet die Zugänge und ausgewählte Aufgaben.': 'Personal accounts, configurable permissions and two-factor authentication. Your admin manages access and delegated tasks.',
 'Mitarbeiter': 'Staff member',
 '2FA und individuelle Berechtigungen': '2FA and individual permissions',
 '06 / Verwaltung': '06 / Administration',
 'Auch hinter den Kulissen aufgeräumt.': 'Organized behind the scenes, too.',
 'Stammdaten, CSV-Import und Export, Sicherungen und Servereinstellungen. Die Werkzeuge für den laufenden Betrieb sind dabei.': 'Master data, CSV import and export, backups and server settings. The tools for everyday operation are included.',
 'CSV-Import': 'CSV import',
 '⌑ Sicherungen': '⌑ Backups',
 'Selbst hosten. Selbst entscheiden.': 'Self-hosted. Your choice.',
 'Dein Server.': 'Your server.',
 'Dein Spielraum.': 'Your freedom.',
 'Dein Board': 'Your board',
 'retourenboard läuft auf deiner eigenen Infrastruktur. Du entscheidest, wer Zugang bekommt und wie dein Team arbeitet.': 'retourenboard runs on your own infrastructure. You decide who gets access and how your team works.',
 'Im Browser arbeiten – auf Desktop, Tablet und Smartphone': 'Work in your browser — on desktop, tablet and phone',
 'Debian oder Ubuntu mit systemd, auch im LXC': 'Debian or Ubuntu with systemd, including LXC',
 'Container-IP im Netzwerk oder Domain mit HTTPS und Reverse Proxy': 'Container IP on your network, or a domain with HTTPS and a reverse proxy',
 'Dauerhafte Datenbank, Dateianhänge und Sicherungen': 'Persistent database, file attachments and backups',
 'Technische Details im Projekt': 'Technical details in the project',
 'Bereit für deinen ersten Rückläufer?': 'Ready for your first return?',
 'Von der Idee': 'From idea',
 'zum eigenen Board.': 'to your own board.',
 'Das kleine Installationsskript lädt automatisch die neueste GitHub-Version. Du startest mit deinem ersten Administratorkonto.': 'The small installer automatically downloads the latest GitHub release. Get started with your first administrator account.',
 'Paket herunterladen': 'Download the package',
 'Installer herunterladen': 'Download installer',
 'TAR-Archiv herunterladen': 'Download TAR archive',
 'Immer die neueste veröffentlichte GitHub-Version.': 'Always the latest published GitHub release.',
 'Neueste Version wird ermittelt …': 'Looking up the latest release …',
 'Download wird gestartet.': 'Starting download.',
 'Die Release-Seite wird geöffnet. Dort kannst du das Paket herunterladen.': 'Opening the release page. You can download the package there.',
 'Den kleinen Installer aus den GitHub-Releases als': 'Copy the small installer from GitHub Releases as',
 'auf deinen Server kopieren.': 'to your server.',
 'Releases öffnen': 'View releases',
 'Erst testen, dann installieren': 'Try it, then install',
 'Mit einer temporären Datenbank ausprobieren oder direkt auf Debian / Ubuntu installieren.': 'Try it with a temporary database or install directly on Debian / Ubuntu.',
 'Im Browser loslegen': 'Get started in your browser',
 'Die vom Installer angezeigte Container-IP öffnen, dein Administratorkonto anlegen und das Team einrichten.': 'Open the container IP shown by the installer, create your administrator account and set up your team.',
 'Dein Linux-Terminal': 'Your Linux terminal',
 'Installationsart': 'Installation mode',
 'Ausprobieren': 'Try it out',
 'Installieren': 'Install',
 'Ohne root und ohne Dienst. Der Test nutzt eine eigene temporäre Datenbank.': 'No root access or service needed. The trial uses its own temporary database.',
 'Für Debian / Ubuntu mit systemd. Als root kann sudo entfallen. Eine vorhandene Installation wird aktualisiert.': 'For Debian / Ubuntu with systemd. Omit sudo when running as root. An existing installation will be updated.',
 'Befehl kopieren': 'Copy command',
 'Befehl kopiert.': 'Command copied.',
 'Bitte den Befehl oben markieren und kopieren.': 'Please select and copy the command above.',
 'Standardmäßig über die Container-IP erreichbar.': 'Accessible via the container IP by default.',
 'begrenzt den Zugriff auf localhost.': 'limits access to localhost.',
 'Noch etwas offen?': 'Any questions?',
 'Gut zu wissen.': 'Good to know.',
 'Ist das eine Cloud-Anwendung?': 'Is this a cloud application?',
 'retourenboard wird auf deinem eigenen Server betrieben. Du richtest den Zugang für dein Team ein und kümmerst dich um den Betrieb. Diese Produktseite ist unabhängig von deiner Installation.': 'retourenboard runs on your own server. You set up access for your team and manage the deployment. This product page is separate from your installation.',
 'Wer kann meine Daten sehen?': 'Who can see my data?',
 'Bestandsdaten und Dateianhänge sind in der Anwendung nur nach Anmeldung verfügbar. Der erste Account wird Administrator; weitere Konten legt ein Admin an. Berechtigungen lassen sich je Konto anpassen.': 'Inventory data and attachments are only available after signing in. The first account becomes an administrator; an admin creates further accounts. Permissions can be configured per account.',
 'Kann ich bestehende Daten übernehmen?': 'Can I import existing data?',
 'Ja, über den CSV-Import. Vorlagen und Importprofile helfen bei der Zuordnung deiner Spalten. Produkte und Retouren lassen sich auch als CSV exportieren.': 'Yes, through CSV import. Templates and import profiles help map your columns. You can also export products and returns as CSV.',
 'Kann ich das Board zuerst ausprobieren?': 'Can I try the board first?',
 'Der Installer bietet': 'The installer offers',
 'für einen temporären Testbetrieb. Dabei werden keine vorhandenen Konten oder Daten verwendet. Mit Strg+C endet der Test und die Testdaten werden entfernt.': 'for a temporary trial. Existing accounts and data are not used. Press Ctrl+C to end the trial and remove its test data.',
 'Wie funktionieren Updates?': 'How do updates work?',
 'Der Installer kann eine bestehende Installation aktualisieren. Auf unterstützten Linuxinstallationen gibt es außerdem einen Versionscheck und einen Updater im Adminbereich. Updates werden bewusst gestartet; Daten und Anhänge bleiben erhalten. Details stehen in der Projektdokumentation.': 'The installer can update an existing installation. Supported Linux deployments also include a version check and updater in the admin area. You start updates when you choose; data and attachments are preserved. See the project documentation for details.',
 'Mehr Überblick.': 'More clarity.',
 'Weniger Hin und Her.': 'Less back and forth.',
 'Projekt entdecken': 'Explore the project',
 'Für die Arbeit nach dem Rücklauf.': 'For the work after the return.',
 'Dokumentation': 'Documentation',
 'Auf Ko-fi unterstützen': 'Support on Ko-fi',
 'Auf Ko-fi unterstützen (öffnet in neuem Tab)': 'Support on Ko-fi (opens in a new tab)',
 'Docker Compose mit PostgreSQL 18': 'Docker Compose with PostgreSQL 18',
 'PostgreSQL lokal oder extern, Dateianhänge und Sicherungen': 'Local or external PostgreSQL, attachments and backups',
 'Mit einem isolierten PostgreSQL-Testserver ausprobieren oder PostgreSQL direkt auf Debian / Ubuntu einrichten.': 'Try an isolated PostgreSQL test server or set up PostgreSQL directly on Debian / Ubuntu.',
 'Ohne root und ohne Dienst. Ein isolierter PostgreSQL-Testserver wird benötigt.': 'No root access or service needed. An isolated PostgreSQL test server is required.',
 'Docker für amd64 und arm64': 'Docker for amd64 and arm64',
};

export function translateText(value: string, language: Language): string {
 if (language === 'de') return value;
 const original = value.trim();
 if (!Object.hasOwn(englishText, original)) return value;
 const translated = englishText[original];
 const start = value.indexOf(original);
 return value.slice(0, start) + translated + value.slice(start + original.length);
}

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>;
const storageKey = 'retourenboard.website.language';
export function createLanguageController(page: Document, storage: () => LanguageStorage | undefined) {
 let language: Language = 'de';
 try { if (storage()?.getItem(storageKey) === 'en') language = 'en'; } catch { /* Private browsing can block storage. */ }
 const texts: {node: Node; original: string}[] = [];
 const walker = page.createTreeWalker(page, 4); // NodeFilter.SHOW_TEXT
 for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  if (node.parentElement?.closest('script,style,[data-i18n-dynamic]')) continue;
  const original = node.textContent ?? '';
  if (Object.hasOwn(englishText, original.trim())) texts.push({node, original});
 }
 const attributes: {element: Element; name: string; original: string}[] = [];
 for (const element of page.querySelectorAll('[aria-label],[title],meta[content],[alt]')) {
  for (const name of ['aria-label', 'title', 'content','alt']) {
   const original = element.getAttribute(name);
   if (original !== null && Object.hasOwn(englishText, original.trim())) attributes.push({element, name, original});
  }
 }
 const button = page.querySelector<HTMLButtonElement>('#language-toggle');
 const listeners = new Set<() => void>();
 function apply(next: Language) {
  language = next; page.documentElement.lang = next;
  for (const {node, original} of texts) node.textContent = translateText(original, next);
  for (const {element, name, original} of attributes) element.setAttribute(name, translateText(original, next));
  if (button) {
   const label = button.querySelector<HTMLElement>('[data-language-label]');
   if (label) { label.textContent = next === 'de' ? 'EN' : 'DE'; label.lang = next === 'de' ? 'en' : 'de'; }
   button.lang = next;
   button.setAttribute('aria-label', next === 'de' ? 'Auf Englisch umschalten' : 'Switch to German');
   button.title = next === 'de' ? 'English' : 'Deutsch';
   button.hidden = false;
  }
  for (const listener of listeners) listener();
 }
 function setLanguage(next: Language) {
  apply(next);
  try { storage()?.setItem(storageKey, next); } catch { /* Switching still works for this visit. */ }
 }
 button?.addEventListener('click', () => setLanguage(language === 'de' ? 'en' : 'de'));
 apply(language);
 return {text: (value: string) => translateText(value, language), setLanguage, onChange: (listener: () => void) => listeners.add(listener)};
}
