import {addTranslations,html,locale,setText,t,apiError} from './i18n.js';
import {h,icon} from './ui.js';
import {markForm,observeForm,refreshFormState} from './unsaved.js';

addTranslations({
  'Dateien anhängen':'Attach files','Dateien senden':'Send files','Dateiauswahl entfernen':'Remove file selection',
  'Ausgewählte Dateien':'Selected files','Dateianhang':'File attachment','Bild ansehen':'View image',
  'PDF-Dokument':'PDF document','Herunterladen':'Download','Erneut versuchen':'Try again',
  'PDF, PNG, JPG/JPEG oder WebP · je maximal':'PDF, PNG, JPG/JPEG or WebP · up to',
  'MB':'MB','Datei entfernen':'Remove file','Bitte mindestens eine Datei auswählen.':'Please select at least one file.',
  'Die Dateien werden bereits gesendet.':'The files are already being sent.',
  'Nur PDF, PNG, JPG/JPEG und WebP sind erlaubt.':'Only PDF, PNG, JPG/JPEG and WebP files are allowed.',
  'Leere Dateien können nicht gesendet werden.':'Empty files cannot be sent.',
  'Eine Datei ist zu groß. Maximal':'A file is too large. A maximum of',
  'MB pro Datei sind erlaubt.':'MB per file is allowed.',
  'Datei':'File','von':'of','wird gesendet:':'is being sent:',
  'Datei(en) gesendet.':'file(s) sent.',
  'Die noch ausgewählten Dateien kannst du erneut senden.':'You can send the remaining selected files again.',
  'Pro Unterhaltung sind maximal 200 Dateien und insgesamt 250 MB erlaubt. Alte Dateien können über ihre Nachricht gelöscht werden.':'Each conversation allows up to 200 files and 250 MB in total. You can remove older files by deleting their message.',
  'Ungültige Dateigröße.':'Invalid file size.','Ungültige Datei im Datenspeicher.':'Invalid file in storage.',
  'Ungültiger Dateiname im Datenspeicher.':'Invalid filename in storage.','Ungültiger Dateipfad im Datenspeicher.':'Invalid file path in storage.',
  'Dateinachrichten können nur gelöscht werden.':'Messages containing files can only be deleted.'
});

const imageTypes=new Set(['image/png','image/jpeg','image/webp']);
const fileTypes=new Set([...imageTypes,'application/pdf']);
const uploadLimit=(value:any)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):10;
export const chatFileSize=(size:number)=>size<1048576?t`${Math.max(1,Math.round(size/1024))} KB`:t`${(size/1048576).toLocaleString(locale(),{maximumFractionDigits:1})} MB`;

// IDs belong to selections rather than filenames. A completed request can only
// remove the selection it submitted, even when more files are picked meanwhile.
export function createChatFileFlow({upload,maxMb=10,active=()=>true,onChange=()=>{},onUploaded=()=>{}}:any){
  let files:{id:number,file:File}[]=[],sequence=0,busy=false,progress:any=null,sending=new Set<number>();
  const limit=uploadLimit(maxMb);
  const flow={
    get files(){return [...files];},get busy(){return busy;},get progress(){return progress;},
    isSending(id:number){return sending.has(id);},
    select(values:File[]){
      for(const file of values){
        if(!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)||file.type&&!fileTypes.has(file.type))throw Error(t('Nur PDF, PNG, JPG/JPEG und WebP sind erlaubt.'));
        if(!file.size)throw Error(t('Leere Dateien können nicht gesendet werden.'));
        if(file.size>limit*1048576)throw Error(t`Eine Datei ist zu groß. Maximal ${limit} MB pro Datei sind erlaubt.`);
      }
      files.push(...values.map(file=>({id:++sequence,file})));onChange();
    },
    remove(id:number){if(sending.has(id))return false;const before=files.length;files=files.filter(entry=>entry.id!==id);if(files.length!==before)onChange();return files.length!==before;},
    async send(){
      if(busy)throw Error(t('Die Dateien werden bereits gesendet.'));
      if(!files.length)throw Error(t('Bitte mindestens eine Datei auswählen.'));
      if(!active())return [];
      const batch=[...files],results:any[]=[];busy=true;sending=new Set(batch.map(entry=>entry.id));
      try{
        for(const [index,entry] of batch.entries()){
          if(!active())break;
          progress={index:index+1,total:batch.length,name:entry.file.name};onChange();
          const row=await upload(entry.file);
          if(!active())break;
          files=files.filter(item=>item.id!==entry.id);results.push(row);onChange();onUploaded(row);
        }
        return results;
      }finally{busy=false;progress=null;sending.clear();onChange();}
    }
  };return flow;
}


