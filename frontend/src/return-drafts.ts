import {addTranslations,html,setText,t} from './i18n.js';
import {captureAuthContext} from './auth-context.js';

addTranslations({
    'Ungespeicherter Retourenentwurf':'Unsaved return draft',
    'Ein Entwurf ist auf diesem Gerät gespeichert. Möchtest du ihn wiederherstellen oder neu beginnen?':'A draft is saved on this device. Restore it or start again.',
    'Entwurf wiederherstellen':'Restore draft',
    'Entwurf verwerfen & neu beginnen':'Discard draft & start again',
    'Entwurf auf diesem Gerät gespeichert. Er verfällt nach 24 Stunden.':'Draft saved on this device. It expires after 24 hours.',
    'Der Entwurf konnte auf diesem Gerät nicht gespeichert werden.':'The draft could not be saved on this device.',
    'Dieser Entwurf kann mit deinen aktuellen Rechten oder Daten nicht wiederhergestellt werden.':'This draft cannot be restored with your current permissions or data.',
    'Entwurf wiederhergestellt. Bitte prüfe die Eingaben vor dem Speichern.':'Draft restored. Review the entries before saving.',
    'Entwurf wiederhergestellt. Einige Zuordnungen sind nicht mehr verfügbar. Bitte neu auswählen.':'Draft restored. Some assignments are no longer available. Select them again.',
    'Die Retoure wurde gespeichert. Neuere Eingaben konnten nicht als Entwurf gesichert werden. Bitte speichere sie vor dem Neuladen.':'The return was saved. Newer entries could not be saved as a draft. Save them before reloading.',
    'Austauschseriennummer hinzufügen':'Add replacement serial number',
    'Auch für eine eigene Lösung kannst du eine Austauschseriennummer ergänzen.':'You can also add a replacement serial number for a custom resolution.'
});

