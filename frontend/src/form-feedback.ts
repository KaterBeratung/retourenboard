import {focusFormControl} from './ui.js';
import {addTranslations,apiError,setText,t} from './i18n.js';
import {serialKey} from '../shared/serial-number.js';

export const FORM_FEEDBACK_TRANSLATIONS={
    'Dieses Feld ist erforderlich.':'This field is required.',
    'Bitte einen gültigen Wert eingeben.':'Enter a valid value.',
    'Bitte einen kürzeren Wert eingeben.':'Enter a shorter value.',
    'Bitte einen Wert innerhalb des erlaubten Bereichs eingeben.':'Enter a value within the allowed range.',
    'Bitte prüfe das markierte Feld.':'Check the highlighted field.',
    'Diese Seriennummer ist bereits bei anderen Retouren erfasst. Bitte prüfe die bestehenden Vorgänge. Dasselbe Gerät darf erneut zurückkommen.':'This serial number appears on other returns. Check the existing records. The same device may legitimately be returned again.',
    'Diese Artikelnummer ist bereits bei einem anderen Produkt erfasst. Bitte prüfe den bestehenden Artikel. Beim Speichern wird die Artikelnummer geprüft.':'This SKU appears on another product. Check the existing item. The server validates the SKU when saving.',
    'Verantwortliche Person (optional)':'Responsible person (optional)',
    'Verantwortliche Person':'Responsible person',
    'Keine Zuordnung':'No assignment',
    'Person':'Person',
    'Bestehende Zuordnung':'Existing assignment',
    'Aktive Personen können die Bearbeitung übernehmen. Die Zuordnung ist optional.':'Active people can take responsibility for processing. Assignment is optional.',
    'Eine verantwortliche Person auswählen.':'Choose a responsible person.',
    'Personen konnten nicht geladen werden. Die bestehende Zuordnung bleibt erhalten.':'People could not be loaded. The existing assignment is retained.',
    'Nächster Schritt (optional)':'Next step (optional)',
    'Nächster Schritt':'Next step',
    'z. B. Gerät prüfen oder Rückfrage beim Lieferanten':'e.g. inspect the device or contact the supplier',
    'Kurz festhalten, was als Nächstes zu tun ist. Maximal 500 Zeichen.':'Briefly note what needs to happen next. Up to 500 characters.',
    'Ein eindeutiger Produktname hilft bei der Suche.':'A clear product name helps when searching.',
    'Eindeutige Artikelnummer des Produkts. Bestehende Artikelnummern werden beim Speichern geprüft.':'The product’s unique SKU. Existing SKUs are checked when saving.',
    'Seriennummer des ursprünglichen Geräts. Erneute Retouren derselben Seriennummer sind möglich.':'The original device’s serial number. Further returns with the same serial number are possible.',
    'EAN muss 8, 12, 13 oder 14 Ziffern enthalten.':'EAN must contain 8, 12, 13 or 14 digits.',
    'Ungültiger Preis.':'Invalid price.',
    'Preis muss ein positiver Betrag mit maximal zwei Nachkommastellen sein.':'Price must be a positive amount with at most two decimal places.',
    'Bitte ein gültiges Eingangsdatum angeben.':'Enter a valid receipt date.',
    'Bitte ein Produkt auswählen.':'Select a product.',
    'Bitte ein Produkt aus der Trefferliste auswählen.':'Select a product from the results.',
    'Artikelnummer oder Retourennummer ist bereits vorhanden.':'The SKU or return number already exists.',
    'Zuständigkeit muss eine gültige Konto-ID sein.':'Assignment must contain a valid account ID.',
    'Zuständiges Konto nicht gefunden.':'The assigned account was not found.',
    'Nur aktive Konten können neu zugeordnet werden.':'Only active accounts can be newly assigned.',
    'Nächster Schritt: maximal 500 Zeichen erlaubt.':'Next step: at most 500 characters are allowed.',
    'Lieferant ist laut Retourenregeln erforderlich.':'Supplier is required by the return rules.',
    'Bestellnummer ist laut Retourenregeln erforderlich.':'Order number is required by the return rules.',
    'Notizen ist laut Retourenregeln erforderlich.':'Notes are required by the return rules.'
};
addTranslations(FORM_FEEDBACK_TRANSLATIONS);