export function chatFileControls(config:any){
  return html`<div class="chat-file-composer"><input type="file" data-chat-file-input accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden aria-label="Dateien anhängen"><input type="hidden" name="chatAttachmentDraft" value=""><div class="chat-file-toolbar"><button class="btn secondary small" type="button" data-chat-file-pick>${icon('paperclip')}Dateien anhängen</button><small class="muted">${t`PDF, PNG, JPG/JPEG oder WebP · je maximal ${uploadLimit(config?.uploadMaxMb)} MB`}</small></div><ul class="chat-file-selection" data-chat-file-selection aria-label="Ausgewählte Dateien" hidden></ul><div class="chat-file-send-row"><p class="chat-file-status muted" data-chat-file-status role="status" aria-live="polite" hidden></p><button class="btn secondary small" type="button" data-chat-file-send hidden>${icon('upload')}Dateien senden</button></div><p class="form-error" data-chat-file-error role="alert" hidden></p></div>`;
}

export function renderChatAttachments(attachments:any[]=[]){
  const items=attachments.filter(item=>Number.isSafeInteger(item.id)&&item.id>0);
  if(!items.length)return '';
  return html`<ul class="chat-message-files" aria-label="Dateianhang">${items.map(item=>html`<li class="chat-message-file">${imageTypes.has(item.mediaType)?html`<a class="chat-file-image" href="/api/chat/attachments/${item.id}/preview" target="_blank" rel="noopener" aria-label="Bild ansehen"><img src="/api/chat/attachments/${item.id}/preview" alt="${h(item.originalName)}" loading="lazy" decoding="async"></a>`:html`<div class="chat-file-document">${icon('file')}<span>${item.mediaType==='application/pdf'?t('PDF-Dokument'):t('Dateianhang')}</span></div>`}<div class="chat-file-caption"><strong>${h(item.originalName)}</strong><span>${chatFileSize(item.size)}</span></div><a class="text-link chat-file-download" href="/api/chat/attachments/${item.id}/download">${icon('download')}Herunterladen</a></li>`).join('')}</ul>`;
}

export function bindChatFiles(ctx:any,form:HTMLFormElement,{channelId,active,after}:any){
  const input=form.querySelector<HTMLInputElement>('[data-chat-file-input]'),pick=form.querySelector<HTMLButtonElement>('[data-chat-file-pick]'),send=form.querySelector<HTMLButtonElement>('[data-chat-file-send]'),selection=form.querySelector<HTMLElement>('[data-chat-file-selection]'),status=form.querySelector<HTMLElement>('[data-chat-file-status]'),error=form.querySelector<HTMLElement>('[data-chat-file-error]'),draft=form.querySelector<HTMLInputElement>('[name=chatAttachmentDraft]');
  let retry=false;
  observeForm(form);
  const flow=createChatFileFlow({maxMb:ctx.config?.uploadMaxMb,active,upload:(file:File)=>ctx.api(`/api/chat/channels/${channelId}/attachments`,{method:'POST',file}),onChange:paint,onUploaded:after});
  function paint(){
    if(!active())return;
    draft.value=flow.files.map(entry=>entry.id).join(',');refreshFormState(form);
    selection.hidden=!flow.files.length;selection.innerHTML=flow.files.map(entry=>html`<li><span class="chat-selected-file"><strong>${h(entry.file.name)}</strong><small>${chatFileSize(entry.file.size)}</small></span><button class="icon-btn" type="button" data-chat-file-remove="${entry.id}" aria-label="Datei entfernen" title="${h(entry.file.name)}" ${flow.isSending(entry.id)?'disabled':''}>${icon('close')}</button></li>`).join('');
    selection.querySelectorAll<HTMLButtonElement>('[data-chat-file-remove]').forEach(button=>button.onclick=()=>flow.remove(Number(button.dataset.chatFileRemove)));
    send.hidden=!flow.files.length;send.disabled=flow.busy;send.setAttribute('aria-busy',String(flow.busy));
    send.innerHTML=html`${icon(retry?'refresh':'upload')}${retry?t('Erneut versuchen'):t('Dateien senden')}`;
    if(flow.progress){setText(status,t`Datei ${flow.progress.index} von ${flow.progress.total} wird gesendet: ${flow.progress.name}`);status.hidden=false;}
  }
  function fail(err:any){if(active()){setText(error,apiError(err.message));error.hidden=false;}}
  pick.onclick=()=>input.click();
  input.addEventListener('change',()=>{
    if(!active())return;error.hidden=true;
    try{flow.select([...input.files]);}catch(err){fail(err);}finally{input.value='';}
  });
  send.onclick=async()=>{
    if(flow.busy||!active())return;retry=false;error.hidden=true;
    try{const uploaded=await flow.send();if(active()){setText(status,t`${uploaded.length} Datei(en) gesendet.`);status.hidden=false;}}
    catch(err){if(active()){retry=true;fail(err);setText(status,t('Die noch ausgewählten Dateien kannst du erneut senden.'));status.hidden=false;}}
    finally{paint();}
  };
  return {flow,resetTextBaseline(){
    const pending=draft.value;draft.value='';markForm(form,false);draft.value=pending;refreshFormState(form);
  }};
}
