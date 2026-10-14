import {html,t,locale,initLanguage,apiError} from './i18n.js';
import {openLogin} from './login.js';
import {h} from './ui.js';
import {loginPathFor,returnPathAfterLogin} from '../shared/auth-navigation.js';
initLanguage();

// The public entry point deliberately depends only on authentication UI.
// Application modules are requested with the newly established session cookie.
export async function startLoginEntry({
    request = fetch,
    loadApp = () => import('./app.js'),
    restart = () => location.reload(),
    showLogin = openLogin,
    page = document.querySelector<HTMLElement>('#auth-page'),
    isLoginPage = typeof document!=='undefined'&&document.body?.dataset.page==='login',
    readLocation = () => typeof location==='undefined'?'http://localhost/':location.href,
    redirect = (url:string) => location.replace(url)
}: any = {}) {
    let session: any = {unlocked:false,setupRequired:false,version:''};
    let generation = 0;
    let loading: Promise<any> | null = null;
    let failedImport = false;
    let leaving = false;
    const go=async(url:string)=>{if(leaving)return;leaving=true;await redirect(url);};
    const ctx: any = {
        get session() {return session;},
        get unlocked() {return Boolean(session.unlocked);},
        get authGeneration() {return generation;},
        invalidateAuthFlow() {
            generation++;
            const dialog = typeof document === 'undefined' ? null : document.querySelector<HTMLDialogElement>('#dialog');
            if(dialog?.open)dialog.close();
            dialog?.replaceChildren();
            if(dialog){dialog.onclick=null;dialog.oncancel=null;}
        },
        applySession(next) {
            if(JSON.stringify([session.unlocked,session.user?.id,session.csrfToken]) !== JSON.stringify([next.unlocked,next.user?.id,next.csrfToken]))ctx.invalidateAuthFlow();
            session=next;
        },
        async api(path,options: any = {}) {
            const current=generation;
            const response=await request(path,{
                method:options.method??'GET',credentials:'same-origin',cache:'no-store',
                headers:{'Content-Type':'application/json',...(session.csrfToken?{'X-CSRF-Token':session.csrfToken}:{})},
                ...(options.body===undefined?{}:{body:JSON.stringify(options.body)})
            });
            const data=await response.json();
            if(current!==generation)throw Object.assign(new Error(t('Deine Anmeldung hat sich geändert. Bitte erneut versuchen.')),{status:409,stale:true});
            if(!response.ok)throw Object.assign(new Error(apiError(data.error??'Anfrage fehlgeschlagen.')),{status:response.status});
            return data;
        },
        async reload() {
            if(leaving)return;
            try {
                ctx.applySession(await ctx.api('/api/session'));
                if(!ctx.unlocked){
                    if(isLoginPage)showLogin(ctx);
                    else {const url=new URL(readLocation());await go(loginPathFor(url.pathname+url.search+url.hash));}
                    return;
                }
                if(isLoginPage){await go(returnPathAfterLogin(readLocation()));return;}
                // Protected modules are loaded only inside the application document.
                loading??=Promise.resolve().then(loadApp).catch(error=>{loading=null;failedImport=true;throw error;});
                await loading;
            } catch(error) {
                if(error.stale)return;
                page.innerHTML=html`<section class="auth-card"><header class="auth-header"><h1>Verbindung fehlgeschlagen</h1><p>${h(error.message)}</p></header><div class="dialog-body"><button type="button" class="btn primary" id="auth-retry">Erneut versuchen</button></div></section>`;
                page.querySelector('#auth-retry').onclick=()=>failedImport?restart():void ctx.reload();
            }
        },
        // The application owns notifications after the handoff.
        toast() {}
    };
    await ctx.reload();
    return ctx;
}

if(typeof document!=='undefined' && document.body?.dataset.ui==='board')void startLoginEntry();