const normalized=(value:unknown)=>typeof value==='string'?value.trim().normalize('NFKC').toLowerCase():'';
const sameId=(left:unknown,right:unknown)=>right!==undefined&&right!==null&&String(left)===String(right);
export function duplicateSerials(rows:any[],value:unknown,excludeId?:unknown){
    const serial=serialKey(value);
    return serial&&Array.isArray(rows)?rows.filter(row=>row&&!sameId(row.id,excludeId)&&(serialKey(row.serialNumber)===serial||serialKey(row.replacementSerialNumber)===serial)):[];
}

type FeedbackOptions={serialAdvice?:boolean;kind?:string;products?:any[];returns?:any[];itemId?:number;onOpenReturn?:(row:any)=>void;onOpenProduct?:(row:any)=>void};
let nextFeedbackId=0;
const labels={name:'Produktname',sku:'Artikelnummer',ean:'EAN',serialNumber:'Seriennummer',replacementSerialNumber:'Austauschseriennummer',receiptDate:'Eingangsdatum',customerReference:'Kundenreferenz',trackingNumber:'Sendungsnummer',orderNumber:'Bestellnummer',notes:'Notizen',description:'Beschreibung',nextStep:'Nächster Schritt'};
function explicitServerField(message:string,kind?:string){
    if(kind==='returns'){
        const returnRules={'Seriennummer':'serialNumber','Bestellnummer':'orderNumber','Lieferant':'supplierId','Notizen':'notes'};
        for(const [label,name]of Object.entries(returnRules))if(message===`${label} ist laut Retourenregeln erforderlich.`)return name;
        if(['Zuständigkeit muss eine gültige Konto-ID sein.','Zuständiges Konto nicht gefunden.','Nur aktive Konten können neu zugeordnet werden.'].includes(message))return 'assignedUserId';
    }
    for(const [name,label]of Object.entries(labels)){
        const english=String(t(label).en);
        if(message===`${label} ist erforderlich.`||message===`${english} is required.`)return name;
        for(const prefix of [label,english]){
            if(message.startsWith(prefix+': ')&&/^(?:maximal \d+ Zeichen erlaubt\.|at most \d+ characters are allowed\.)$/.test(message.slice(prefix.length+2)))return name;
        }
    }
    const exact={
        'EAN muss 8, 12, 13 oder 14 Ziffern enthalten.':'ean',
        'EAN must contain 8, 12, 13 or 14 digits.':'ean',
        'Ungültiger Preis.':'price','Invalid price.':'price',
        'Preis muss ein positiver Betrag mit maximal zwei Nachkommastellen sein.':'price',
        'Price must be a positive amount with at most two decimal places.':'price',
        'Bitte ein gültiges Eingangsdatum angeben.':'receiptDate','Enter a valid receipt date.':'receiptDate',
        'Bitte ein Produkt auswählen.':'productId','Select a product.':'productId',
        'Ungültiger Wert für reason.':'reasonId','Ungültiger Wert für condition.':'conditionId',
        'Ungültiger Wert für status.':'statusId','Ungültiger Wert für resolution.':'resolutionId'
    };
    if(exact[message])return exact[message];
    // Products have no return-number input. On a return this database error is
    // ambiguous, so it deliberately remains at form level.
    if(kind==='products'&&['Artikelnummer oder Retourennummer ist bereits vorhanden.','The SKU or return number already exists.'].includes(message))return 'sku';
    return null;
}
function nativeMessage(control:any){
    const validity=control.validity??{};
    if(validity.valueMissing)return t('Dieses Feld ist erforderlich.');
    if(validity.tooLong)return t('Bitte einen kürzeren Wert eingeben.');
    if(validity.rangeUnderflow||validity.rangeOverflow)return t('Bitte einen Wert innerhalb des erlaubten Bereichs eingeben.');
    if(validity.customError&&control.validationMessage)return t(control.validationMessage);
    return t('Bitte einen gültigen Wert eingeben.');
}
function describe(control:any,id:string,include:boolean){
    const tokens=String(control.getAttribute?.('aria-describedby')??'').split(/\s+/).filter(Boolean).filter(token=>token!==id);
    if(include)tokens.push(id);
    if(tokens.length)control.setAttribute?.('aria-describedby',tokens.join(' '));else control.removeAttribute?.('aria-describedby');
}
function focusError(control:any,form:any){
    focusFormControl(form,control,{block:'center',behavior:'auto'});
}
export function bindFormFeedback(form:any,options:FeedbackOptions={}){
    const document=form.ownerDocument??globalThis.document,prefix=`form-feedback-${++nextFeedbackId}`;
    const errors=new Map<any,any>();
    const controlFor=(name:string)=>name==='productId'?form.querySelector('[data-product-search]')??form.querySelector('[name=productId]'):form.querySelector(`[name=${name}]`);
    function showError(control:any,message:any){
        if(!control)return false;
        const field=control.closest?.('.field')??control.closest?.('label');
        if(!field?.append)return false;
        let error=errors.get(control);
        if(!error){error=document.createElement('small');error.className='field-error';error.id=`${prefix}-error-${errors.size}`;error.setAttribute('role','alert');field.append(error);errors.set(control,error);}
        setText(error,message);error.hidden=false;control.setAttribute?.('aria-invalid','true');describe(control,error.id,true);
        return true;
    }
    function clearError(control:any){
        const error=errors.get(control);if(!error)return;
        error.hidden=true;setText(error,'');control.removeAttribute?.('aria-invalid');describe(control,error.id,false);
    }
    let firstInvalid:any=null;
    form.addEventListener('invalid',event=>{
        const control=event.target;if(!showError(control,nativeMessage(control)))return;
        event.preventDefault();
        if(!firstInvalid){firstInvalid=control;queueMicrotask(()=>{const first=firstInvalid;firstInvalid=null;if(form.isConnected!==false&&first?.validity?.valid!==true)focusError(first,form);});}
    },true);

    const serial=options.kind==='returns'?controlFor('serialNumber'):null,sku=options.kind==='products'?controlFor('sku'):null;
    const advisoryControl=serial&&options.serialAdvice===false?null:serial??sku;
    let advisory:any=null;
    if(advisoryControl){
        const field=advisoryControl.closest?.('.field')??advisoryControl.closest?.('label');
        if(field?.append){advisory=document.createElement('div');advisory.className='field-advisory';advisory.id=`prefix-advisory-${prefix}`;advisory.hidden=true;advisory.setAttribute('role','status');field.append(advisory);}
    }
    function updateAdvice(){
        if(!advisory)return;
        const duplicateRows=serial?duplicateSerials(options.returns??[],serial.value,options.itemId):(options.products??[]).filter(row=>row&&!sameId(row.id,options.itemId)&&normalized(sku.value)&&normalized(row.sku)===normalized(sku.value));
        advisory.textContent='';advisory.hidden=!duplicateRows.length;describe(advisoryControl,advisory.id,duplicateRows.length>0);
        if(!duplicateRows.length)return;
        const explanation=document.createElement('p');setText(explanation,t(serial?'Diese Seriennummer ist bereits bei anderen Retouren erfasst. Bitte prüfe die bestehenden Vorgänge. Dasselbe Gerät darf erneut zurückkommen.':'Diese Artikelnummer ist bereits bei einem anderen Produkt erfasst. Bitte prüfe den bestehenden Artikel. Beim Speichern wird die Artikelnummer geprüft.'));advisory.append(explanation);
        const list=document.createElement('ul');list.className='field-advisory-links';
        for(const row of duplicateRows){
            const entry=document.createElement('li');
            const validId=Number.isSafeInteger(Number(row.id))&&Number(row.id)>0;
            const link=document.createElement(validId?'a':'span');
            // Names, references, return numbers and status labels are persisted
            // data. They are displayed as text, never HTML or translation keys.
            setText(link,serial?row.returnNumber||String(row.id??''):row.name||row.sku||'');
            if(validId){link.href=serial?`#returns?detail=${Number(row.id)}`:'#products';const open=serial?options.onOpenReturn:options.onOpenProduct;if(open)link.addEventListener('click',event=>{event.preventDefault();open(row);});}
            entry.append(link);
            const detail=document.createElement('span');
            const values=serial?[row.customerReference,row.productName,row.status]:[row.sku];
            setText(detail,values.filter(value=>typeof value==='string'&&value).map(value=>' · '+value).join(''));entry.append(detail);list.append(entry);
        }
        advisory.append(list);
    }
    const changed=event=>{
        const control=event.target;
        if(errors.has(control)){
            const nativeInvalid=control.validity?.valid===false;
            if(nativeInvalid)showError(control,nativeMessage(control));else clearError(control);
        }
        if(control===serial||control===sku||control?.name==='productId'||control?.dataset?.productSearch!==undefined)updateAdvice();
    };
    form.addEventListener('input',changed);form.addEventListener('change',changed);updateAdvice();
    return {
        clearErrors(){for(const control of errors.keys())clearError(control);},
        showServerError(message:unknown){
            if(typeof message!=='string')return false;
            const name=explicitServerField(message,options.kind),control=name?controlFor(name):null;
            if(!showError(control,apiError(message)))return false;
            focusError(control,form);return true;
        }
    };
}

