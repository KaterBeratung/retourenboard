import {html,locale,setText,t} from './i18n.js';
import {switchField} from './switches.js';
import { h, icon, openDialog } from './forms.js';
import { PRODUCT_COLUMNS, RETURN_IMPORT_COLUMNS as RETURN_COLUMNS, MASTER_KINDS } from '../shared/model.js';
import { parseCsv,guessCsvMapping,inferCsvKind } from '../shared/csv.js';
import { createImportSession } from '../shared/import-session.js';
import {createInputGeneration} from './input-generation.js';
import {isInventoryText,parseInventoryFile} from '../shared/inventory-file.js';
import {openInventoryImport} from './inventory-transfer.js';
import {masterValue} from './inventory-display.js';
export function openExport(ctx,kind = 'products') {
    const allowed=['products','returns'].filter(type=>ctx.can(type+'Export'));
    if(!allowed.length){ctx.toast(t('Für dieses Konto ist kein CSV-Export freigegeben.'));return;}
    openDialog({title:t('Daten exportieren'),subtitle:t('Produkte und Retouren einzeln oder gemeinsam herunterladen.'),body:html`
      <div class="dialog-body">
        ${allowed.length===2?html`<a class="export-option" href="/api/export/all">${icon('file')}<div><strong>Alles exportieren</strong><small>Produkte, Retouren und Produktbilder · JSON · Wieder importierbar</small></div>${icon('download')}</a>`:''}
        ${allowed.map(type=>html`<a class="export-option" href="/api/export/${type}">${icon(type==='products'?'box':'return')}<div><strong>${type==='products'?t('Produkte'):t('Retouren')} exportieren</strong><small>${type==='products'?t('Mit EAN, Lieferant und Verkaufspreis'):t('Mit Lieferant, Seriennummer, Status und Prüfergebnis')} · CSV</small></div>${icon('download')}</a>`).join('')}
        <p class="muted small-text">UTF-8 · CSV mit Semikolon als Trennzeichen · Originalpreise in EUR</p>
        <p class="muted small-text">JSON enthält Produktbilder; CSV enthält keine Bilder. Retourenanhänge, Kommentare, Konten und Einstellungen gehören zur vollständigen Sicherung im Adminbereich.</p>
      </div><div class="dialog-footer"><button class="btn secondary" data-close>Schließen</button></div>`});
}
export function openImport(ctx, initialKind = 'products') {
    const allowed=['products','returns'].filter(type=>ctx.can(type+'Import'));
    if(!allowed.length){ctx.toast(t('Für dieses Konto ist kein CSV-Import freigegeben.'));return;}
    let kind = allowed.includes(initialKind)?initialKind:allowed[0], text = '', parsed = null, preview = null;
    const importSession = createImportSession();
    const dialog = openDialog({ title: t('Datei importieren'), subtitle: t('Datei auswählen, Vorschau prüfen und importieren.'), wide: true, body: html`<div class="import-steps"><span class="active">01 <b>Datei & Spalten</b></span><span id="step-preview">02 <b>Vorschau & Import</b></span></div><div class="dialog-body"><div class="import-controls"><label class="field"><span>Was möchtest du importieren?</span><select id="import-kind"><option value="auto" selected>Automatisch erkennen</option>${allowed.map(type=>html`<option value="${type}">${type==='products'?t('Produkte'):t('Retouren')}</option>`).join('')}</select></label><a id="template-link" class="text-link" href="/api/template/${kind}">${icon('download')}CSV-Vorlage herunterladen</a></div><p id="import-kind-hint" class="muted small-text" role="status">Der Dateityp wird nach dem Einlesen automatisch erkannt.</p><label class="drop-zone" id="drop-zone">${icon('upload')}<strong>Importdatei auswählen</strong><span>CSV bis 2 MB · JSON bis 32 MB · UTF-8</span><input id="csv-file" type="file" accept=".csv,.json,text/csv,application/json" aria-label="Importdatei auswählen"></label><details class="paste-csv"><summary>CSV-Text direkt einfügen</summary><textarea id="csv-text" rows="4" placeholder="Artikelnummer;Produktname;Lieferant&#10;ART-001;Mein Produkt;Mein Lieferant" aria-label="CSV-Text"></textarea><button id="use-text" class="btn secondary small">Text übernehmen</button></details><p class="muted small-text">${ctx.can('masterdataManage')?t('Fehlende Stammdaten werden beim bestätigten Import automatisch angelegt.'):t('Fehlende Stammdaten benötigen das Recht zur Stammdatenverwaltung.')} ${ctx.can('productsCreate')?t('Fehlende Produkte können direkt mit den Retouren angelegt werden.'):t('Produkte müssen bereits vorhanden sein; zum Anlegen fehlt die Berechtigung.')} ${t('Vorhandene Einträge lassen sich bei passender Berechtigung aktualisieren oder überspringen.')}</p><p class="muted small-text">CSV-Preise werden in EUR importiert. Ohne Produktnamen wird die Artikelnummer verwendet; ohne Preis wird 0 EUR gespeichert. Bestehende Produkte bleiben beim Retourenimport unverändert.</p><details id="import-options" class="import-options"><summary>Zuordnung & Importoptionen</summary><div id="mapping"></div></details>${switchField("",t("Vorhandene Produkte anhand der Artikelnummer aktualisieren"),false,{id:"update-existing",fieldId:"update-option",hidden:true})}<p class="form-error" id="import-error" role="alert" hidden></p><div id="preview"></div></div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button id="preview-button" class="btn secondary" disabled>${icon('search')}Vorschau prüfen</button><button id="commit-button" class="btn primary" disabled>${icon('upload')}Importieren</button></div>` });
    const $ = (id) => dialog.querySelector('#' + id), columns = () => kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS;
    let profiles=[],textDirty=false;const inputGeneration=createInputGeneration(),fileInput=$('csv-file'),active=()=>dialog.open&&$('csv-file')===fileInput;dialog.addEventListener('close',()=>inputGeneration.advance(),{once:true});
    $('mapping').insertAdjacentHTML('beforebegin',html('<div class="import-controls"><label class="field"><span>Gespeichertes Profil</span><select id="csv-profile"><option value="">Ohne Profil</option></select></label><label class="field"><span>Trennzeichen</span><select id="csv-delimiter"><option value="auto">Automatisch</option><option value=";">Semikolon</option><option value=",">Komma</option><option value="&#9;">Tabulator</option></select></label><label class="field"><span>Dubletten</span><select id="csv-duplicates"><option value="error">Als Fehler melden</option><option value="skip">Überspringen</option><option value="update">Aktualisieren</option></select></label></div>'));
    $('mapping').insertAdjacentHTML('beforebegin',html`<div class="import-dependencies">${switchField('',t('Fehlende Stammdaten anlegen'),ctx.can('masterdataManage'),{id:'csv-create-masterdata',disabled:!ctx.can('masterdataManage')})}${switchField('',t('Fehlende Produkte anlegen'),ctx.can('productsCreate'),{id:'csv-create-products',hidden:kind!=='returns',disabled:!ctx.can('productsCreate')})}</div>`);
    $('csv-duplicates').value=kind==='returns'||!ctx.can('productsEdit')?'skip':'update';
    const selectedProfile=()=>profiles.find(p=>p.id===Number($('csv-profile').value));
    function profileOptions(){const selected=$('csv-profile').value;$('csv-profile').innerHTML=html('<option value="">Ohne Profil</option>')+profiles.filter(p=>p.kind===kind).map(p=>html`<option value="${p.id}">${h(p.name)}</option>`).join('');$('csv-profile').value=selected;for(const id of ['csv-delimiter','csv-duplicates'])$(id).disabled=!!selectedProfile();$('csv-duplicates').querySelector('[value=update]').disabled=!ctx.can(kind+'Edit');if($('csv-duplicates').querySelector('[value=update]').disabled&&$('csv-duplicates').value==='update')$('csv-duplicates').value='error';}
    ctx.api('/api/import/profiles').then(result=>{profiles=result;if(active())profileOptions();}).catch(error=>{if(active())showError(error);});
    function clearPreview() { inputGeneration.advance();importSession.invalidate(); preview = null; $('preview').innerHTML = ''; $('commit-button').disabled = true; $('step-preview').classList.remove('active'); }
    function showError(error) { setText($('import-error'),t(error instanceof Error ? error.message : String(error))); $('import-error').hidden = false; }
    function useText(source, filename) {
        text=source;
        textDirty=false;
        clearPreview();
        $('import-error').hidden = true;
        $('preview-button').disabled = true;
        parsed = null;
        $('mapping').innerHTML = '';
        $('update-option').hidden = true;
        try {
            if(isInventoryText(source)){
                parseInventoryFile(source);
                if(!ctx.can('productsImport')||!ctx.can('returnsImport'))throw new Error(t('Für den Gesamtimport müssen Produkte und Retouren freigegeben sein.'));
                dialog.close();openInventoryImport(ctx,source,filename);return;
            }
            const profile=selectedProfile();
            parsed = parseCsv(source,{delimiter:profile?.delimiter??$('csv-delimiter').value});
            if($('import-kind').value==='auto'&&!profile){
                const detected=inferCsvKind(parsed.headers,null);
                if(!detected)throw new Error(t('Der Importtyp konnte nicht automatisch erkannt werden. Bitte Produkte oder Retouren auswählen.'));
                if(!allowed.includes(detected))throw new Error(t('Für diesen Dateityp ist kein CSV-Import freigegeben.'));
                if(detected!==kind){kind=detected;profileOptions();$('csv-duplicates').value=kind==='returns'||!ctx.can('productsEdit')?'skip':'update';}
            }
            $('template-link').href='/api/template/'+kind;
            $('csv-create-products').closest('.switch-field').hidden=kind!=='returns';
            setText($('import-kind-hint'),profile?t('Importtyp aus dem Profil übernommen.'):$('import-kind').value==='auto'?(kind==='returns'?t('Erkannt: Retouren'):t('Erkannt: Produkte')):t('Importtyp manuell gewählt.'));
            const suggested=guessCsvMapping(kind,parsed.headers);
            setText($('drop-zone').querySelector('strong'),filename || t`${parsed.rows.length} Datenzeilen erkannt`);
            const required = kind === 'products' ? ['sku', 'name'] : ['sku', 'serialNumber'];
            $('mapping').innerHTML = html`<h3 class="mapping-title">Spalten zuordnen <span>${parsed.rows.length} Zeilen gefunden</span></h3><div class="mapping-grid">${Object.entries(columns()).map(([key, label]) => {
                const index = suggested[key];
                return html`<label class="field"><span>${t(label)}${required.includes(key) ? html(' <b>*</b>') : ''}</span><select data-column="${key}"><option value="-1">Nicht importieren</option>${parsed.headers.map((header, i) => html`<option value="${i}"${i === index ? ' selected' : ''}>${h(header)}</option>`).join('')}</select></label>`;
            }).join('')}</div>`;
            $('import-options').open=required.some(key=>suggested[key]<0)||Boolean(profile);
            $('mapping').querySelectorAll('select').forEach(el => el.onchange = clearPreview);
            if(profile)for(const el of $('mapping').querySelectorAll('[data-column]')){el.value=String(profile.mapping[el.dataset.column]?parsed.headers.indexOf(profile.mapping[el.dataset.column]):-1);el.disabled=true;}
            $('preview-button').disabled = false;
            $('update-option').hidden = true;
        }
        catch (error) {
            showError(error);
        }
    }
    async function loadFile(file) {
        if (!file)
            return;
        clearPreview();parsed=null;$('preview-button').disabled=true;
        await inputGeneration.read(async()=>{
            if (file.size > 32*1024*1024)
                throw new Error(t('Bitte eine JSON-Datei mit maximal 32 MB oder eine CSV-Datei mit maximal 2 MB auswählen.'));
            const source=new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
            if(!isInventoryText(source)&&file.size>2_000_000)throw new Error(t('CSV darf maximal 2 MB Text enthalten.'));
            return source;
        },source=>{if(active())useText(source,file.name);},error=>{
            if(!active())return;
            clearPreview();
            $('preview-button').disabled = true;
            showError(error instanceof TypeError ? t('Die Datei muss als UTF-8 gespeichert sein.') : error);
        });
    }
    $('csv-file').onchange = event => loadFile(event.target.files?.[0]);
    $('drop-zone').ondragover = event => { event.preventDefault(); $('drop-zone').classList.add('dragging'); };
    $('drop-zone').ondragleave = () => $('drop-zone').classList.remove('dragging');
    $('drop-zone').ondrop = event => { event.preventDefault(); $('drop-zone').classList.remove('dragging'); loadFile(event.dataTransfer?.files[0]); };
    $('use-text').onclick = () => useText($('csv-text').value);
    $('csv-text').oninput=()=>{textDirty=true;parsed=null;clearPreview();$('preview-button').disabled=true;};
    $('csv-profile').onchange=()=>{clearPreview();const profile=selectedProfile();for(const id of ['csv-delimiter','csv-duplicates'])$(id).disabled=!!profile;if(profile){$('csv-delimiter').value=profile.delimiter;$('csv-duplicates').value=profile.duplicates;}if(text&&!textDirty)useText(text);};
    $('csv-delimiter').onchange=()=>{clearPreview();if(text&&!textDirty)useText(text);};
    $('csv-duplicates').onchange=clearPreview;
    for(const id of ['csv-create-masterdata','csv-create-products'])$(id).onchange=clearPreview;
    $('import-kind').onchange = event => { if(event.target.value!=='auto')kind=event.target.value;profileOptions();if(!selectedProfile())$('csv-duplicates').value=kind==='returns'||!ctx.can('productsEdit')?'skip':'update';clearPreview();$('template-link').href = `/api/template/${kind}`; if (text&&!textDirty)
        useText(text); };
    $('update-existing').onchange = clearPreview;
    const payload = () => {const profile=selectedProfile();return {kind,text,createMissingMasterdata:$('csv-create-masterdata').checked,createMissingProducts:kind==='returns'&&$('csv-create-products').checked,mapping:Object.fromEntries([...$('mapping').querySelectorAll('[data-column]')].map(el=>[el.dataset.column,Number(el.value)])),duplicates:$('csv-duplicates').value,delimiter:$('csv-delimiter').value,...(profile?{profileId:profile.id,profileRevision:profile.revision}:{})};};
    $('preview-button').onclick = async () => {
        $('preview-button').disabled = true;
        clearPreview();
        $('import-error').hidden = true;
        const pending = importSession.begin(payload());
        const generation=inputGeneration.current;
        try {
            const result = await ctx.api('/api/import/preview', { method: 'POST', body: JSON.parse(pending.serialized) });
            if (!active() || generation!==inputGeneration.current || !importSession.accept(pending, result))
                return;
            preview = result;
            preview.summary=t`${preview.created} neu · ${preview.updated} aktualisieren · ${preview.skipped} überspringen`;
            $('step-preview').classList.add('active');
            $('preview').innerHTML = html`<div class="preview-summary ${preview.errors.length ? 'has-errors' : 'success'}">${icon(preview.errors.length ? 'info' : 'check')}<strong>${preview.errors.length ? t`${preview.errors.length} fehlerhafte Zeile(n) – bitte vor dem Import korrigieren.` : t`${preview.total} Zeile(n) geprüft und bereit zum Import.`}</strong></div>${preview.errors.length ? html`<ul class="import-errors">${preview.errors.slice(0, 30).map(e => html`<li><strong>Zeile ${e.line}:</strong> ${h(e.message)}</li>`).join('')}</ul>` : ''}<div class="table-scroll preview-table"><table><thead><tr><th>Zeile</th><th>Artikelnummer</th>${kind === 'returns' ? html('<th>Retourennummer</th>') : ''}<th>${kind === 'products' ? t('Produktname') : t('Seriennummer')}</th><th>Lieferant</th>${kind === 'returns' ? html('<th>Kundenreferenz</th><th>Sendungsnummer</th><th>Eingangsdatum</th><th>Status</th>') : ''}<th>Aktion</th></tr></thead><tbody>${preview.rows.slice(0, 10).map(row => html`<tr><td>${row.line}</td><td>${h(('sku' in row.data ? row.data.sku : ''))}</td>${kind === 'returns' ? html`<td>${h(row.data.returnNumber || '—')}</td>` : ''}<td>${h(kind === 'products' ? row.data.name : row.data.serialNumber || '—')}</td><td>${h(row.data.supplier || '—')}</td>${kind === 'returns' ? html`<td>${h(row.data.customerReference||'—')}</td><td>${h(row.data.trackingNumber||'—')}</td><td>${h(row.data.receiptDate||'—')}</td><td>${h(masterValue(ctx.masterdata,row.data,'status'))}</td>` : ''}<td>${row.action === 'update' ? t('Aktualisieren') : t('Neu anlegen')}</td></tr>`).join('')}</tbody></table></div>${preview.rows.length > 10 ? html('<p class="muted small-text">Die Vorschau zeigt die ersten 10 gültigen Zeilen.</p>') : ''}`;
            $('commit-button').disabled = preview.errors.length > 0 || preview.rows.length === 0;
            $('preview').insertAdjacentHTML('afterbegin',html`<p class="muted">${h(preview.summary)}</p>${preview.newProducts?.length?html`<div class="import-masterdata-plan"><strong>Neue Produkte beim Import</strong><ul>${preview.newProducts.map(item=>html`<li>${h(item.name)} <span class="muted">· ${h(item.sku)}</span></li>`).join('')}</ul><small>Produktdaten lassen sich nach dem Import ergänzen.</small></div>`:''}${preview.newMasterdata?.length?html`<div class="import-masterdata-plan"><strong>Neue Stammdaten beim Import</strong><ul>${preview.newMasterdata.map(item=>html`<li>${t(MASTER_KINDS[item.kind]??item.kind)}: ${h(item.name)}</li>`).join('')}</ul></div>`:''}`);
            $('preview').querySelectorAll('tbody tr').forEach((row,i)=>{if(preview.rows[i]?.action==='skip')setText(row.lastElementChild,t('Überspringen'));});
            $('preview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        catch (error) {
            inputGeneration.withCurrent(generation,()=>showError(error));
        }
        finally {
            inputGeneration.withCurrent(generation,()=>{$('preview-button').disabled = !parsed;});
        }
    };
    $('commit-button').onclick = async () => {
        const commitPayload = importSession.getCommitPayload();
        if (!preview || !commitPayload)
            return;
        const generation = inputGeneration.current;
        const current = () => active() && generation === inputGeneration.current;
        $('commit-button').disabled = true;
        $('preview-button').disabled = true;
        try {
            const result = await ctx.api('/api/import/commit', { method: 'POST', body: commitPayload });
            if (current()) {
                dialog.close();
                await ctx.reload();
            }
            const summary=t`Import abgeschlossen: ${result.created} neu, ${result.updated} aktualisiert, ${result.skipped??0} übersprungen.`;
            const dependencies=result.productsCreated||result.masterdataCreated?t`Zusätzlich angelegt: ${result.productsCreated??0} Produkte und ${result.masterdataCreated??0} Stammdateneinträge.`:'';
            ctx.toast(summary+(dependencies?' '+dependencies:''));
        }
        catch (error) {
            if (current()) {
                clearPreview();
                showError(error);
                $('preview-button').disabled = !parsed;
            } else {
                ctx.toast(error instanceof Error ? error.message : String(error));
            }
        }
        finally {
            if (current()) $('preview-button').disabled = !parsed;
        }
    };
}
