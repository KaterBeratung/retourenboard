import {html,t,addTranslations,apiError,setText} from './i18n.js';
import {h,icon,openDialog} from './ui.js';
import {productPicker,bindProductPicker} from './product-picker.js';
import {masterLabel,workflowStatuses} from './inventory-display.js';
import {duplicateSerials,bindFormFeedback} from './form-feedback.js';
import {captureAuthContext} from './auth-context.js';
import {markForm} from './unsaved.js';
import {workspaceCalendarDay} from './workspace-insights.js';
import {validateReturn,InputError} from '../shared/model.js';

addTranslations({
 'Scan-Erfassung':'Scan intake','Ein Produkt wählen, Geräte sammeln und gemeinsam prüfen.':'Choose a product, collect devices and review them together.',
 'Für jede ausgewählte Seriennummer wird eine eigene Retoure angelegt.':'Create one return for each selected serial number.',
 '1 · Produkt und gemeinsame Angaben':'1 · Product and shared details','Produkt und gemeinsame Angaben':'Product and shared details','Diese Angaben gelten für alle ausgewählten Geräte.':'These details apply to every selected device.',
 '2 · Seriennummern sammeln':'2 · Collect serial numbers','3 · Prüfen und anlegen':'3 · Review and create','Prüfen und anlegen':'Review and create',
 'Seriennummer hinzufügen':'Add serial number','Seriennummern hinzufügen':'Add serial numbers','Hinzufügen':'Add','Seriennummern sammeln':'Collect serial numbers','Mit Kamera, Foto oder PDF scannen':'Scan with camera, photo or PDF','Seriennummern einfügen':'Paste serial numbers',
 'Eine Seriennummer pro Zeile. Bis zu 500 Geräte pro Liste.':'One serial number per line. Up to 500 devices per list.',
 'USB-Scanner: Seriennummer eingeben und Enter drücken.':'USB scanner: enter a serial number and press Enter.',
 'Bitte zuerst ein Produkt auswählen.':'Choose a product first.','Seriennummern werden vollständig übernommen; höchstens 250 Zeichen je Gerät.':'Serial numbers are used in full; up to 250 characters per device.',
 'Hinzugefügt:':'Added:','Bereits in der Liste:':'Already in the list:','Ungültig oder länger als 250 Zeichen:':'Invalid or longer than 250 characters:',
 'Die Liste ist voll. Höchstens 500 Geräte aufnehmen.':'The list is full. Add up to 500 devices.',
 'Noch keine Seriennummern gesammelt.':'No serial numbers collected yet.','Scanne ein Gerät oder füge Seriennummern ein.':'Scan a device or paste serial numbers.',
 'Alle neuen auswählen':'Select all new devices','Auswahl aufheben':'Clear selection','Liste leeren':'Clear list','Entfernen':'Remove','Entfernen:':'Remove:',
 'Gerät auswählen:':'Select device:','Wiederholte Retoure bewusst erlauben':'Explicitly allow another return',
 'Bereits erfasst:':'Already recorded:','Prüfe den vorhandenen Vorgang. Dasselbe Gerät darf erneut zurückkommen.':'Review the existing record. The same device may return again.',
 'Bereit':'Ready','Fehlgeschlagen':'Failed','Wird angelegt …':'Creating …','Angelegt':'Created','Speicherstatus unklar':'Save status uncertain',
 'Prüfe zuerst den Retourenbestand. Eine automatische Wiederholung könnte einen doppelten Vorgang anlegen.':'Check the returns inventory first. An automatic retry could create a duplicate record.',
 'Bestand geprüft: kein neuer Vorgang vorhanden. Erneut versuchen.':'Inventory checked: no new record exists. Try again.',
 'Ausgewählt:':'Selected:','Erfolgreich:':'Succeeded:','Fehler:':'Failed:',
 'Auswahl prüfen':'Review selection','Nur fehlgeschlagene Geräte erneut prüfen':'Review failed devices only',
 'Retouren anlegen?':'Create returns?','Retouren anlegen':'Create returns','Ausgewählte Seriennummern':'Selected serial numbers',
 'Weitere Seriennummern:':'More serial numbers:','Der Produktkatalog bleibt unverändert.':'The product catalogue stays unchanged.',
 'Bitte mindestens eine Seriennummer auswählen.':'Select at least one serial number.','Bitte die vorhandenen Retouren zuerst prüfen.':'Review the existing returns first.',
 'Die Liste hat sich geändert. Bitte die Auswahl erneut prüfen.':'The list changed. Review the selection again.',
 'Der Bestand konnte nicht aktualisiert werden. Bitte erneut versuchen.':'Could not refresh the inventory. Try again.',
 'Erfassung abgeschlossen.':'Intake finished.','Einige Geräte konnten nicht angelegt werden. Die übrigen bleiben in der Liste.':'Some devices could not be created. The others remain in the list.',
 'Du hast keine Berechtigung für die Scan-Erfassung.':'You do not have permission to use scan intake.',
 'Bitte einen aktiven Lieferanten auswählen.':'Select an active supplier.','Bitte einen aktiven Retourengrund auswählen.':'Select an active return reason.',
 'Bitte einen aktiven Zustand auswählen.':'Select an active condition.','Bitte einen aktiven Status auswählen.':'Select an active status.',
 'Bitte eine aktive Lösung auswählen.':'Select an active resolution.','Bestand prüfen':'Check inventory',
 'Ungültige Retourenregel. Bitte die Servereinstellungen prüfen.':'Invalid return rule. Check the server settings.',
 '(nicht mehr verfügbar)':'(no longer available)','Bitte auswählen':'Please choose'
});
type SerialState='pending'|'failed'|'creating'|'created'|'uncertain';
type SerialRow={key:number;serialNumber:string;selected:boolean;acknowledged:boolean;duplicates:number[];state:SerialState;error:string;result?:any};
import {serialKey} from '../shared/serial-number.js';
function serial(value:any){if(typeof value!=='string')return null;const trimmed=value.trim();return trimmed&&trimmed.length<=250&&!/[\u0000-\u001f\u007f]/.test(trimmed)?trimmed:null;}
const id=(value:any)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:typeof value==='string'&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
const existingIds=(rows:any[],value:string)=>duplicateSerials(rows,value).map(row=>id(row.id)).filter(Boolean).sort((a,b)=>a-b);
export function createSerialQueue(){
 let items:SerialRow[]=[],next=0,busy=false,revision=0,epoch=0;
 const find=(key:number)=>items.find(row=>row.key===key);
 return {
  get busy(){return busy;},get revision(){return revision;},get epoch(){return epoch;},
  rows():SerialRow[]{return items.map(row=>({...row,duplicates:row.duplicates.slice()}));},
  add(values:any[],returns:any[]=[]){
   const result={added:0,duplicates:0,invalid:0,full:0};if(busy)return result;
   const seen=new Set(items.map(row=>serialKey(row.serialNumber)));
   for(const value of Array.isArray(values)?values:[]){const text=serial(value);if(!text){result.invalid++;continue;}const key=serialKey(text);if(seen.has(key)){result.duplicates++;continue;}if(items.length>=500){result.full++;continue;}
    const duplicates=existingIds(returns,text);items.push({key:++next,serialNumber:text,duplicates,acknowledged:false,selected:duplicates.length===0,state:'pending',error:''});seen.add(key);result.added++;revision++;
   }return result;
  },
  addText(value:string,returns:any[]=[]){return this.add(typeof value==='string'?value.split(/\r\n|\r|\n/).filter(value=>value.trim()):[],returns);},
  select(key:number,value:boolean){const row=find(key);if(busy||!row||['created','creating','uncertain'].includes(row.state)||value&&row.duplicates.length&&!row.acknowledged)return false;row.selected=value;revision++;return true;},
  acknowledge(key:number,value:boolean){const row=find(key);if(busy||!row||['created','creating','uncertain'].includes(row.state))return false;row.acknowledged=value;row.selected=value;revision++;return true;},
  remove(key:number){if(busy)return false;items=items.filter(row=>row.key!==key);revision++;return true;},
  reviewExisting(returns:any[]){if(busy)return;for(const row of items){if(['created','creating','uncertain'].includes(row.state))continue;const duplicates=existingIds(returns,row.serialNumber);if(JSON.stringify(duplicates)!==JSON.stringify(row.duplicates)){row.duplicates=duplicates;row.acknowledged=false;if(duplicates.length)row.selected=false;revision++;}}},
  retryUncertain(key:number){const row=find(key);if(busy||row?.state!=='uncertain')return false;row.state='failed';row.error='';row.selected=true;revision++;return true;},
  discard(){items=[];revision++;epoch++;},
  begin(){if(busy)return false;busy=true;return true;},end(){busy=false;},
  update(key:number,value:Partial<SerialRow>){const row=find(key);if(row){Object.assign(row,value);revision++;}}
 };
}
type SharedFields=Record<string,any>;
const kinds={supplier:['suppliers','supplierId','Bitte einen aktiven Lieferanten auswählen.'],reason:['reasons','reasonId','Bitte einen aktiven Retourengrund auswählen.'],condition:['conditions','conditionId','Bitte einen aktiven Zustand auswählen.'],status:['statuses','statusId','Bitte einen aktiven Status auswählen.'],resolution:['resolutions','resolutionId','Bitte eine aktive Lösung auswählen.']};
function defaultMaster(ctx:any,kind:string){const active=activeMasterChoices(ctx,kind);return active.find(row=>row.isDefault)??active[0];}
function sharedDefaults(ctx:any,productId?:number):SharedFields{
 const product=ctx.products?.find(row=>row.id===productId&&row.active),supplier=ctx.masterdata?.suppliers?.find(row=>row.id===product?.supplierId&&row.active);
 return {productId:productId??'',supplierId:supplier?.id??'',reasonId:defaultMaster(ctx,'reasons')?.id??'',conditionId:defaultMaster(ctx,'conditions')?.id??'',statusId:defaultMaster(ctx,'statuses')?.id??'',resolutionId:defaultMaster(ctx,'resolutions')?.id??'',receiptDate:workspaceCalendarDay(Date.now(),ctx.config?.rules?.timezone),orderNumber:'',customerReference:'',trackingNumber:'',notes:''};
}
type IntakePlan={revision:number;shared:SharedFields;product:any;items:{key:number;body:any}[]};
export function prepareIntakeBatch(ctx:any,queue:ReturnType<typeof createSerialQueue>,shared:SharedFields,{onlyFailed=false}:{onlyFailed?:boolean}={}):IntakePlan{
 if(!ctx.can('returnsCreate'))throw new InputError('Du hast keine Berechtigung für die Scan-Erfassung.',403);
 const product=ctx.products?.find(row=>row.id===id(shared.productId)&&row.active);if(!product)throw new InputError('Bitte ein Produkt auswählen.');
 queue.reviewExisting(ctx.returns??[]);
 const rows=queue.rows().filter(row=>row.selected&&['pending','failed'].includes(row.state)&&(!onlyFailed||row.state==='failed'));
 if(!rows.length)throw new InputError('Bitte mindestens eine Seriennummer auswählen.');
 const references:any={},referenceIds:any={},values={...sharedDefaults(ctx,product.id),...shared};
 for(const [field,[kind,key,message]]of Object.entries(kinds)){
  const selected=id(values[key]),master=(ctx.masterdata?.[kind]??[]).find(row=>row.id===selected&&row.active);
  if(!master&&(field!=='supplier'||values[key]!==''&&values[key]!=null))throw new InputError(message);
  references[field]=master?.name??'';referenceIds[key]=master?.id??null;
 }
 const choices=Object.fromEntries(['reasons','conditions','statuses','resolutions'].map(kind=>[kind,(ctx.masterdata?.[kind]??[]).filter(row=>row.active).map(row=>row.name)]));
 const items=rows.map(row=>{
  if(row.duplicates.length&&!row.acknowledged)throw new InputError('Bitte die vorhandenen Retouren zuerst prüfen.');
  const data=validateReturn({...values,...references,productId:product.id,quantity:1,serialNumber:row.serialNumber,assignedUserId:null,nextStep:''},choices);
  for(const field of ctx.config?.rules?.requiredFields??[]){const label={serialNumber:'Seriennummer',supplier:'Lieferant',orderNumber:'Bestellnummer',notes:'Notizen'}[field];if(!label)throw new InputError('Ungültige Retourenregel. Bitte die Servereinstellungen prüfen.');if(!String((field==='supplier'?references.supplier:data[field])??'').trim())throw new InputError(`${label} ist laut Retourenregeln erforderlich.`);}
  return {key:row.key,body:{...data,supplier:references.supplier,...referenceIds}};
 });
 return {revision:queue.revision,shared:{...values},product,items};
}
export function createIntakeController(ctx:any,queue:ReturnType<typeof createSerialQueue>,{onChange=()=>{},isCurrent=()=>true}:{onChange?:()=>void;isCurrent?:()=>boolean}={}){
 const authCurrent=captureAuthContext(ctx),permitted=()=>authCurrent()&&ctx.can('returnsCreate');
 return {async create(plan:IntakePlan){
  if(!permitted()||!isCurrent()||queue.busy||plan.revision!==queue.revision)return {started:false,created:0,failed:0};
  const epoch=queue.epoch;if(!queue.begin())return {started:false,created:0,failed:0};
  const result={started:true,created:0,failed:0};onChange();
  try{for(const item of plan.items){
   if(!permitted()||!isCurrent()||queue.epoch!==epoch)break;
   queue.update(item.key,{state:'creating',error:''});onChange();
   try{
    const saved=await ctx.api('/api/returns',{method:'POST',body:item.body});if(!authCurrent()||queue.epoch!==epoch)break;
    if(!id(saved?.id))throw Error('Speicherstatus unklar');
    queue.update(item.key,{state:'created',selected:false,result:saved,error:''});result.created++;
   }catch(error){
    if(!authCurrent()||queue.epoch!==epoch)break;
    const certain=Number.isFinite(error.status)&&error.status>=400&&error.status<500&&!error.stale;
    queue.update(item.key,{state:certain?'failed':'uncertain',selected:certain,error:String(error.message??'Anfrage fehlgeschlagen.')});result.failed++;
    if(!certain)break;
   }
   if(isCurrent())onChange();
  }}finally{queue.end();if(authCurrent())onChange();}
  return result;
 }};
}
const sessions=new WeakMap<object,{signature:string;queue:ReturnType<typeof createSerialQueue>;fields:SharedFields;repaint?:()=>void}>();
function sessionFor(ctx:any){
 const signature=JSON.stringify([ctx.authGeneration??0,ctx.session?.user?.id,ctx.session?.csrfToken]);let session=sessions.get(ctx);
 if(!session||session.signature!==signature){session={signature,queue:createSerialQueue(),fields:sharedDefaults(ctx)};sessions.set(ctx,session);}return session;
}
function activeMasterChoices(ctx:any,kind:string){const rows=(ctx.masterdata?.[kind]??[]).filter(row=>row.active);return kind==='statuses'?workflowStatuses(rows):rows;}
function masterField(ctx:any,kind:string,name:string,label:string,value:any,required=true){
 return html`<label class="field"><span>${t(label)}${required?html` <b>*</b>`:''}</span><select name="${name}"${required?' required':''}>${required?'':html`<option value="">Keine Zuordnung</option>`}${activeMasterChoices(ctx,kind).map(row=>html`<option value="${row.id}"${String(row.id)===String(value)?' selected':''}>${h(masterLabel(row))}</option>`).join('')}</select></label>`;
}
function textField(name:string,label:string,value:any,max=250,type='text',required=false){return html`<label class="field"><span>${t(label)}${required?html` <b>*</b>`:''}</span><input name="${name}" type="${type}" value="${h(value)}" maxlength="${max}"${required?' required':''}></label>`;}
export function renderScanIntake(ctx:any){
 if(!ctx.can('returnsCreate'))return html`<section class="panel intake-access"><h1>Scan-Erfassung</h1><p>Du hast keine Berechtigung für die Scan-Erfassung.</p><a class="btn secondary" href="#overview">Zur Übersicht</a></section>`;
 const session=sessionFor(ctx),fields=session.fields,required=ctx.config?.rules?.requiredFields??[];
 return html`<section class="scan-intake"><div class="page-heading"><div><h1>Scan-Erfassung</h1><p>Ein Produkt wählen, Geräte sammeln und gemeinsam prüfen.</p><p class="intake-description">Für jede ausgewählte Seriennummer wird eine eigene Retoure angelegt.</p></div></div><form data-intake-form data-unsaved-notice="hidden"><input type="hidden" name="intakeQueue" data-intake-queue-value value="${h(JSON.stringify(session.queue.rows()))}"><div class="intake-layout"><section class="panel intake-settings"><div class="panel-heading"><div><h2><span class="intake-step-number">1</span><span>Produkt und gemeinsame Angaben</span></h2><p>Diese Angaben gelten für alle ausgewählten Geräte.</p></div></div><fieldset class="intake-fields"><legend class="sr-only">Produkt und gemeinsame Angaben</legend><div class="form-grid">${productPicker(ctx.products.filter(row=>row.active),id(fields.productId)??undefined)}${masterField(ctx,'suppliers','supplierId','Lieferant',fields.supplierId,required.includes('supplier'))}${textField('receiptDate','Eingangsdatum (optional)',fields.receiptDate,10,'date')}${masterField(ctx,'reasons','reasonId','Retourengrund',fields.reasonId)}${masterField(ctx,'conditions','conditionId','Zustand',fields.conditionId)}${masterField(ctx,'statuses','statusId','Bearbeitungsstatus',fields.statusId)}${masterField(ctx,'resolutions','resolutionId','Lösung',fields.resolutionId)}${textField('orderNumber','Bestellnummer',fields.orderNumber,250,'text',required.includes('orderNumber'))}${textField('customerReference','Kundenreferenz (optional)',fields.customerReference)}${textField('trackingNumber','Sendungsnummer (optional)',fields.trackingNumber)}<label class="field full"><span>Notizen${required.includes('notes')?html` <b>*</b>`:''}</span><textarea name="notes" maxlength="5000" rows="3"${required.includes('notes')?' required':''}>${h(fields.notes)}</textarea></label></div></fieldset></section><section class="panel intake-collection"><div class="panel-heading"><div><h2><span class="intake-step-number">2</span><span>Seriennummern sammeln</span></h2><p>Seriennummern werden vollständig übernommen; höchstens 250 Zeichen je Gerät.</p></div></div><fieldset class="intake-fields"><legend class="sr-only">Seriennummern sammeln</legend><button type="button" class="btn secondary intake-scan" data-intake-scan>${icon('barcode')}Mit Kamera, Foto oder PDF scannen</button><label class="field"><span>Seriennummer</span><div class="intake-single-line"><input name="intakeSingle" data-intake-single maxlength="500" autocomplete="off" aria-describedby="intake-usb-help"><button type="button" class="btn secondary" data-intake-add>Hinzufügen</button></div><small id="intake-usb-help">USB-Scanner: Seriennummer eingeben und Enter drücken.</small></label><details class="intake-paste"><summary>Seriennummern einfügen</summary><label class="field"><span>Eine Seriennummer pro Zeile. Bis zu 500 Geräte pro Liste.</span><textarea name="intakePaste" data-intake-paste maxlength="130000" rows="4"></textarea></label><button type="button" class="btn secondary small" data-intake-add-paste>Seriennummern hinzufügen</button></details><p class="intake-add-status" data-intake-add-status role="status" aria-live="polite"></p></fieldset></section></div><section class="panel intake-review"><div class="panel-heading"><div><h2><span class="intake-step-number">3</span><span>Prüfen und anlegen</span></h2><p data-intake-counts role="status" aria-live="polite"></p></div><div class="intake-list-tools"><button type="button" class="text-link" data-intake-select-all>Alle neuen auswählen</button><button type="button" class="text-link" data-intake-select-none>Auswahl aufheben</button><button type="button" class="text-link" data-intake-clear>Liste leeren</button></div></div><div data-intake-rows></div><div class="intake-submit"><p class="form-error" role="alert" data-intake-error hidden></p><p role="status" aria-live="polite" data-intake-result></p><div><button type="submit" class="btn primary" data-intake-submit>${icon('check')}Auswahl prüfen</button><button type="button" class="btn secondary" data-intake-retry hidden>Nur fehlgeschlagene Geräte erneut prüfen</button></div></div></section></form></section>`;
}
type IntakeBindings={openScanner:(ctx:any,options:any)=>void;showReturn?:(row:any)=>void};
export function bindScanIntake(ctx:any,root:any,bindings:IntakeBindings){
 const form=root.querySelector('[data-intake-form]');if(!form)return;
 const session=sessionFor(ctx),queue=session.queue,authCurrent=captureAuthContext(ctx),current=()=>authCurrent()&&ctx.can('returnsCreate')&&form.isConnected!==false&&root.querySelector('[data-intake-form]')===form;
 const single=form.querySelector('[data-intake-single]'),paste=form.querySelector('[data-intake-paste]'),error=form.querySelector('[data-intake-error]'),rowsRoot=form.querySelector('[data-intake-rows]');
 const feedback=bindFormFeedback(form,{kind:'returns',products:ctx.products,returns:ctx.returns});
 const document=form.ownerDocument??globalThis.document;
 let preparing=false,confirming=false;
 function readFields(){for(const name of Object.keys(session.fields)){const field=form.querySelector(`[name=${name}]`);if(field)session.fields[name]=field.value;}return {...session.fields};}
 function validateReferenceControl(kind:string,key:string,message:string){
  const select=form.querySelector(`[name=${key}]`);if(!select)return;
  const required=key!=='supplierId'||ctx.config?.rules?.requiredFields?.includes('supplier'),available=(ctx.masterdata?.[kind]??[]).some(row=>row.active&&String(row.id)===select.value);
  const invalid=select.value?!available:Boolean(required);select.setCustomValidity?.(invalid?String(t(message)):'');
  if(invalid)select.setAttribute('aria-invalid','true');else select.removeAttribute('aria-invalid');
 }
 function bindPicker(selectedId?:number){
  return bindProductPicker(form.querySelector('[data-product-picker]'),ctx.products.filter(row=>row.active),selectedId,product=>{
   if(!current())return;session.fields.productId=product?.id??'';const supplier=ctx.masterdata?.suppliers?.find(row=>row.id===product?.supplierId&&row.active);form.querySelector('[name=supplierId]').value=String(supplier?.id??'');
   form.querySelector('[data-product-search]')?.removeAttribute('aria-invalid');validateReferenceControl(...kinds.supplier as [string,string,string]);readFields();
  });
 }
 function refreshReferences(){
  const values=readFields();
  for(const [kind,key,message]of Object.values(kinds)){
   const select=form.querySelector(`[name=${key}]`);if(!select)continue;
   const value=String(values[key]??''),active=activeMasterChoices(ctx,kind),oldLabel=Array.from(select.options??[]).find((option:any)=>option.value===value) as any;
   const option=(value:string,label:any,disabled=false)=>{const node=document.createElement('option');node.value=value;setText(node,label);node.disabled=disabled;node.selected=value===String(values[key]??'');return node;};
   const choices=[];
   if(key==='supplierId')choices.push(option('',t('Keine Zuordnung')));
   else if(!value)choices.push(option('',t('Bitte auswählen'),true));
   if(value&&!active.some(row=>String(row.id)===value)){
    const label=(ctx.masterdata?.[kind]??[]).find(row=>String(row.id)===value);
    choices.push(option(value,t`${label?masterLabel(label):oldLabel?.textContent||value} ${t('(nicht mehr verfügbar)')}`,true));
   }
   choices.push(...active.map(row=>option(String(row.id),masterLabel(row))));select.replaceChildren(...choices);select.value=value;validateReferenceControl(kind,key,message);
  }
  const oldPicker=form.querySelector('[data-product-picker]');if(!oldPicker)return;
  const product=ctx.products.find(row=>row.active&&row.id===id(values.productId)),oldLabel=oldPicker.querySelector('[data-product-search]')?.value;
  oldPicker.outerHTML=productPicker(ctx.products.filter(row=>row.active),product?.id);bindPicker(product?.id);
  if(values.productId&&!product){
   const input=form.querySelector('[data-product-search]'),select=form.querySelector('[name=productId]'),option=document.createElement('option');
   option.value=String(values.productId);option.disabled=true;option.selected=true;setText(option,t`${oldLabel||values.productId} ${t('(nicht mehr verfügbar)')}`);select.append(option);select.value=option.value;
   input.value=String(t`${oldLabel||values.productId} ${t('(nicht mehr verfügbar)')}`);input.setCustomValidity(t('Bitte ein Produkt aus der Trefferliste auswählen.'));input.setAttribute('aria-invalid','true');
  }
 }
 function showError(message:any){setText(error,apiError(message));error.hidden=false;feedback.showServerError(String(message));}
 function lock(){const locked=queue.busy||preparing||confirming;form.querySelectorAll('fieldset').forEach(field=>field.disabled=locked);form.querySelectorAll('[data-intake-select-all],[data-intake-select-none],[data-intake-clear]').forEach(button=>button.disabled=locked);form.querySelector('[data-intake-submit]').disabled=locked||!queue.rows().some(row=>row.selected&&['pending','failed'].includes(row.state));form.querySelector('[data-intake-retry]').disabled=locked;}
 function paint(){
  if(!current())return;const rows=queue.rows();form.querySelector('[data-intake-queue-value]').value=JSON.stringify(rows.filter(row=>row.state!=='created'));
  setText(form.querySelector('[data-intake-counts]'),t`${t('Ausgewählt:')} ${rows.filter(row=>row.selected&&['pending','failed','creating'].includes(row.state)).length} · ${t('Erfolgreich:')} ${rows.filter(row=>row.state==='created').length} · ${t('Fehler:')} ${rows.filter(row=>['failed','uncertain'].includes(row.state)).length}`);
  rowsRoot.innerHTML=rows.length?html`<ol class="intake-serial-list">${rows.map(row=>html`<li class="intake-serial-row" data-state="${row.state}"><div class="intake-serial-main"><label><input type="checkbox" data-intake-choice="${row.key}" aria-label="Gerät auswählen: ${h(row.serialNumber)}"${row.selected?' checked':''}${queue.busy||preparing||confirming||['created','creating','uncertain'].includes(row.state)||row.duplicates.length&&!row.acknowledged?' disabled':''}><span class="mono">${h(row.serialNumber)}</span></label><span class="intake-row-state">${t({pending:'Bereit',failed:'Fehlgeschlagen',creating:'Wird angelegt …',created:'Angelegt',uncertain:'Speicherstatus unklar'}[row.state])}${row.result?.id?html` <button type="button" class="text-link" data-intake-created="${row.key}" aria-label="Details zu ${h(row.result.returnNumber||'#'+row.result.id)}">${h(row.result.returnNumber||'#'+row.result.id)}</button>`:''}</span><button type="button" class="icon-btn" data-intake-remove="${row.key}" aria-label="Entfernen: ${h(row.serialNumber)}"${queue.busy||preparing||confirming?' disabled':''}>${icon('close')}</button></div>${row.duplicates.length&&row.state!=='created'?html`<div class="intake-duplicate"><p>Bereits erfasst: ${row.duplicates.map(id=>{const existing=ctx.returns.find(row=>row.id===id);return html`<button type="button" class="text-link" data-intake-existing="${id}">${h(existing?.returnNumber||'#'+id)}</button>`;}).join(' · ')}</p><p>Prüfe den vorhandenen Vorgang. Dasselbe Gerät darf erneut zurückkommen.</p>${row.state!=='uncertain'?html`<label><input type="checkbox" data-intake-ack="${row.key}"${row.acknowledged?' checked':''}${queue.busy||preparing||confirming?' disabled':''}><span>Wiederholte Retoure bewusst erlauben</span></label>`:''}</div>`:''}${row.state==='failed'?html`<p class="intake-row-error">${h(apiError(row.error))}</p>`:''}${row.state==='uncertain'?html`<div class="intake-uncertain"><p>Prüfe zuerst den Retourenbestand. Eine automatische Wiederholung könnte einen doppelten Vorgang anlegen.</p><button type="button" class="text-link" data-intake-check="${row.key}">Bestand prüfen</button><label><input type="checkbox" data-intake-uncertain="${row.key}"${queue.busy||preparing||confirming?' disabled':''}><span>Bestand geprüft: kein neuer Vorgang vorhanden. Erneut versuchen.</span></label></div>`:''}</li>`).join('')}</ol>`:html`<div class="intake-empty"><strong>Noch keine Seriennummern gesammelt.</strong><p>Scanne ein Gerät oder füge Seriennummern ein.</p></div>`;
  rowsRoot.querySelectorAll('[data-intake-choice]').forEach(input=>input.onchange=()=>{queue.select(Number(input.dataset.intakeChoice),input.checked);paint();});
  rowsRoot.querySelectorAll('[data-intake-ack]').forEach(input=>input.onchange=()=>{queue.acknowledge(Number(input.dataset.intakeAck),input.checked);paint();});
  rowsRoot.querySelectorAll('[data-intake-remove]').forEach(button=>button.onclick=()=>{queue.remove(Number(button.dataset.intakeRemove));paint();});
  rowsRoot.querySelectorAll('[data-intake-uncertain]').forEach(input=>input.onchange=()=>{if(input.checked){queue.retryUncertain(Number(input.dataset.intakeUncertain));paint();}});
  rowsRoot.querySelectorAll('[data-intake-created]').forEach(button=>button.onclick=()=>{const entry=queue.rows().find(row=>row.key===Number(button.dataset.intakeCreated)),row=ctx.returns.find(row=>row.id===Number(entry?.result?.id))??entry?.result;if(row&&current())bindings.showReturn?.(row);});
  rowsRoot.querySelectorAll('[data-intake-existing]').forEach(button=>button.onclick=()=>{const row=ctx.returns.find(row=>row.id===Number(button.dataset.intakeExisting));if(row&&current())bindings.showReturn?.(row);});
  rowsRoot.querySelectorAll('[data-intake-check]').forEach(button=>button.onclick=async()=>{if(!current())return;try{await ctx.ensureInventory();if(!current())return;const pending=queue.rows().find(row=>row.key===Number(button.dataset.intakeCheck)),matches=duplicateSerials(ctx.returns,pending?.serialNumber);if(matches.length)bindings.showReturn?.(matches[0]);else ctx.toast(t('Bitte die vorhandenen Retouren zuerst prüfen.'));}catch(error){if(current())ctx.toast(apiError(error.message));}});
  form.querySelector('[data-intake-retry]').hidden=!rows.some(row=>row.state==='failed'&&row.selected);lock();
  markForm(form,queue.busy||rows.some(row=>row.state!=='created')||Boolean(single.value||paste.value));
 }
 session.repaint=paint;
 const controller=createIntakeController(ctx,queue,{onChange:()=>session.repaint?.(),isCurrent:current});
 function collect(values:string[]){if(!current()||queue.busy||preparing||confirming)return;if(!id(form.querySelector('[name=productId]').value)){showError('Bitte zuerst ein Produkt auswählen.');return;}
  const result=queue.add(values,ctx.returns);setText(form.querySelector('[data-intake-add-status]'),t`${t('Hinzugefügt:')} ${result.added} · ${t('Bereits in der Liste:')} ${result.duplicates} · ${t('Ungültig oder länger als 250 Zeichen:')} ${result.invalid}${result.full?' · '+String(t('Die Liste ist voll. Höchstens 500 Geräte aufnehmen.')):''}`);if(result.added)error.hidden=true;paint();return result;
 }
 bindPicker(id(session.fields.productId)??undefined);
 for(const [kind,key,message]of Object.values(kinds))form.querySelector(`[name=${key}]`)?.addEventListener('change',()=>validateReferenceControl(kind,key,message));
 single.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const result=collect([single.value]);if(result?.added||result?.duplicates){single.value='';paint();single.focus();}}});
 form.querySelector('[data-intake-add]').onclick=()=>{const result=collect([single.value]);if(result?.added||result?.duplicates){single.value='';paint();single.focus();}};
 form.querySelector('[data-intake-add-paste]').onclick=()=>{const result=collect(paste.value.split(/\r\n|\r|\n/).filter(value=>value.trim()));if(result?.added&&!result.invalid&&!result.full){paste.value='';paint();}};
 form.querySelector('[data-intake-scan]').onclick=()=>{if(!current()||queue.busy)return;if(!id(form.querySelector('[name=productId]').value)){showError('Bitte zuerst ein Produkt auswählen.');return;}bindings.openScanner(ctx,{onScan:value=>collect([value]),onValues:values=>collect(values)});};
 form.querySelector('[data-intake-select-all]').onclick=()=>{for(const row of queue.rows())if(!row.duplicates.length||row.acknowledged)queue.select(row.key,true);paint();};
 form.querySelector('[data-intake-select-none]').onclick=()=>{for(const row of queue.rows())queue.select(row.key,false);paint();};
 form.querySelector('[data-intake-clear]').onclick=()=>{if(queue.busy)return;queue.discard();paint();};
 form.addEventListener('input',()=>{if(current())readFields();});form.addEventListener('change',()=>{if(current())readFields();});
 form.addEventListener('form-discard',()=>{if(authCurrent()){queue.discard();session.fields=sharedDefaults(ctx);}});
 async function review(onlyFailed=false){
  if(!current()||queue.busy||preparing||confirming||form.reportValidity?.()===false)return;error.hidden=true;feedback.clearErrors();preparing=true;lock();
  let plan:IntakePlan;
  try{await ctx.ensureInventory();if(!current())return;refreshReferences();queue.reviewExisting(ctx.returns);plan=prepareIntakeBatch(ctx,queue,readFields(),{onlyFailed});}
  catch(error){if(current())showError(error.message||'Der Bestand konnte nicht aktualisiert werden. Bitte erneut versuchen.');return;}
  finally{preparing=false;if(current())paint();}
  if(!plan||!current())return;confirming=true;paint();
  const dialog=openDialog({title:t('Retouren anlegen?'),subtitle:t`${plan.items.length} ${t('Retouren anlegen')} · ${plan.product.name}`,body:html`<div class="dialog-body intake-confirm"><p>Für jede ausgewählte Seriennummer wird eine eigene Retoure angelegt.</p><strong>${h(plan.product.name)} · ${h(plan.product.sku)}</strong><h3>Ausgewählte Seriennummern</h3><ul>${plan.items.slice(0,20).map(item=>html`<li class="mono">${h(item.body.serialNumber)}</li>`).join('')}</ul>${plan.items.length>20?html`<p>Weitere Seriennummern: ${plan.items.length-20}</p>`:''}<p>Der Produktkatalog bleibt unverändert.</p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="button" class="btn primary" data-intake-confirm>${plan.items.length} ${t('Retouren anlegen')}</button></div>`});
  const closed=()=>{confirming=false;dialog.removeEventListener('close',closed);if(current())paint();};dialog.addEventListener('close',closed);
  const confirm=dialog.querySelector('[data-intake-confirm]');confirm.onclick=async()=>{
   if(confirm.disabled||!current())return;confirm.disabled=true;confirming=false;dialog.close();
   const result=await controller.create(plan);if(!current())return;
   if(!result.started){showError('Die Liste hat sich geändert. Bitte die Auswahl erneut prüfen.');return;}
   setText(form.querySelector('[data-intake-result]'),t(result.failed?'Einige Geräte konnten nicht angelegt werden. Die übrigen bleiben in der Liste.':'Erfassung abgeschlossen.'));
   try{await ctx.ensureInventory();}catch{}if(current())paint();
  };
 }
 form.onsubmit=event=>{event.preventDefault();void review();};form.querySelector('[data-intake-retry]').onclick=()=>void review(true);
 // A remounted list still contains unsaved work. Establish its meaningful
 // empty baseline before restoring the outstanding rows; subsequent native
 // input/change comparisons must not accept those rows as already saved.
 form.querySelector('[data-intake-queue-value]').value='[]';markForm(form,false);
 paint();return {queue,controller};
}
