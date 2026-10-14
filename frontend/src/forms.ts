import {html,locale,formatDate,setText,t,apiError,addTranslations} from './i18n.js';
import {masterLabel,masterValue,money,usesDollar,returnTimestamp,workflowStatuses,returnDetailContent} from './inventory-display.js';
import {offerStatusUndo} from './workflow-actions.js';
import {printReturnLabel,openScanner} from './scan-labels.js';
import {bindQuickActions} from './quick-actions.js';
import { renderAttachments } from './attachments.js';
import {canLeaveForms} from './unsaved.js';
import {auditLink} from './return-status.js';
import {renderComments} from './comments.js';
import {h,icon,openDialog,trackFormSave} from './ui.js';
import {productPicker,bindProductPicker,rememberProduct,recentProduct} from './product-picker.js';
import {productAvatar,productImageEditor,bindProductImageEditor} from './product-images.js';
import {bindFormFeedback,bindReturnAssignees} from './form-feedback.js';
import {bindReturnTimeline} from './return-timeline.js';
import {bindReturnDraft,bindReplacementSerial,type ReturnDraft} from './return-drafts.js';
import {captureAuthContext} from './auth-context.js';
export {h,icon,openDialog,trackFormSave} from './ui.js';
addTranslations({'Scannen':'Scan','EAN scannen':'Scan EAN','Seriennummer scannen':'Scan serial number','Der gescannte Code ist zu lang (maximal':'The scanned code is too long (maximum','Zeichen). Der bisherige Wert bleibt erhalten.':'characters). The existing value is unchanged.'});
const input = (key, label, value: any = '', opts: any = {}) => html`<label class="field ${opts.full ? 'full' : ''}"><span>${h(label)}${opts.required ? html(' <b>*</b>') : ''}</span><input name="${key}" value="${h(value)}" type="${opts.type ?? 'text'}" ${opts.required ? 'required' : ''} ${opts.type === 'number' ? 'min="1" max="10000" step="1"' : ''} maxlength="${opts.max ?? 250}"${opts.help?html` aria-describedby="form-help-${key}"`:''} placeholder="${h(opts.placeholder ?? '')}">${opts.help ? html`<small class="field-help" id="form-help-${key}">${h(opts.help)}</small>` : ''}</label>`;
export function bindDeviceScan(ctx:any,dialog:any,name:string,scan=openScanner){
    const input=dialog.querySelector(`[name=${name}]`);if(!input)return;
    const group=document.createElement('div');group.className='field-scan-line';input.before(group);group.append(input);
    const button=document.createElement('button');button.type='button';button.className='icon-btn';button.setAttribute('aria-label',t(name==='ean'?'EAN scannen':'Seriennummer scannen'));button.innerHTML=icon('barcode');group.append(button);
    const generation=ctx.authGeneration;
    button.onclick=()=>scan(ctx,{onScan:value=>{
        if(!dialog.open||!dialog.contains(input)||generation!==ctx.authGeneration)return;
        const code=String(value),maximum=input.maxLength>0?input.maxLength:250;
        if(code.length>maximum){ctx.toast(t`Der gescannte Code ist zu lang (maximal ${maximum} Zeichen). Der bisherige Wert bleibt erhalten.`);input.focus();return;}
        input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();
    }});
}
function masterSelect(ctx, key, label, kind, item, required = false) {
    const entries = ctx.masterdata[kind] ?? [], value = item[key] ?? (required ? entries.find(x => x.active && x.isDefault)?.id : null);
    const available = entries.filter(x => x.active || x.id === value);
    if(kind==='statuses')available.splice(0,available.length,...workflowStatuses(available));
    return html`<label class="field"><span>${label}${required ? html(' <b>*</b>') : html(' <small>(optional)</small>')}</span><select name="${key}" ${required ? 'required' : ''}>${required ? '' : html('<option value="">Keine Zuordnung</option>')}${available.map(x => html`<option value="${x.id}"${x.id === value ? ' selected' : ''}>${h(masterLabel(x))}${x.active ? '' : t(' (archiviert)')}</option>`).join('')}</select>${!entries.some(x => x.active) ? html('<small>Werte zuerst im Adminbereich anlegen.</small>') : ''}</label>`;
}
function bindForm(dialog: any, ctx, path, method, options: any = {}) {
    const form = dialog.querySelector('form');
    const formAuth=captureAuthContext(ctx),kind=path.startsWith('/api/products')?'products':'returns';
    const canSave=()=>ctx.can(path.endsWith('/status')?'returnsStatus':kind+(method==='POST'?'Create':'Edit'));
    const openRelated=(kind,item)=>{void canLeaveForms(dialog).then(allow=>{if(allow&&dialog.open&&dialog.querySelector('form')===form)showDetails(ctx,kind,item);});};
    const feedback=bindFormFeedback(form,{kind:path.startsWith('/api/products')?'products':'returns',products:ctx.products,returns:ctx.returns,itemId:options.itemId,onOpenReturn:item=>openRelated('returns',item),onOpenProduct:item=>openRelated('products',item)});
    const startSave = trackFormSave(form);
    const createFlow=method==='POST';
    let saving=false;
    form.onsubmit = async (event) => {
        event.preventDefault();
        if(saving||!formAuth()||!canSave()||!dialog.open||dialog.querySelector('form')!==form||options.beforeSave?.()===false)return;
        saving=true;
        const button = form.querySelector('[type=submit]'), error = form.querySelector('.form-error');
        const submitButtons=[...form.querySelectorAll('[type=submit]')];if(!submitButtons.length)submitButtons.push(button);
        const addAnother=createFlow&&event.submitter?.dataset.saveMore==='true';
        const generation=ctx.authGeneration,user=ctx.session?.user?.id;
        submitButtons.forEach(button=>button.disabled=true);
        button.disabled = true;
        error.hidden = true;
        feedback.clearErrors();
        const captured=options.onCapture?.(),committed = startSave();
        try {
            const data=new FormData(form);
            const body: Record<string, any> = Object.fromEntries(data);
            if(options.prepareBody){const prepared=options.prepareBody(body,data);if(prepared?.then)await prepared;}
            if(!formAuth()||!canSave()||generation!==ctx.authGeneration||user!==ctx.session?.user?.id||dialog.querySelector('form')!==form||!dialog.open)return;
            if ('active' in body)
                body.active = body.active === 'true';
            const saved = await ctx.api(path, { method, body });
            if(!formAuth()||!canSave()||generation!==ctx.authGeneration||user!==ctx.session?.user?.id)return;
            if (method === 'POST' && saved?.id) { path += '/' + saved.id; method = 'PUT'; }
            options.onSaved?.(body,saved,captured);
            if (!committed() || dialog.querySelector('form') !== form) return;
            const wasOpen=dialog.open;
            const keepPanel=Boolean(options.afterSaved&&wasOpen&&String(dialog.className).split(/\s+/).includes('detail-drawer'));
            if(!keepPanel)dialog.close();
            await ctx.reload();
            if(generation!==ctx.authGeneration||user!==ctx.session?.user?.id)return;
            if(options.onSuccess)options.onSuccess(saved);else ctx.toast(t('Änderungen gespeichert.'));
            if(options.afterSaved&&keepPanel&&dialog.open&&dialog.querySelector('form')===form)options.afterSaved(saved);
            if(addAnother&&wasOpen&&!dialog.open&&dialog.querySelector('form')===form&&generation===ctx.authGeneration&&user===ctx.session?.user?.id)options.next?.(body);
        }
        catch (err) {
            if(!formAuth()||dialog.querySelector('form')!==form)return;
            setText(error,feedback.showServerError(err.message)?t('Bitte prüfe das markierte Feld.'):apiError(err.message));
            error.hidden = false;
        }
        finally {
            submitButtons.forEach(button=>button.disabled=false);
            saving=false;
        }
    };
}
export function productForm(ctx, item: any = {}) {
    if(!ctx.can(item.id?'productsEdit':'productsCreate')){ctx.toast(t(item.id?'Du hast keine Berechtigung, Produkte zu bearbeiten.':'Du hast keine Berechtigung, Produkte anzulegen.'));return;}
    const priceCurrency={...ctx.config?.currency};
    const dialog = openDialog({ title: item.id ? t('Produkt bearbeiten') : t('Neues Produkt'), subtitle: t('Produktdaten für den gemeinsamen Bestand.'), drawer:Boolean(item.id), body: html`
    <form><div class="dialog-body"><div class="form-grid">
    ${productImageEditor(item)}
    ${input('name', t('Produktname'), item.name, { required: true, full: true, placeholder: t('z. B. kabelloser Kopfhörer'),help:t('Ein eindeutiger Produktname hilft bei der Suche.') })}
    ${input('sku', t('Artikelnummer'), item.sku, { required: true, max: 100, placeholder: 'z. B. KH-001',help:t('Eindeutige Artikelnummer des Produkts. Bestehende Artikelnummern werden beim Speichern geprüft.') })}
    ${input('ean', t('EAN'), item.ean, { placeholder: t('8, 12, 13 oder 14 Ziffern'), help: t('Führende Nullen bleiben erhalten.') })}
    ${masterSelect(ctx, 'manufacturerId', t('Hersteller'), 'manufacturers', item)}
    ${masterSelect(ctx, 'supplierId', t('Lieferant'), 'suppliers', item)}
    ${masterSelect(ctx, 'categoryId', t('Kategorie'), 'categories', item)}
    ${input('price', t('Verkaufspreis (EUR)'), item.priceCents === undefined ? '' : (item.priceCents / 100).toFixed(2).replace('.', ','), { placeholder: '0,00', help:t('Originalpreis in EUR. Die USD-Anzeige wird automatisch umgerechnet.') })}
    ${usesDollar(priceCurrency)?html`<div class="field price-estimate"><span>Umgerechnete Anzeige (USD)</span><strong id="price-estimate">${money(item.priceCents??0,priceCurrency)}</strong><small>Die Umrechnung ändert den gespeicherten Preis nicht.</small></div>`:''}
    <label class="field full"><span>Beschreibung</span><textarea name="description" maxlength="5000" rows="3" placeholder="Weitere Produktinformationen …">${h(item.description)}</textarea></label>
    <label class="field full"><span>Produktstatus</span><select name="active"><option value="true">Aktiv</option><option value="false"${item.active === false ? ' selected' : ''}>Archiviert</option></select></label>
    </div><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">${icon('check')}Produkt speichern</button></div></form>` });
    const imageEditor=bindProductImageEditor(dialog,item);
    bindDeviceScan(ctx,dialog,'ean');
    bindForm(dialog, ctx, `/api/products${item.id ? '/' + item.id : ''}`, item.id ? 'PUT' : 'POST',{itemId:item.id,prepareBody:imageEditor.prepare,onSaved:imageEditor.saved,afterSaved:item.id?()=>{const saved=ctx.products.find(row=>row.id===item.id);if(saved)showDetails(ctx,'products',saved);}:undefined});
    const priceEstimate=dialog.querySelector('#price-estimate');
    if(usesDollar(priceCurrency)&&priceEstimate)dialog.querySelector('[name=price]').addEventListener('input',event=>{
        const price=Number((event.target as HTMLInputElement).value.trim().replace(',','.'));
        setText(priceEstimate,Number.isFinite(price)&&price>=0?money(Math.round(price*100),priceCurrency):'—');
    });
    if(item.id&&item.active!==false&&!ctx.can('productsDelete')){dialog.querySelector('[name=active] option[value=false]').disabled=true;dialog.querySelector('[name=active]').closest('label').insertAdjacentHTML('beforeend',html('<small>Archivieren benötigt das Recht „Produkte archivieren / löschen“.</small>'));}
}
export function defaultReceiptDate(item:any={},timezone='Europe/Berlin',now=Date.now()):string{
    if(item.id||item.receiptDate)return item.receiptDate??'';
    let formatter:Intl.DateTimeFormat;
    try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});}
    catch{formatter=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});}
    const parts=formatter.formatToParts(now),part=(key:string)=>parts.find(value=>value.type===key).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export function returnForm(ctx, item: any = {}, resume?:ReturnDraft) {
    if(!ctx.can(item.id?'returnsEdit':'returnsCreate')){ctx.toast(t(item.id?'Du hast keine Berechtigung, Retouren zu bearbeiten.':'Du hast keine Berechtigung, Retouren anzulegen.'));return;}
    const available = ctx.products.filter(p => p.active || p.id === item.productId);
    if (!available.length) {
        ctx.toast(t('Bitte zuerst ein Produkt anlegen.'));
        if(ctx.can('productsCreate'))return productForm(ctx);
        return;
    }
    const requireSerialNumber=!item.id||Boolean(item.serialNumber?.trim());
    const dialog = openDialog({ title: item.id ? t('Retoure bearbeiten') : t('Neue Retoure'), subtitle: item.returnNumber || t('Vom Eingang bis zum Abschluss alles festhalten.'), wide: true, drawer:Boolean(item.id), body: html`
    <form><div class="dialog-body grouped-form"><fieldset class="form-section"><legend><span>01</span> Produkt & Zuordnung</legend><div class="form-grid">
    ${productPicker(available,item.productId,item.id?null:recentProduct(ctx,available))}
    ${input('serialNumber', t('Seriennummer'), item.serialNumber, { required: requireSerialNumber, placeholder: t('Seriennummer des Geräts'),help:t('Seriennummer des ursprünglichen Geräts. Erneute Retouren derselben Seriennummer sind möglich.') })}
    ${masterSelect(ctx, 'supplierId', t('Lieferant'), 'suppliers', item)}
    ${input('customerReference', t('Kundenreferenz (optional)'), item.customerReference, { placeholder: t('z. B. Kundennummer oder eigene Referenz') })}
    ${input('orderNumber', t('Bestellnummer'), item.orderNumber, { placeholder: 'z. B. BEST-2026-001' })}
    ${input('trackingNumber', t('Sendungsnummer (optional)'), item.trackingNumber, { placeholder: t('z. B. 00340434123456789012') })}
    </div></fieldset><fieldset class="form-section"><legend><span>02</span> Eingang & Prüfung</legend><div class="form-grid">
    ${input('receiptDate', t('Eingangsdatum (optional)'), defaultReceiptDate(item,ctx.config?.rules?.timezone), { full: true, type: 'date', help: t('Ohne Datum wird keine Bearbeitungsfrist berechnet.') })}
    ${masterSelect(ctx, 'reasonId', t('Retourengrund'), 'reasons', item, true)}
    ${masterSelect(ctx, 'conditionId', t('Zustand'), 'conditions', item, true)}
    </div></fieldset><fieldset class="form-section"><legend><span>03</span> Bearbeitung & Ergebnis</legend><div class="form-grid">
    ${masterSelect(ctx, 'statusId', t('Bearbeitungsstatus'), 'statuses', item, true)}
    ${masterSelect(ctx, 'resolutionId', t('Lösung'), 'resolutions', item, true)}
    <label class="field full"><span>Verantwortliche Person (optional)</span><select name="assignedUserId" aria-describedby="return-assignee-help"><option value="">Keine Zuordnung</option>${item.assignedUserId?html`<option value="${h(item.assignedUserId)}" selected>${h(item.assignedDisplayName||t('Bestehende Zuordnung'))}</option>`:''}</select><small class="field-help" id="return-assignee-help" data-assignee-help>Aktive Personen können die Bearbeitung übernehmen. Die Zuordnung ist optional.</small></label>
    <label class="field full"><span>Nächster Schritt (optional)</span><textarea name="nextStep" maxlength="500" rows="2" aria-describedby="return-next-step-help" placeholder="z. B. Gerät prüfen oder Rückfrage beim Lieferanten">${h(item.nextStep)}</textarea><small class="field-help" id="return-next-step-help">Kurz festhalten, was als Nächstes zu tun ist. Maximal 500 Zeichen.</small></label>
    ${input('replacementSerialNumber', t('Austauschseriennummer (optional)'), item.replacementSerialNumber, { full: true, placeholder: t('Seriennummer des Austauschgeräts'), help: t('Bei einem Austausch hier die neue Seriennummer hinterlegen. Die ursprüngliche Seriennummer bleibt erhalten.') })}
    <label class="field full"><span>Notizen</span><textarea name="notes" maxlength="5000" rows="3" placeholder="Prüfergebnis, Zubehör oder weitere Hinweise …">${h(item.notes)}</textarea><small>Diese Angaben sind für alle angemeldeten Personen sichtbar.</small></label>
    </div></fieldset><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer return-form-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}Retoure speichern</button>${item.id?'':html`<button type="submit" class="btn secondary" data-save-more="true">${icon('plus')}Speichern & weitere Retoure</button>`}</div></form>` });
    let draft:ReturnType<typeof bindReturnDraft>;
    bindForm(dialog, ctx, `/api/returns${item.id ? '/' + item.id : ''}`, item.id ? 'PUT' : 'POST',{
        itemId:item.id,
        beforeSave:()=>!draft?.offered,
        onCapture:()=>draft?.capture(),
        prepareBody:body=>{if(body.assignedUserId==='')body.assignedUserId=null;},
        onSaved:(body,saved,captured)=>{rememberProduct(ctx,Number(body.productId));draft?.saved(captured,saved);},
        afterSaved:item.id?()=>{const saved=ctx.returns.find(row=>row.id===item.id);if(saved)showDetails(ctx,'returns',saved);}:undefined,
        next:body=>{const product=ctx.products.find(p=>p.id===Number(body.productId)&&p.active);returnForm(ctx,product?{productId:product.id,supplierId:ctx.masterdata.suppliers?.find(s=>s.id===product.supplierId&&s.active)?.id}:{});}
    });
    const form=dialog.querySelector('form');
    bindDeviceScan(ctx,dialog,'serialNumber');bindDeviceScan(ctx,dialog,'replacementSerialNumber');
    void bindReturnAssignees(form,ctx,item,()=>dialog.open&&dialog.querySelector('form')===form);
    if(item.id&&!ctx.can('returnsStatus')){const status=dialog.querySelector('[name=statusId]');status.disabled=true;status.closest('label').insertAdjacentHTML('beforeend',html('<small>Dein Konto darf den Status nicht ändern.</small>'));}
    for(const field of ctx.config?.rules?.requiredFields??[]){if(field==='serialNumber')continue;const el=dialog.querySelector(`[name=${field==='supplier'?'supplierId':field}]`);if(el){el.required=true;const label=el.closest('label').querySelector('span');label.innerHTML=label.textContent.replace(t('(optional)'),'')+html(' <b>*</b>');}}
    dialog.querySelector('[name=productId]').onchange = (event: any) => {
        const p = available.find(x => x.id === Number(event.target.value));
        const supplier = ctx.masterdata.suppliers?.find(x => x.id === p?.supplierId && x.active);
        dialog.querySelector('[name=supplierId]').value = String(supplier?.id ?? '');
    };
    const picker=bindProductPicker(dialog.querySelector('[data-product-picker]'),available,item.productId);
    const replacement=bindReplacementSerial(ctx,form);
    if(!item.id||resume)draft=bindReturnDraft(ctx,dialog,{
        resume,returnId:item.id,
        apply:(restored,candidate)=>{
            if(restored.id&&restored.id!==item.id){const existing=ctx.returns.find(row=>row.id===restored.id);if(existing)returnForm(ctx,existing,candidate);return;}
            if(restored.productId)picker?.choose(Number(restored.productId));
            else if(Object.hasOwn(restored,'productId')){dialog.querySelector('[data-product-clear]')?.click?.();const search=dialog.querySelector('[data-product-search]');if(search){search.value='';search.setCustomValidity?.(t('Bitte ein Produkt aus der Trefferliste auswählen.'));}}
            for(const [name,value]of Object.entries(restored)){const field=form.querySelector(`[name=${name}]`);if(field)field.value=String(value??'');}
            replacement?.update();
            form.dispatchEvent?.(new Event('input',{bubbles:true}));
        }
    });
}
export function showDetails(ctx, kind, item) {
    const product = kind === 'products';
    const fields = { sku: t('Artikelnummer'), ean: t('EAN'), manufacturer: t('Hersteller'), supplier: t('Lieferant'), category: t('Kategorie'), description: t('Beschreibung') };
    const content=product?html`<div class="detail-summary">${productAvatar(item)}<div><strong>${h(item.name)}</strong><span>${h(item.sku)}</span></div></div><dl class="detail-grid">${Object.entries(fields).map(([key,label])=>html`<div${key==='description'?' class="full"':''}><dt>${label}</dt><dd>${h(masterValue(ctx.masterdata,item,key))}</dd></div>`).join('')}<div><dt>Verkaufspreis</dt><dd>${money(item.priceCents,ctx.config?.currency)}${usesDollar(ctx.config?.currency)?html`<small class="price-original">${t('Originalpreis')}: ${money(item.priceCents)}</small>`:''}</dd></div><div><dt>Produktstatus</dt><dd>${item.active?t('Aktiv'):t('Archiviert')}</dd></div></dl>`:returnDetailContent(ctx.masterdata,item);
    const dialog = openDialog({ title: product ? item.name : item.returnNumber, subtitle: product ? t('Produktdetails') : t('Retourendetails'), drawer: true, body: html`<div class="dialog-body">${content}</div><div class="dialog-footer"><button class="btn danger" id="delete-item">${icon('trash')}Löschen</button><button class="btn primary" id="edit-item">${icon('edit')}Bearbeiten</button></div>` });
    if(!product)bindReturnTimeline(ctx,item,dialog.querySelector('#return-timeline'));
    if (!product)
        renderAttachments(ctx, item.id, dialog.querySelector('#return-attachments'));
    if(!product){const comments=document.createElement('section');comments.id='return-comments';dialog.querySelector('.dialog-body').append(comments);renderComments(ctx,item.id,comments);bindQuickActions(ctx,dialog,()=>[item],{status:statusForm,create:returnForm});}
    if(ctx.can('auditView')){const history=document.createElement('a');history.className='text-link detail-history-link';history.href=auditLink(kind,item.id);setText(history,t('Änderungsverlauf öffnen'));dialog.querySelector('.dialog-body').append(history);}
    dialog.querySelector('#edit-item').hidden=!ctx.can(kind+'Edit');
    dialog.querySelector('#delete-item').hidden=!ctx.can(kind+'Delete');
    if(!product&&item.attachmentCount>0&&!ctx.can('attachmentsDelete')){const remove=dialog.querySelector('#delete-item');remove.disabled=true;remove.title=t('Zum Löschen dieser Retoure benötigst du auch das Recht, ihre Dateianhänge zu löschen.');const hint=document.createElement('p');hint.className='muted small-text';setText(hint,remove.title);dialog.querySelector('.dialog-body').append(hint);}
    if(!product&&ctx.can('returnsStatus')){const button=document.createElement('button');button.className='btn secondary';button.type='button';setText(button,t('Status ändern'));button.onclick=()=>ctx.ensureUnlocked(()=>statusForm(ctx,item));dialog.querySelector('#edit-item').before(button);}
    if(!product&&ctx.can('returnsExport')){const label=document.createElement('button');label.type='button';label.className='btn secondary';label.innerHTML=html`${icon('file')}Etikett drucken`;label.onclick=async()=>{if(await canLeaveForms(dialog))await printReturnLabel(ctx,item.id);};dialog.querySelector('#edit-item').before(label);}
    dialog.querySelector('#edit-item').onclick = async () => {if(await canLeaveForms(dialog))ctx.ensureUnlocked(() => product ? productForm(ctx, item) : returnForm(ctx, item));};
    dialog.querySelector('#delete-item').onclick = () => ctx.ensureUnlocked(() => confirmDelete(ctx, kind, item));
}
export function statusForm(ctx,item){
    if(!ctx.can('returnsStatus'))return;
    const dialog=openDialog({title:t('Retourenstatus ändern'),subtitle:item.returnNumber,body:html`<form><div class="dialog-body"><div class="form-grid">${masterSelect(ctx,'statusId',t('Neuer Status'),'statuses',item,true)}</div><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}Status speichern</button></div></form>`});
    bindForm(dialog,ctx,`/api/returns/${item.id}/status`,'PUT',{onSuccess:result=>offerStatusUndo(ctx,result,t('Status gespeichert.'))});
}
function confirmDelete(ctx, kind, item) {
    const dialog = openDialog({ title: t('Eintrag löschen?'), subtitle: kind === 'products' ? t('Produkte mit verknüpften Retouren werden archiviert.') : t('Die Retoure und ihre Dateianhänge werden dauerhaft entfernt.'), body: html`<div class="dialog-body"><p><strong>${h('name' in item ? item.name : item.returnNumber)}</strong></p><p class="muted">Bitte bestätige diese Änderung am gemeinsamen Bestand.</p><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button id="confirm-delete" class="btn danger">${icon('trash')}Bestätigen</button></div>` });
    dialog.querySelector('#confirm-delete').onclick = async (event) => {
        event.currentTarget.disabled = true;
        try {
            const result = await ctx.api(`/api/${kind}/${item.id}`, { method: 'DELETE' });
            dialog.close();
            await ctx.reload();
            ctx.toast(result.archived ? t('Produkt archiviert.') : t('Eintrag gelöscht.'));
        }
        catch (error) {
            const el = dialog.querySelector('.form-error');
            setText(el,apiError(error.message));
            el.hidden = false;
            event.target.disabled = false;
        }
    };
}