export async function bindReturnAssignees(form:any,ctx:any,item:any={},isCurrent:()=>boolean=()=>true){
    const select=form.querySelector('[name=assignedUserId]');if(!select)return;
    const hint=form.querySelector('[data-assignee-help]'),generation=ctx.authGeneration,user=ctx.session?.user?.id;
    const current=()=>form.isConnected!==false&&isCurrent()&&ctx.authGeneration===generation&&ctx.session?.user?.id===user;
    try{
        const cached=ctx.returnAssignees;
        const rows=Array.isArray(cached)?cached:await ctx.api('/api/returns/assignees');
        if(!current())return;
        if(!Array.isArray(rows))throw new Error('Invalid assignee response');
        const document=form.ownerDocument??globalThis.document,value=select.value,previous=[...(select.options??[])];
        const option=(id:any,label:any)=>{const node=document.createElement('option');node.value=String(id??'');setText(node,label);return node;};
        const choices=[option('',t('Keine Zuordnung'))],ids=new Set<string>();
        for(const row of rows){
            if(!row||!Number.isSafeInteger(Number(row.id))||Number(row.id)<=0||ids.has(String(row.id)))continue;
            ids.add(String(row.id));choices.push(option(row.id,row.displayName||row.username||String(row.id)));
        }
        // An inactive person remains available for an existing assignment.
        // Preserve any selection made while the request was pending as well.
        for(const id of [String(item.assignedUserId??''),value]){
            if(!/^\d+$/.test(id)||Number(id)<=0||ids.has(id))continue;
            const old=previous.find(node=>node.value===id);
            const label=old?.textContent||item.assignedDisplayName||t('Bestehende Zuordnung');
            choices.push(option(id,label));ids.add(id);
        }
        select.replaceChildren(...choices);select.value=value;
        setText(hint,t(select.required?'Eine verantwortliche Person auswählen.':'Aktive Personen können die Bearbeitung übernehmen. Die Zuordnung ist optional.'));
    }catch{
        if(current())setText(hint,t('Personen konnten nicht geladen werden. Die bestehende Zuordnung bleibt erhalten.'));
    }
}
