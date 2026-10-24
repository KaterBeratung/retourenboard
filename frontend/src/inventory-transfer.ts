import {motionScrollBehavior} from './appearance.js';
import {bindImportChanges} from './import-diff.js';
import {html,t} from './i18n.js';
import {h,icon,openDialog} from './forms.js';
import {switchField} from './switches.js';
import {parseInventoryFile} from '../shared/inventory-file.js';
import {createImportSession} from '../shared/import-session.js';
import {createInputGeneration} from './input-generation.js';
import {MASTER_KINDS} from '../shared/model.js';

export function openInventoryImport(ctx:any,text:string,filename?:string){
  const file=parseInventoryFile(text);
  const canUpdate=(!file.products.length||ctx.can('productsEdit'))&&(!file.returns.length||ctx.can('returnsEdit'));
  if(!ctx.can('productsImport')||!ctx.can('returnsImport'))throw new Error(t('Für den Gesamtimport müssen Produkte und Retouren freigegeben sein.'));
  const dialog=openDialog({title:t('Bestand importieren'),subtitle:t('Produkte und Retouren gemeinsam übernehmen.'),wide:true,body:html`
    <div class="dialog-body">
      <div class="import-masterdata-plan"><strong>${h(filename||t('retourenboard-Bestandsdatei'))}</strong><p>${file.products.length} Produkte · ${file.returns.length} Retouren</p><small>JSON · Originalpreise in EUR · Zuordnung über die Artikelnummer</small></div>
      <div class="import-controls"><label class="field"><span>Vorhandene Produkte und Retouren</span><select id="inventory-duplicates"><option value="skip">Überspringen</option>${canUpdate?html('<option value="update">Aktualisieren</option>'):''}<option value="error">Als Fehler melden</option></select></label></div>
      ${switchField('',t('Fehlende Stammdaten anlegen'),ctx.can('masterdataManage'),{id:'inventory-masterdata',disabled:!ctx.can('masterdataManage')})}
      ${switchField('',t('Leere Felder ausdrücklich übernehmen'),false,{id:'inventory-clear-empty'})}<p class="muted small-text">Leere Werte behalten vorhandene Angaben und Bilder. Mit diesem Schalter werden optionale Felder geleert.</p>
      <p class="muted small-text">Beim Aktualisieren werden Produkte anhand ihrer Artikelnummer und Retouren anhand ihrer Retourennummer übernommen, einschließlich Status. Neue Produkte werden zuerst angelegt und mit ihren Retouren verknüpft.</p>
      <p class="muted small-text">JSON enthält Produktbilder. Fehlende Bildfelder lassen vorhandene Bilder unverändert. Retourenanhänge, Kommentare, Konten und Einstellungen gehören zur vollständigen Sicherung im Adminbereich.</p>
      <p id="inventory-error" class="form-error" role="alert" hidden></p><div id="inventory-preview"></div>
    </div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button id="inventory-check" class="btn secondary">${icon('search')}Vorschau prüfen</button><button id="inventory-commit" class="btn primary" disabled>${icon('upload')}Importieren</button></div>`});
  const $=(id:string)=>dialog.querySelector('#'+id) as any;
  const session=createImportSession(),generation=createInputGeneration();
  let plan:any=null;
  $('inventory-duplicates').value=canUpdate?'update':'skip';
  const checkButton=$('inventory-check'),active=()=>dialog.open&&$('inventory-check')===checkButton;
  const payload=()=>({kind:'all',text,clearEmptyFields:$('inventory-clear-empty').checked,duplicates:$('inventory-duplicates').value,createMissingMasterdata:$('inventory-masterdata').checked});
  const clear=()=>{generation.advance();session.invalidate();plan=null;$('inventory-preview').innerHTML='';$('inventory-commit').disabled=true;$('inventory-check').disabled=false;};
  const error=(value:any)=>{$('inventory-error').textContent=String(t(value instanceof Error?value.message:String(value)));$('inventory-error').hidden=false;};
  $('inventory-duplicates').onchange=clear;$('inventory-masterdata').onchange=clear;$('inventory-clear-empty').onchange=clear;
  dialog.addEventListener('close',()=>generation.advance(),{once:true});
  $('inventory-check').onclick=async()=>{
    clear();const current=generation.current,pending=session.begin(payload());$('inventory-check').disabled=true;$('inventory-error').hidden=true;
    try{
      const result=await ctx.api('/api/import/preview',{method:'POST',body:JSON.parse(pending.serialized)});
      if(!active()||current!==generation.current||!session.accept(pending,result))return;
      plan=result;
      $('inventory-preview').innerHTML=html`
        <div class="preview-summary ${plan.errors.length?'has-errors':'success'}">${icon(plan.errors.length?'info':'check')}<strong>${plan.errors.length?t`${plan.errors.length} fehlerhafte Zeile(n) – bitte vor dem Import korrigieren.`:t`${plan.total} Zeile(n) geprüft und bereit zum Import.`}</strong></div>
        <div class="inventory-import-counts">${['products','returns'].map(kind=>html`<div class="import-masterdata-plan"><strong>${kind==='products'?t('Produkte'):t('Retouren')}</strong><p>${plan[kind].created} neu · ${plan[kind].updated} aktualisieren · ${plan[kind].skipped} überspringen</p></div>`).join('')}</div>
        ${plan.errors.length?html`<ul class="import-errors">${plan.errors.slice(0,30).map(item=>html`<li>${t('Eintrag')} ${item.line}: ${h(t(item.message))}</li>`).join('')}</ul>`:''}
        ${plan.newMasterdata.length?html`<div class="import-masterdata-plan"><strong>Neue Stammdaten beim Import</strong><ul>${plan.newMasterdata.map(item=>html`<li>${t(MASTER_KINDS[item.kind]??item.kind)}: ${h(item.name)}</li>`).join('')}</ul></div>`:''}
        <div class="table-scroll preview-table"><table><thead><tr><th>Datentyp</th><th>Artikelnummer</th><th>Produkt / Seriennummer</th><th>Aktion</th></tr></thead><tbody>${plan.rows.slice(0,10).map(row=>html`<tr><td>${row.kind==='products'?t('Produkt'):t('Retoure')}</td><td>${h(row.data.sku)}</td><td>${h(row.kind==='products'?row.data.name:row.data.serialNumber||'—')}</td><td>${row.action==='skip'?t('Überspringen'):row.action==='update'?t('Aktualisieren'):t('Neu anlegen')}</td></tr>`).join('')}</tbody></table></div>
        ${plan.rows.length>10?html('<p class="muted small-text">Die Vorschau zeigt die ersten 10 gültigen Zeilen.</p>'):''}`;
      bindImportChanges($('inventory-preview'),plan.rows);
      $('inventory-commit').disabled=!!plan.errors.length||!plan.rows.length;
      $('inventory-preview').scrollIntoView({behavior:motionScrollBehavior(),block:'nearest'});
    }catch(value){if(active()&&current===generation.current)error(value);}finally{if(active()&&current===generation.current)$('inventory-check').disabled=false;}
  };
  $('inventory-commit').onclick=async()=>{
    const body=session.getCommitPayload();if(!plan||!body)return;
    const current=generation.current;$('inventory-commit').disabled=true;$('inventory-check').disabled=true;
    try{
      const result=await ctx.api('/api/import/commit',{method:'POST',body});
      if(active()&&current===generation.current){dialog.close();await ctx.reload();}
      ctx.toast(t`Import abgeschlossen: ${result.created} neu, ${result.updated} aktualisiert, ${result.skipped??0} übersprungen.`);
    }catch(value){if(active()&&current===generation.current){clear();error(value);}else ctx.toast(value instanceof Error?value.message:String(value));}
    finally{if(active()&&current===generation.current)$('inventory-check').disabled=false;}
  };
  return dialog;
}