const FIELD_LIMITS={productId:16,supplierId:16,reasonId:16,conditionId:16,statusId:16,resolutionId:16,assignedUserId:16,serialNumber:250,replacementSerialNumber:250,customerReference:250,trackingNumber:250,orderNumber:250,receiptDate:10,nextStep:500,notes:5000};
const referenceKinds={supplierId:'suppliers',reasonId:'reasons',conditionId:'conditions',statusId:'statuses',resolutionId:'resolutions'};
const MAX_RECORD_LENGTH=24000,MAX_AGE=24*60*60*1000;
type Fields=Partial<Record<keyof typeof FIELD_LIMITS,string>>;
export type ReturnDraft={v:1;accountId:string;updatedAt:number;revision:string;returnId:number|null;fields:Fields};
const account=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value))?value:null;
function supportedFields(value:any):Fields|null{
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const fields:Fields={};
    for(const [key,max]of Object.entries(FIELD_LIMITS)){
        if(!Object.hasOwn(value,key))continue;
        if(typeof value[key]!=='string'||value[key].length>max)return null;
        fields[key]=value[key];
    }
    return fields;
}
function localStorageForDrafts(){try{return globalThis.localStorage;}catch{return null;}}
export function createReturnDraftStore(storage:any=localStorageForDrafts(),now:()=>number=Date.now){
    const key=(user:string)=>`retourenboard:return-draft:v1:${user}`;
    function read(user:unknown):ReturnDraft|null{
        const id=account(user);if(!id)return null;
        try{
            const raw=storage?.getItem(key(id));if(!raw||raw.length>MAX_RECORD_LENGTH)return null;
            const item=JSON.parse(raw),fields=supportedFields(item?.fields),time=now();
            if(item?.v!==1||item.accountId!==id||!fields||typeof item.updatedAt!=='number'||!Number.isFinite(item.updatedAt)||item.updatedAt>time+60000||time-item.updatedAt>MAX_AGE||typeof item.revision!=='string'||!/^[a-zA-Z0-9.-]{1,100}$/.test(item.revision)||item.returnId!==null&&!account(item.returnId))return null;
            return {v:1,accountId:id,updatedAt:item.updatedAt,revision:item.revision,returnId:item.returnId===null?null:Number(item.returnId),fields};
        }catch{return null;}
    }
    return {
        read,
        write(user:unknown,value:any,options:{expectedRevision?:string|null;returnId?:number|null}={}):ReturnDraft|null{
            const id=account(user),fields=supportedFields(value);if(!id||!fields||options.returnId!=null&&!account(options.returnId))return null;
            if((read(user)?.revision??null)!==(options.expectedRevision??null))return null;
            const draft:ReturnDraft={v:1,accountId:id,updatedAt:now(),revision:globalThis.crypto?.randomUUID?.()??`${Date.now()}.${Math.random().toString(36).slice(2)}`,returnId:options.returnId??null,fields};
            try{const raw=JSON.stringify(draft);if(raw.length>MAX_RECORD_LENGTH||!storage)return null;storage.setItem(key(id),raw);return draft;}catch{return null;}
        },
        clear(user:unknown,revision:string):boolean{
            const id=account(user);if(!id||read(user)?.revision!==revision)return false;
            try{storage.removeItem(key(id));return true;}catch{return false;}
        }
    };
}
function validDate(value:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateReturnDraft(ctx:any,draft:ReturnDraft,assignees:any[]=ctx.returnAssignees){
    if(!draft||draft.accountId!==account(ctx.session?.user?.id))return null;
    const existing=draft.returnId?(ctx.returns??[]).find(row=>row.id===draft.returnId):null;
    if(draft.returnId&&!existing||!ctx.can(existing?'returnsEdit':'returnsCreate'))return null;
    const fields=supportedFields(draft.fields);if(!fields)return null;
    const item:any=existing?{id:existing.id,returnNumber:existing.returnNumber,assignedDisplayName:existing.assignedDisplayName}:{};
    for(const key of Object.keys(FIELD_LIMITS))if(existing&&existing[key]!==undefined)item[key]=existing[key];
    Object.assign(item,fields);let changed=false;
    const validateReference=(key:string,rows:any[])=>{
        if(!Object.hasOwn(fields,key)||fields[key]===''){if(Object.hasOwn(fields,key))item[key]='';return;}
        const id=Number(fields[key]),known=(rows??[]).find(row=>row?.id===id&&(row.active!==false||existing?.[key]===id));
        // The assignee endpoint deliberately lists active people only. An
        // unchanged assignment on the current saved record is still valid.
        const preservedAssignee=key==='assignedUserId'&&existing?.assignedUserId===id;
        if(!account(fields[key])||!known&&!preservedAssignee){item[key]='';changed=true;}else item[key]=id;
    };
    validateReference('productId',ctx.products);
    for(const [key,kind]of Object.entries(referenceKinds))validateReference(key,ctx.masterdata?.[kind]);
    validateReference('assignedUserId',assignees);
    if(existing&&!ctx.can('returnsStatus')&&item.statusId!==existing.statusId){item.statusId=existing.statusId;changed=true;}
    if(item.receiptDate&&!validDate(item.receiptDate)){item.receiptDate='';changed=true;}
    return {item,changed};
}
export function replacementSerialRelevant(resolution:any,value:unknown=''){
    return Boolean(typeof value==='string'&&value.length)||resolution?.builtinKey==='resolutions.exchange'||String(resolution?.code??'').toLowerCase()==='exchange'||['exchange','Austausch'].includes(resolution?.defaultValue);
}

type DraftOptions={store?:ReturnType<typeof createReturnDraftStore>;readFields:()=>Fields;isCurrent?:()=>boolean;apply?:(item:any,draft:ReturnDraft)=>void;onState?:(state:string)=>void;resume?:ReturnDraft;returnId?:number};
type DraftSave={sequence:number;revision:string|null;returnId:number|null};
export function createReturnDraftController(ctx:any,options:DraftOptions){
    const store=options.store??createReturnDraftStore(),user=ctx.session?.user?.id,authCurrent=captureAuthContext(ctx),candidate=options.resume??store.read(user);
    let offered=Boolean(candidate&&!options.resume),revision=candidate?.revision??null,returnId=options.returnId??candidate?.returnId??null,sequence=0,active=true;
    const ownerCurrent=()=>authCurrent()&&account(user)!==null;
    const formPermission=()=>ctx.can(options.returnId?'returnsEdit':'returnsCreate');
    const authorized=()=>ownerCurrent()&&(offered?formPermission():ctx.can(returnId?'returnsEdit':'returnsCreate'));
    const current=()=>authorized()&&active&&(options.isCurrent?.()??true);
    const state=(value:string)=>options.onState?.(value);
    function persist(){
        if(!current()||offered)return;
        const saved=store.write(user,options.readFields(),{expectedRevision:revision,returnId});
        if(saved){revision=saved.revision;state('saved');}else state('unavailable');
    }
    function discard(stop=true){
        if(!ownerCurrent()||!formPermission())return false;
        const removed=revision?store.clear(user,revision):true;
        if(removed){revision=null;if(offered)returnId=options.returnId??null;offered=false;state('none');}else state('unavailable');
        if(stop)active=false;
        return removed;
    }
    return {
        candidate,
        get offered(){return offered;},
        change(){if(!current()||offered)return;sequence++;persist();},
        capture():DraftSave|null{if(!current()||offered)return null;persist();return {sequence,revision,returnId};},
        saved(token:DraftSave|null,saved:any){
            if(!token||!authorized()||!active)return;
            if(token.sequence===sequence){if(token.revision)store.clear(user,token.revision);active=false;state('none');return;}
            // A POST can succeed while the user continues typing. Keep those
            // newer edits attached to that record, so recovery cannot create
            // a duplicate return after a reload.
            if(returnId===null&&account(saved?.id))returnId=Number(saved.id);
            const latest=store.read(user);
            if(latest&&latest.revision===revision){
                const updated=store.write(user,latest.fields,{expectedRevision:revision,returnId});
                if(updated)revision=updated.revision;
                else{
                    // A remaining create draft would recover as another POST.
                    // Remove only our captured revision when persisting the
                    // created ID fails; newer drafts keep their ownership.
                    if(store.clear(user,revision))revision=null;
                    state('linkFailed');
                }
            }
        },
        discard,
        reset(){const cleared=discard(false);sequence++;return cleared;},
        async restore(){
            if(!candidate||!current())return false;
            const started=sequence;
            let assignees=ctx.returnAssignees;
            if(!Array.isArray(assignees)){
                try{assignees=await ctx.api('/api/returns/assignees');}catch{if(current())state('invalid');return false;}
            }
            if(!current()||started!==sequence||!Array.isArray(assignees))return false;
            const restored=validateReturnDraft(ctx,candidate,assignees);
            if(!restored){state('invalid');return false;}
            offered=false;returnId=candidate.returnId;
            options.apply?.(restored.item,candidate);sequence++;persist();state(restored.changed?'references':'restored');
            return true;
        }
    };
}

export function bindReturnDraft(ctx:any,dialog:any,options:Partial<DraftOptions>={}){
    const form=dialog.querySelector('form'),body=form?.querySelector('.dialog-body');
    const document=form.ownerDocument??globalThis.document;
    const status=document.createElement('p');status.className='return-draft-status muted small-text';status.hidden=true;status.setAttribute('role','status');body?.prepend?.(status);
    const messages={saved:'Entwurf auf diesem Gerät gespeichert. Er verfällt nach 24 Stunden.',unavailable:'Der Entwurf konnte auf diesem Gerät nicht gespeichert werden.',invalid:'Dieser Entwurf kann mit deinen aktuellen Rechten oder Daten nicht wiederhergestellt werden.',restored:'Entwurf wiederhergestellt. Bitte prüfe die Eingaben vor dem Speichern.',references:'Entwurf wiederhergestellt. Einige Zuordnungen sind nicht mehr verfügbar. Bitte neu auswählen.',linkFailed:'Die Retoure wurde gespeichert. Neuere Eingaben konnten nicht als Entwurf gesichert werden. Bitte speichere sie vor dem Neuladen.'};
    let applying=false,offer:any=null;
    const lock=(value:boolean)=>{
        for(const section of form.querySelectorAll('.form-section'))section.inert=value;
        for(const button of form.querySelectorAll('[type=submit]'))button.disabled=value;
    };
    const control=createReturnDraftController(ctx,{
        ...options,
        isCurrent:()=>dialog.open&&dialog.querySelector('form')===form&&form.isConnected!==false&&(options.isCurrent?.()??true),
        readFields:()=>{
            const values:Fields={};
            for(const key of Object.keys(FIELD_LIMITS)){const field=form.querySelector(`[name=${key}]`);if(field&&typeof field.value==='string')values[key]=field.value;}
            return values;
        },
        apply:(item,draft)=>{
            lock(false);offer?.remove();applying=true;
            try{options.apply?.(item,draft);}finally{applying=false;}
        },
        onState:value=>{status.hidden=!messages[value];if(messages[value])setText(status,t(messages[value]));options.onState?.(value);}
    });
    form.addEventListener('input',()=>{if(!applying)control.change();});
    form.addEventListener('change',()=>{if(!applying)control.change();});
    form.addEventListener('form-discard',()=>{control.discard();});
    form.addEventListener('reset',event=>{if(!event.defaultPrevented&&control.reset()){lock(false);offer?.remove();}});
    const closed=()=>{if(dialog.querySelector('form')===form&&form.dataset.dirty==='false'&&!control.offered)control.discard();dialog.removeEventListener?.('close',closed);};
    dialog.addEventListener('close',closed);
    if(control.offered){
        offer=document.createElement('section');offer.className='return-draft-offer';offer.setAttribute('aria-label',t('Ungespeicherter Retourenentwurf'));
        offer.innerHTML=html('<strong>Ungespeicherter Retourenentwurf</strong><p>Ein Entwurf ist auf diesem Gerät gespeichert. Möchtest du ihn wiederherstellen oder neu beginnen?</p><div class="return-draft-actions"><button type="button" class="btn primary" data-draft-restore>Entwurf wiederherstellen</button><button type="button" class="btn secondary" data-draft-discard>Entwurf verwerfen &amp; neu beginnen</button></div>');
        const restore=offer.querySelector('[data-draft-restore]'),discard=offer.querySelector('[data-draft-discard]');
        setText(discard,t('Entwurf verwerfen & neu beginnen'));
        restore.onclick=async()=>{if(restore.disabled)return;restore.disabled=true;discard.disabled=true;try{await control.restore();}finally{restore.disabled=false;discard.disabled=false;}};
        discard.onclick=()=>{if(control.discard(false)){lock(false);offer.remove();}};
        body?.prepend?.(offer);lock(true);
    }else if(options.resume)void control.restore();
    return control;
}

export function bindReplacementSerial(ctx:any,form:any){
    const serial=form.querySelector('[name=replacementSerialNumber]'),select=form.querySelector('[name=resolutionId]'),field=serial?.closest('label');if(!field||!select)return;
    const document=form.ownerDocument??globalThis.document,current=captureAuthContext(ctx),reveal=document.createElement('button');
    field.className=String(field.className??'')+' return-replacement-serial';field.id='return-replacement-serial';
    reveal.type='button';reveal.className='field full text-link return-replacement-reveal';reveal.setAttribute('aria-controls',field.id);reveal.setAttribute('title',t('Auch für eine eigene Lösung kannst du eine Austauschseriennummer ergänzen.'));setText(reveal,t('Austauschseriennummer hinzufügen'));field.before(reveal);
    let manual=false;
    const update=()=>{
        const resolution=ctx.masterdata?.resolutions?.find(row=>String(row.id)===select.value),visible=manual||serial.required||replacementSerialRelevant(resolution,serial.value);
        field.hidden=!visible;reveal.hidden=visible;reveal.setAttribute('aria-expanded',String(visible));
    };
    reveal.onclick=()=>{if(!current()||form.isConnected===false)return;manual=true;update();serial.focus();};
    select.addEventListener('change',update);serial.addEventListener('input',update);serial.addEventListener('change',update);form.addEventListener?.('reset',()=>queueMicrotask(update));update();
    return {update};
}
