import {html,locale,setText,t,apiError} from './i18n.js';
import {h,icon,openDialog} from './forms.js';
const activeStates=['queued','downloading','validating','backingUp','installing','restarting','rollingBack'];
const labels={idle:t('Bereit'),queued:t('Update angenommen'),downloading:t('Release wird heruntergeladen'),validating:t('Paket wird geprüft'),backingUp:t('Daten werden gesichert'),installing:t('Neue Version wird aktiviert'),restarting:t('Server wird neu gestartet'),rollingBack:t('Bisheriger Stand wird wiederhergestellt'),complete:t('Update abgeschlossen'),failed:t('Update fehlgeschlagen')};
export function createUpdateFlow(api:any){
    let busy=false,accepted=false,jobId:string|null=null;
    return {get busy(){return busy;},get accepted(){return accepted;},
        observe(status:any){
            if(accepted&&status?.available!==false&&status?.id===jobId&&['complete','failed'].includes(status.state)){
                busy=false;accepted=false;jobId=null;
            }
        },
        async start(input:any){
            if(busy||accepted)throw Error(t('Ein Update läuft bereits.'));
            if(input.confirmed!==true)throw Error(t('Update bitte ausdrücklich bestätigen.'));
            busy=true;
            try{const result=await api('/api/admin/updater/start',{method:'POST',body:input});accepted=result.accepted===true;jobId=accepted?result.id:null;return result;}
            finally{if(!accepted)busy=false;}
        }
    };
}
export function updaterView(status:any,release:any,pending=false){
    if(!status?.available)return html`<div class="settings-notice">${icon('info')}<div><strong>Linuxinstallation erforderlich</strong><p>${h(status?.message?apiError(status.message):t('Updaterstatus wird geladen …'))}</p></div></div><p class="muted">Für eine bestehende Linuxinstallation das Installskript ab Version 3.2.0 einmal ausführen. Es richtet den separaten Updaterdienst ein.</p>`;
    const busy=pending||activeStates.includes(status.state),allowed=!busy&&!status.recoveryRequired&&release?.status==='updateAvailable';
    return html`${status.state!=='idle'?html`<div class="settings-notice${status.state==='failed'?' pending':''}">${icon(status.state==='complete'?'check':'info')}<div><strong>${h(labels[status.state]||t('Updateauftrag'))}</strong><p>${h(status.message?apiError(status.message):t`Version ${status.version||'—'} · Änderungen sind während des Updates gesperrt.`)}</p>${status.finishedAt?html`<p>${h(new Date(status.finishedAt).toLocaleString(locale()))}</p>`:''}</div></div>`:''}
    <div class="updater-action"><div><strong>${busy?t('Update läuft'):release?.status==='updateAvailable'?t`Version ${h(release.latestVersion)} installieren`:t('Keine neuere Version ausgewählt')}</strong><p class="muted">${busy?t('Der Dienst startet nach Sicherung und Installation neu. Anschließend erneut anmelden.'):allowed?t('Der Server prüft das Release vor der Installation erneut.'):t('Prüfe über „Jetzt prüfen“, ob ein neueres stabiles Release verfügbar ist.')}</p></div><button class="btn primary" id="updater-start" ${allowed?'':'disabled'}>${icon('download')}Update installieren …</button></div>`;
}
export async function waitForUpdate({fetcher=fetch,onProgress=(_value:any)=>{},timeout=240000,jobId,now=Date.now,pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))}:{fetcher?:typeof fetch;onProgress?:(value:any)=>void;timeout?:number;jobId?:string;now?:()=>number;pause?:(ms:number)=>Promise<any>}={}){
    const end=now()+timeout;
    while(now()<end){
        try{
            const response=await fetcher('/api/session',{cache:'no-store',signal:AbortSignal.timeout(4000)});
            if(response.ok){const session=await response.json();if(!session.unlocked)return {relogin:true};const job=await fetcher('/api/admin/updater',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(job.status===401||job.status===403)return {relogin:true};if(job.ok){const state=await job.json();if(!jobId||state.id===jobId){onProgress(state);if(['complete','failed'].includes(state.state))return state;}}}
        }catch{}
        await pause(1500);
    }
    throw Error(t('Der Server ist noch nicht wieder erreichbar. Seite später erneut laden und den Updaterstatus prüfen.'));
}
export function renderInAppUpdater(){return html`<section class="panel settings-card" id="in-app-updater"><h2>Direkt im Adminbereich aktualisieren</h2><p>Das Linuxpaket wird geprüft, der aktuelle Datenbestand gesichert und der Dienst mit der neuen Version gestartet. Bei einem Startfehler wird der bisherige Stand wiederhergestellt.</p><div id="updater-status" data-view-loading="settings" aria-live="polite"><p class="muted">Updaterstatus wird geladen …</p></div></section>`;}
export function bindInAppUpdater(ctx:any,root:any){
    const section=root.querySelector('#in-app-updater'),target=section?.querySelector('#updater-status');if(!target)return {setRelease:(_release:any)=>{}};
    let status:any=null,release:any=null,timer:any;const flow=createUpdateFlow(ctx.api),connected=()=>section.isConnected&&ctx.isAdmin&&root.querySelector('#in-app-updater')===section;
    function render(){if(!connected())return;target.innerHTML=updaterView(status,release,flow.busy);target.querySelector('#updater-start')?.addEventListener('click',confirm);}
    function scheduleLoad(){clearTimeout(timer);timer=setTimeout(()=>{if(connected())void load();},2000);}
    async function load(){try{const result=await ctx.api('/api/admin/updater');if(!connected())return;status=result;flow.observe(result);render();if(activeStates.includes(result.state)||flow.accepted)scheduleLoad();}catch(error){if(connected()){status={available:false,message:error.message};render();if(flow.accepted)scheduleLoad();}}}
    function confirm(){
        if(flow.busy||release?.status!=='updateAvailable'||!status?.available||activeStates.includes(status.state)||status.recoveryRequired)return;
        const version=release.latestVersion,dialog=openDialog({title:t`Version ${version} installieren?`,subtitle:t('Kurze Unterbrechung mit automatischer Sicherung und Neustart.'),body:html`<form class="action-form" data-form-mode="action"><div class="dialog-body"><p class="settings-message">Der Server installiert das neueste stabile Release von KaterBeratung/retourenboard. Während des Updates sind Änderungen gesperrt. Konten, Anhänge und Einstellungen bleiben erhalten. Nach dem Neustart musst du dich erneut anmelden.</p><label class="field"><span>Aktuelles Passwort</span><input type="password" name="password" autocomplete="current-password" required></label><label class="field"><span>2FA-Code oder Recoverycode</span><input name="factor" autocomplete="one-time-code"><small>Nur bei aktiver Zwei-Faktor-Authentifizierung erforderlich.</small></label><label class="checkbox-field confirmation-field"><input type="checkbox" name="confirmed" required><span>Ich bestätige die Installation von Version ${h(version)}.</span></label><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">Jetzt installieren</button></div></form>`});
        const form=dialog.querySelector('form'),error=form.querySelector('.form-error'),closeButton=dialog.querySelector('.dialog-close'),cancel=dialog.oncancel,click=dialog.onclick;
        form.onsubmit=async(event:any)=>{
            event.preventDefault();if(flow.busy)return;const data=new FormData(form);error.hidden=true;form.querySelectorAll('input,button').forEach((node:any)=>node.disabled=true);closeButton.disabled=true;dialog.oncancel=(e:any)=>e.preventDefault();dialog.onclick=null;
            try{
                const job=await flow.start({version,password:data.get('password'),factor:data.get('factor'),confirmed:data.get('confirmed')==='on'});clearTimeout(timer);
                if(dialog.querySelector('form')!==form)return;
                form.innerHTML=html('<div class="dialog-body"><p class="restore-progress" role="status"><span class="spinner"></span><span id="update-progress">Update wird vorbereitet …</span></p><p class="muted">Bitte warten. Der Server kann während des Neustarts kurz nicht erreichbar sein.</p></div>');
                const result=await waitForUpdate({jobId:job.id,onProgress:value=>{flow.observe(value);if(dialog.querySelector('form')===form){const node=form.querySelector('#update-progress');if(node)setText(node,labels[value.state]||t('Update läuft …'));}}});
                if(result.relogin){location.replace('/admin#updates');return;}if(dialog.querySelector('form')!==form)return;dialog.close();status=result;flow.observe(result);render();await ctx.reload();
            }catch(err){
                if(dialog.querySelector('form')!==form)return;
                if(flow.accepted){form.innerHTML=html`<div class="dialog-body"><p class="form-error" role="alert">${h(err.message)}</p><a class="btn secondary" href="/admin#updates">Status erneut öffnen</a></div>`;closeButton.disabled=false;dialog.oncancel=cancel;dialog.onclick=click;void load();}
                else{setText(error,apiError(err.message));error.hidden=false;form.querySelectorAll('input,button').forEach((node:any)=>node.disabled=false);closeButton.disabled=false;dialog.oncancel=cancel;dialog.onclick=click;}
            }
        };
    }
    void load();return {setRelease(value:any){release=value;render();}};
}
