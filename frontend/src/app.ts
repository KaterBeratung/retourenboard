import {serialKey} from '../shared/serial-number.js';
import {updateMarkup} from './ui.js';
import {renderDisposals,bindDisposals} from './disposals.js';
import {html,t,locale,addTranslations,setText,formatDate,apiError} from './i18n.js';
import {masterName,masterValue,money,returnTiming,returnTimestamp,workflowStatuses,renderReturnWorkflow} from './inventory-display.js';
import {bindCurrencyControl} from './currency-control.js';
import {english} from './i18n-catalog.js';
import { parseDesignRoute, internalNavigationHash, internalNavigationUrl, createLocationChangeListener, matchesReturnScope, bindMobileNavigation, bindHeaderMenu, preserveListScroll, inventoryFilterOptions, createDebouncedTask, inventoryChanged, readWhenIdle, createNavigationLifecycle, createHashHistory } from './design.js';
import {createAreaNavigation,renderAreaSwitcher} from './sidebar-navigation.js';
import { h, icon, productForm, returnForm, showDetails } from './forms.js';
import {statusForm} from './forms.js';
import {returnQuickActions,productQuickActions,bindQuickActions} from './quick-actions.js';
import {productAvatar} from './product-images.js';
import { openImport, openExport } from './import.js';
import { renderAdmin, bindAdmin,adminSection } from './admin.js';
import {refreshCurrencyRate} from './admin-settings.js';
import {hasPermission,canAdminSection} from '../shared/permissions.js';
import { openAccount } from './accounts.js';
import {renderAccount,bindAccount,applyAccountProfile} from './account.js';
import {refreshNotifications} from './notifications.js';
import {paginate} from './pagination.js';
import {applyAccountAppearance} from './appearance.js';
import {bindUnsavedProtection,canLeaveForms} from './unsaved.js';
import {overdueMarker} from './return-status.js';
import {navigationToolRights} from './navigation-tools.js';
import {renderChat,bindChat} from './chat.js';
import {bindSwitchAnimations} from './switches.js';
import {signOut} from './auth-context.js';
import {createSectionTransition} from './section-transition.js';
import {bindSelectMenus} from './selects.js';
import {loginPathFor} from '../shared/auth-navigation.js';
import {bindActionTooltips,bindResponsiveTables,bindWorkspaceMenuDismissal,mobileActions,loadingSkeleton,prepareLoading} from './presentation.js';
import {WORKSPACE_TRANSLATIONS,openWorkspaceSearch,renderSavedFilters,bindSavedFilters} from './workspace-tools.js';
import {renderTableControls,bindTableControls,applyTablePreferences,readTablePreferences} from './table-preferences.js';
import {renderWorkspaceActions,renderWorkspaceAnalytics,workspaceCalendarDay} from './workspace-insights.js';
import {renderOverviewControls,bindOverviewControls} from './workspace-personalization.js';
import {readInventorySort,sortInventoryRows,sortableHeading,renderMobileSorting,bindInventorySorting} from './table-sort.js';
import {closeRecordMenus} from './record-action-menu.js';
import {renderScanIntake,bindScanIntake} from './scan-intake.js';
import {openScanner,stopScanner} from './scanner-loading.js';
import {readWorkspaceFilter,filterRoute,createReturnSelection,selectionToolbar,openBulkStatus} from './workflow-actions.js';
addTranslations(english);
addTranslations({'DEIN ARBEITSABLAUF':'YOUR WORKFLOW','Häufig verwendete Schritte.':'Frequently used actions.','Offene ansehen':'View open returns','Prüfungen ansehen':'View inspections','Abschlüsse ansehen':'View completed','Produkte öffnen':'Open products'});
addTranslations({'Auf Basis der gespeicherten Retourenwerte':'Based on saved return values'});
addTranslations(WORKSPACE_TRANSLATIONS);
addTranslations({'Verantwortliche Person':'Responsible person','Alle Zuständigkeiten':'All assignees','Ohne Zuständigkeit':'Unassigned','Meine Retouren':'My returns','Zuständigkeit filtern':'Filter by assignee','Nächster Schritt':'Next step','Bestand durchsuchen':'Search inventory','Überfällige Retouren':'Overdue returns','Retoure auswählen:':'Select return:'});
bindSwitchAnimations();
bindSelectMenus();
bindResponsiveTables();
bindWorkspaceMenuDismissal();
const actionTooltips=bindActionTooltips();
const mobileToolbar=document.createElement('div');mobileToolbar.id='mobile-actions';document.querySelector('.app-shell').append(mobileToolbar);
let mobileToolbarMarkup='';
const currentRouteHash=()=>internalNavigationHash(location.href,location.href)??location.hash;
const navigationLifecycle=createNavigationLifecycle(currentRouteHash);
const sidebar=document.querySelector('.sidebar');
sidebar.querySelectorAll(':scope > .nav-label,:scope > nav').forEach(node=>node.remove());
sidebar.querySelector('.shared-note')?.remove();
const sidebarNavigation=document.createElement('div');sidebarNavigation.id='sidebar-navigation';sidebar.querySelector('.brand').after(sidebarNavigation);
const sidebarAreas=document.createElement('div');sidebarAreas.className='sidebar-area-control';sidebarNavigation.before(sidebarAreas);
const areaNavigation=createAreaNavigation();let acceptedAreaRoute='';
document.querySelector<HTMLAnchorElement>('.brand').href='/#overview';
const labels = { overview: t('Übersicht'), returns: t('Retouren'), products: t('Produkte'), admin: t('Adminbereich'),chat:t('Chat'),'scan-intake':t('Scan-Erfassung'),disposals:t('Entsorgung') };
const adminLabels={'data-tools':t('Daten & Werkzeuge'),sso:t('OAuth / OpenID'),masterdata:t('Stammdaten'),users:t('Benutzerkonten'),settings:t('Servereinstellungen'),rules:t('Retourenregeln'),'csv-profiles':t('CSV-Profile'),audit:t('Änderungsverlauf'),backups:t('Sicherungen'),diagnostics:t('Diagnose'),notifications:t('Benachrichtigungen'),updates:t('Version & Updates')};
let navigation: ReturnType<typeof bindMobileNavigation>;
let sectionTransition:ReturnType<typeof createSectionTransition>;
let chatController:ReturnType<typeof bindChat>;
let chatGeneration:number;
let disposalController:ReturnType<typeof bindDisposals>;
let disposalGeneration:number;
const state: any = { scope: '', products: [], returns: [], masterdata: {}, session: { unlocked: false, user: null, csrfToken: null, expiresAt: null, setupRequired: false, version: '' }, view: 'overview', search: '', status: '', category: '', activity: 'active', adminPage: document.body.dataset.page === 'admin' };
const returnSelection=createReturnSelection();
state.assignee='';state.returnAssignees=[];
const currency = (value) => money(value,ctx.config?.currency);
const statusName = value => masterName(state.masterdata,'statuses',value);
const date = (value) => value ? formatDate(value + 'T12:00:00', { day: '2-digit', month: '2-digit', year: 'numeric' },'toLocaleDateString') : '—';
const statuses = () => workflowStatuses(state.masterdata.statuses,state.returns);
const statusClass = (value) => state.masterdata.statuses?.find(s => s.name === value)?.tone || 'neutral';
const badge = (value) => html`<span class="status ${statusClass(value)}"><span></span>${h(statusName(value))}</span>`;
function isInteracting(): boolean {
    const active = document.activeElement;
    return document.querySelector('#dialog').open || document.querySelector<HTMLDetailsElement>('#currency-control')?.open || !!document.querySelector('.header-menu[open],[data-table-settings][open],[data-saved-filters][open],[data-overview-settings][open],[data-record-menu][data-menu-open]') || !!document.querySelector('form[data-dirty=true]') ||
        document.body.classList.contains('nav-open') || !!active?.matches('input,select,textarea') ||
        (!!active?.closest('#content') && !!active?.matches('button,a'));
}
const ctx: any = {
    get products() { return state.products; },
    get returns(){return state.returns;},
    get returnAssignees(){return state.returnAssignees;},
    canFilterMine:true,
    get masterdata() { return state.masterdata; },
    get config(){return state.config?{...state.config,currency:ctx.currencyUI?.snapshot(state.config.currency)??state.config.currency}:state.config;},
    get capabilities(){return state.session.user?.capabilities??{edit:false,delete:false,import:false,export:false};},
    get unlocked() { return state.session.unlocked; },
    get session() { return state.session; },
    get isAccountView(){return state.view==='account';},
    get authGeneration() { return state.authGeneration??0; },
    invalidateAuthFlow() {
        areaNavigation.clear();
        ctx.clearToast?.();ctx.stopScanner?.();state.authGeneration=ctx.authGeneration+1;
        state.inventoryReadRevision=(state.inventoryReadRevision??0)+1;state.inventoryPending=null;
        returnSelection.clear();state.returnAssignees=[];
        const dialog=document.querySelector('#dialog');
        if(dialog.open)dialog.close();
        dialog.replaceChildren();
        dialog.onclick=null;dialog.oncancel=null;
    },
    get isAdmin() { return state.session.user?.role === 'admin'; },
    can(key){return hasPermission(state.session.unlocked?state.session.user:null,key);},
    canAdminSection(section){if(section==='data-tools'){const rights=navigationToolRights(ctx);return rights.import||rights.export;}return canAdminSection(state.session.unlocked?state.session.user:null,section);},
    get hasAdminAccess(){return ctx.isAdmin||['masterdata','csv-profiles','rules','audit','diagnostics','data-tools'].some(section=>ctx.canAdminSection(section));},
    accountSaved(profile){if(applyAccountProfile(state,profile))updateAccess();},
    applySession(session) {
        const previous=state.session;
        if(previous.unlocked&&session.unlocked&&previous.user?.id===session.user?.id&&previous.user?.displayName!==session.user?.displayName)state.inventoryLoaded=false;
        const returnToLogin=!session.unlocked&&(previous.unlocked||!state.authChecked);
        state.authChecked=true;
        const changed=previous.unlocked&&session.unlocked&&previous.user?.role&&JSON.stringify([previous.user.id,previous.user.role,previous.user.permissions,previous.user.capabilities])!==JSON.stringify([session.user?.id,session.user?.role,session.user?.permissions,session.user?.capabilities]);
        const invalidated=Boolean(previous.unlocked)!==Boolean(session.unlocked)||changed||
            (previous.unlocked&&session.unlocked&&(previous.user?.id!==session.user?.id||previous.csrfToken!==session.csrfToken));
        if(invalidated)ctx.invalidateAuthFlow();
        state.session = session;
        if(invalidated&&session.unlocked)areaNavigation.remember(acceptedAreaRoute);
        if (!session.unlocked || (state.adminPage && (!ctx.hasAdminAccess||changed))) {
        state.products = [];
        state.returns = [];
        state.masterdata = {};
        state.inventoryLoaded=false;
        if(!session.unlocked)state.config=undefined;
    }
        state.permissionsChanged=changed;
        updateAccess(); if (!session.unlocked || changed || (state.adminPage && !ctx.hasAdminAccess))render();
        if(returnToLogin)ctx.onSessionLocked?.();
    },
    get csrfToken() { return state.session.csrfToken; },
    async api(path, options: any = {}) {
        const generation=ctx.authGeneration;
        const assertCurrent=()=>{if(generation!==ctx.authGeneration)throw Object.assign(new Error(t('Deine Anmeldung hat sich geändert. Bitte erneut versuchen.')),{status:409,stale:true});};
        const response = await fetch(path, { method: options.method || 'GET', headers: { 'Content-Type': options.file ? 'application/octet-stream' : 'application/json', ...(options.file ? { 'X-File-Name': encodeURIComponent(options.file.name) } : {}), ...(state.session.csrfToken ? { 'X-CSRF-Token': state.session.csrfToken } : {}) }, ...(options.file ? { body: options.file } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
        const data = await response.json();
        assertCurrent();
        if (!response.ok) {
            if ([401,403].includes(response.status)&&!path.startsWith('/api/login')&&!path.startsWith('/api/sso/')&&path!=='/api/setup') {
                const sessionResponse = await fetch('/api/session');
                const session=await sessionResponse.json();assertCurrent();
                ctx.applySession(session);
                if (!ctx.unlocked) loginDialog();
            }
            throw Object.assign(new Error(apiError(data.error || 'Anfrage fehlgeschlagen.')),{status:response.status});
        }
        return data;
    },
    async reload({ quiet = false, sessionChecked = false } = {}) {
        const currentNavigation=navigationLifecycle.checkpoint();
        const revision=state.reloadRevision=(state.reloadRevision??0)+1;
        const latest=()=>revision===state.reloadRevision;
        // A save may close its dialog before this refresh finishes. A new route
        // must fetch current records even if it interrupts the settings read.
        if(!quiet)state.inventoryLoaded=false;
        if (!sessionChecked) {const session=await ctx.api('/api/session');if(!latest())return;ctx.applySession(session);}
        if (!ctx.unlocked) {
            state.inventoryLoaded=false;
            render();
            return;
        }
        const generation=ctx.authGeneration,current=()=>latest()&&generation===ctx.authGeneration;
        // Start independent workspace reads together. Capture failures immediately:
        // a navigation or failed settings request may abandon the inventory result.
        const workspace=!state.adminPage&&!ctx.isAccountView&&state.view!=='chat';
        const inventory=workspace?(quiet?readWhenIdle(()=>ctx.readInventory({fresh:true}),isInteracting):ctx.readInventory({fresh:true}))
            .then(snapshot=>({snapshot,error:undefined}),error=>({snapshot:undefined,error})):null;
        let inventoryRevision=state.inventoryReadRevision;
        const [config,accountPreferences]=await Promise.all([ctx.api('/api/config'),ctx.api('/api/account/preferences')]);
        if(!current())return;
        state.config=config;
        await ctx.currencyUI?.sync(state.config.currency);
        if(!current())return;
        refreshCurrencyRate(document,ctx.config?.currency);
        state.accountPreferences=accountPreferences;applyAccountAppearance(state.accountPreferences);
        void refreshNotifications(ctx);
        const accessChanged=state.permissionsChanged;state.permissionsChanged=false;
        if(!currentNavigation())return;
        if(quiet&&!accessChanged&&(state.adminPage||ctx.isAccountView))return;
        if(ctx.isAccountView){if(!quiet||accessChanged)await render();return;}
        if(state.view==='chat'){updateAccess();if(!quiet||accessChanged)render();return;}
        if (state.adminPage) {
            if (ctx.hasAdminAccess) {
                const masterdata = quiet ? await readWhenIdle(() => ctx.api('/api/masterdata'), isInteracting) : await ctx.api('/api/masterdata');
                if (masterdata === undefined || !ctx.unlocked || !ctx.hasAdminAccess || !currentNavigation() || !current())
                    return;
                state.masterdata = masterdata;
            }
            updateAccess();
            await render();
            return;
        }
        const loaded=await inventory;
        if(!current())return;
        if(loaded?.error)throw loaded.error;
        let snapshot=loaded?.snapshot;
        if(inventoryRevision!==state.inventoryReadRevision){
            if(state.inventoryPending){inventoryRevision=state.inventoryReadRevision;snapshot=await state.inventoryPending;}
            else{
                if(current()&&currentNavigation()&&state.inventoryLoaded&&(!quiet||!isInteracting()))await render();
                return;
            }
        }
        if (snapshot === undefined || !ctx.unlocked || !current() || inventoryRevision!==state.inventoryReadRevision || quiet&&isInteracting())
            return;
        const [products, returns, masterdata,assignees] = snapshot;
        const controlsChanged=JSON.stringify([state.masterdata,state.returnAssignees,inventoryFilterOptions(state.products,state.returns),statuses()])!==JSON.stringify([masterdata,assignees,inventoryFilterOptions(products,returns),workflowStatuses(masterdata.statuses,returns)]);
        const changed = inventoryChanged(state, { products, returns, masterdata }) || state.currencyRendered !== JSON.stringify(ctx.config?.currency);
        state.products = products;
        state.returns = returns;
        state.masterdata = masterdata;
        state.returnAssignees=assignees;
        returnSelection.reconcile(returns.map(item=>item.id));
        state.inventoryLoaded=true;
        updateAccess();
        if(currentNavigation()&&quiet&&state.view==='disposals'&&disposalController?.workspace?.isConnected){await disposalController.refresh();return;}
        if(currentNavigation()&&(!quiet||changed)){
            if(quiet&&!accessChanged&&!controlsChanged&&['products','returns'].includes(state.view)&&document.querySelector('#table-content')){
                refreshRows({preserveScroll:true});
                state.currencyRendered=JSON.stringify(ctx.config?.currency);
            }
            else await render();
        }
        setText(document.querySelector('#sync-time'),t`Aktualisiert ${new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`);
    },
    toast(message, action?:{label:string;onAction:()=>any;durationMs?:number}) {
        const region = document.querySelector('#toast-region');
        setText(region,message);
        if(action){region.removeAttribute('data-rb-i18n-text');region.replaceChildren();const caption=document.createElement('span');setText(caption,message);region.append(caption);}
        if(action){const button=document.createElement('button');button.type='button';button.className='toast-action';setText(button,action.label);const generation=ctx.authGeneration;button.onclick=async()=>{if(button.disabled||generation!==ctx.authGeneration)return;button.disabled=true;clearTimeout(ctx.toastTimer);try{await action.onAction();}catch(error){ctx.toast(apiError(error.message));}finally{if(region.contains(button)){region.classList.remove('visible');region.replaceChildren();}}};region.append(button);}
        region.classList.add('visible');
        clearTimeout(ctx.toastTimer);
        ctx.toastTimer = setTimeout(() => {region.classList.remove('visible');region.querySelector('button')?.remove();}, action?Math.max(1000,Math.min(action.durationMs??12000,12000)):4500);
    },
    async ensureUnlocked(action) {
        try {
            ctx.applySession(await ctx.api('/api/session'));
            if (state.session.unlocked)
                return action();
            loginDialog();
        }
        catch (error) {
            ctx.toast(apiError(error.message));
        }
    },
    async readInventory({fresh=false}={}){
        if(!fresh&&state.inventoryPending)return state.inventoryPending;
        const generation=ctx.authGeneration,revision=state.inventoryReadRevision=(state.inventoryReadRevision??0)+1;
        const pending=Promise.all([ctx.api('/api/products'),ctx.api('/api/returns'),ctx.api('/api/masterdata'),ctx.api('/api/returns/assignees')])
            .then(snapshot=>ctx.unlocked&&generation===ctx.authGeneration&&revision===state.inventoryReadRevision?snapshot:undefined);
        state.inventoryPending=pending;
        try{return await pending;}finally{if(state.inventoryPending===pending)state.inventoryPending=null;}
    },
    async ensureInventory(){
        if(!ctx.unlocked)return;
        const pending=ctx.readInventory(),revision=state.inventoryReadRevision;
        const snapshot=await pending;if(!snapshot||revision!==state.inventoryReadRevision)return;
        const [products,returns,masterdata,assignees]=snapshot;
        Object.assign(state,{products,returns,masterdata,returnAssignees:assignees,inventoryLoaded:true});
        returnSelection.reconcile(returns.map(item=>item.id));
    },
    async poll(){
        if(state.polling||document.visibilityState!=='visible'||!ctx.unlocked&&document.querySelector<HTMLElement>('#auth-page')?.dataset.stage==='mfa')return;
        state.polling=true;
        try{
            ctx.applySession(await ctx.api('/api/session'));
            if(!ctx.unlocked)return;
            if(isInteracting()){await ctx.currencyUI?.refresh();refreshCurrencyRate(document,ctx.config?.currency);return;}
            await ctx.reload({quiet:true,sessionChecked:true});
        }catch{/* Keep current data during a temporary outage. */}
        finally{state.polling=false;}
    },
    async searchDisposals(query){if(!ctx.can('disposalsRead'))return [];const result=await ctx.api('/api/disposals?search='+encodeURIComponent(query));return result.items.map(row=>({kind:'disposals',id:row.disposalNumber,label:row.disposalNumber,subtitle:row.productName+' · '+row.serialNumber}));},
    async openSearchResult(kind,id){
        if(!ctx.unlocked)return;
        if(kind==='disposals'){location.hash='disposals?record='+encodeURIComponent(String(id));return;}
        const hash='#'+kind+'?'+new URLSearchParams({detail:String(id)});
        if(hash===currentRouteHash()){linkedReturn='';openLinkedReturn();}else location.hash=hash;
    }
};
// Dispose application listeners and polling on logout or session expiry.
let leavingForLogin=false;
ctx.onSessionLocked=()=>{if(leavingForLogin)return;leavingForLogin=true;location.replace(loginPathFor(location.pathname+location.search+location.hash));};
window.addEventListener('languagechange',()=>{
    if(state.view==='disposals')void disposalController?.refresh();
    updateAccess();
    const label=ctx.isAccountView?t('Mein Konto'):state.view==='chat'?t('Chat'):state.adminPage?(adminLabels[adminSection(ctx)]??t('Adminbereich')):labels[state.view];
    setText(document.querySelector('#breadcrumb-current'),label);
    document.title=t`${label} · retourenboard.`;
    void refreshNotifications(ctx);
    if(ctx.unlocked&&state.inventoryLoaded&&['products','returns'].includes(state.view)&&document.querySelector('#table-content'))refreshRows();
});
function updateAccess() {
    searchButton.hidden=!ctx.unlocked;sidebarSearch.hidden=!ctx.unlocked;
    const mobileMarkup=mobileActions(ctx,state.view);if(mobileToolbarMarkup!==mobileMarkup){
        const focused=mobileToolbar.contains(document.activeElement)?document.activeElement as HTMLElement:null;
        const href=focused?.getAttribute('href'),id=focused?.id;
        mobileToolbarMarkup=mobileMarkup;mobileToolbar.innerHTML=mobileMarkup;mobileToolbar.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(normalizeLink);
        if(href)Array.from(mobileToolbar.querySelectorAll<HTMLAnchorElement>('a[href]')).find(link=>link.getAttribute('href')===href)?.focus({preventScroll:true});
        else if(id)Array.from(mobileToolbar.querySelectorAll<HTMLElement>('[id]')).find(element=>element.id===id)?.focus({preventScroll:true});
    }
    updateSidebarNavigation();
    ctx.currencyUI?.account(ctx.unlocked?state.session.user?.id??null:null,ctx.authGeneration);
    const unlocked = state.session.unlocked;
    if(!unlocked)document.querySelector('#inbox-button')?.setAttribute('hidden','');
    setText(document.querySelector('#app-version'),state.session.version ? t`Version ${state.session.version}` : '');
    document.body.classList.toggle('auth-screen', !unlocked);
    if (!unlocked) navigation?.close();
    const name = state.session.user?.displayName;
    updateMarkup(document.querySelector('#header-access'),html`${icon(unlocked ? 'user' : 'lock')}<span>${unlocked ? h(name) : state.session.setupRequired ? t('Ersteinrichtung') : t('Anmelden')}</span>`);
    document.querySelector('#header-access').classList.toggle('unlocked', unlocked);
    const signout=document.querySelector<HTMLButtonElement>('[data-header-signout]');if(signout)signout.hidden=!unlocked;
    updateMarkup(document.querySelector('#access-button'),html`${icon(unlocked ? 'user' : 'lock')}<span><strong>${unlocked ? h(name) : t('Anmeldung erforderlich')}</strong><small>${unlocked ? (ctx.isAdmin ? t('Administrator') : state.session.user?.role==='viewer'?t('Nur lesen'):t('Mitarbeiter')) + t(' · Mein Konto') : state.session.setupRequired ? t('Ersten Administrator anlegen') : t('Mit persönlichem Konto anmelden')}</small></span>${icon('chevron')}`);
    const count = document.querySelector('#nav-count');
    if (count) {
        const total=String(state.returns.filter(r => !r.isClosed).length);if(count.textContent!==total)count.textContent=total;
        count.hidden = !unlocked||state.view==='chat'||!state.inventoryLoaded;
    }
    const adminLink = document.querySelector('#admin-link');
    if (adminLink)
        adminLink.hidden = !ctx.hasAdminAccess;
    document.querySelectorAll('[data-admin-nav]').forEach(link=>link.hidden=!ctx.canAdminSection(link.dataset.adminNav));
    document.querySelectorAll('.sidebar nav').forEach(nav=>{if(!nav.querySelector('[data-admin-nav]'))return;const visible=[...nav.querySelectorAll<HTMLElement>('[data-admin-nav]')].some(link=>!link.hidden);nav.hidden=!visible;const heading=nav.previousElementSibling as HTMLElement;if(heading?.classList.contains('admin-group-label'))heading.hidden=!visible;});
    document.querySelectorAll<HTMLElement>('[data-nav],[data-admin-nav]').forEach(link=>{const active=!ctx.isAccountView&&(link.dataset.adminNav?state.adminPage&&link.dataset.adminNav===adminSection(ctx):link.dataset.nav===state.view);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.querySelectorAll<HTMLElement>('[data-disposal-nav]').forEach(link=>link.hidden=!unlocked||!ctx.can('disposalsRead'));
    document.querySelectorAll<HTMLElement>('[data-scan-intake-nav]').forEach(link=>link.hidden=!unlocked||!ctx.can('returnsCreate'));
    document.querySelectorAll<HTMLElement>('[data-chat-link]').forEach(link=>{const active=state.view==='chat';link.hidden=!unlocked||!ctx.can('chatRead');link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
}
let sidebarMode='';
function updateAreaSwitcher(){
    if(updateMarkup(sidebarAreas,renderAreaSwitcher({adminPage:state.adminPage,canAdminAccess:ctx.unlocked&&ctx.hasAdminAccess,...areaNavigation.destinations(section=>ctx.canAdminSection(section))}))){
        sidebarAreas.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(normalizeLink);
    }
}
function updateSidebarNavigation(){
    updateAreaSwitcher();
    const mode=String(state.adminPage)+':'+locale();if(mode===sidebarMode)return;sidebarMode=mode;
    const workspace=state.adminPage?'':html`<nav aria-label="${t('Hauptnavigation')}"><a href="#overview" data-nav="overview">${icon('dashboard')}${t('Übersicht')}</a><a href="#returns" data-nav="returns">${icon('return')}${t('Retouren')}<span id="nav-count" class="nav-count">0</span></a><a href="#products" data-nav="products">${icon('box')}${t('Produkte')}</a><a href="#disposals" data-nav="disposals" data-disposal-nav hidden>${icon('trash')}${t('Entsorgung')}</a><a href="#scan-intake" data-nav="scan-intake" data-scan-intake-nav hidden>${icon('barcode')}${t('Scan-Erfassung')}</a><a href="#chat" data-chat-link hidden>${icon('chat')}Chat</a></nav>`;
    const groups=[['Bestandsverwaltung',[['masterdata','box'],['rules','return'],['data-tools','settings'],['csv-profiles','upload'],['audit','clock']]],['Konten & Nachrichten',[['users','unlock'],['sso','lock'],['notifications','info']]],['Serverbetrieb',[['backups','download'],['updates','arrow'],['diagnostics','info'],['settings','settings']]]] as const;
    sidebarNavigation.innerHTML=(state.adminPage?groups.map(([label,items])=>html`<div class="nav-label admin-group-label">${t(label)}</div><nav aria-label="${t(label)}">${items.map(([section,shape])=>html`<a href="#admin?section=${section}" data-admin-nav="${section}">${icon(shape)}${adminLabels[section]}</a>`).join('')}</nav>`).join(''):html`<div class="nav-label">ARBEITSBEREICH</div>`)+workspace;
    sidebarNavigation.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(normalizeLink);
    document.querySelector('.breadcrumb').innerHTML=html`<span>${state.adminPage?t('Administration'):t('Arbeitsbereich')}</span><span>/</span><strong id="breadcrumb-current"></strong>`;
}
ctx.clearToast=()=>{clearTimeout(ctx.toastTimer);const region=document.querySelector('#toast-region');region.classList.remove('visible');region.replaceChildren();};
ctx.stopScanner=stopScanner;
const searchButton=document.createElement('button');searchButton.type='button';searchButton.id='workspace-search-button';searchButton.className='workspace-search-trigger';searchButton.innerHTML=html`${icon('search')}<span>Bestand durchsuchen</span><kbd aria-hidden="true">Ctrl K</kbd>`;searchButton.hidden=true;
document.querySelector('.topbar-right').prepend(searchButton);
const sidebarSearch=searchButton.cloneNode(true) as HTMLButtonElement;sidebarSearch.id='sidebar-search-button';sidebarSearch.classList.add('sidebar-search');sidebarNavigation.before(sidebarSearch);
async function searchWorkspace(){if(!ctx.unlocked)return;const dialog=document.querySelector('#dialog');if(dialog.open&&!await canLeaveForms(dialog))return;navigation?.close();openWorkspaceSearch(ctx);}
searchButton.onclick=()=>void searchWorkspace();sidebarSearch.onclick=()=>void searchWorkspace();
document.addEventListener('keydown',event=>{if(ctx.unlocked&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();void searchWorkspace();}});
function loginDialog() {
    ctx.onSessionLocked();
}
async function accessClick() {
    try {
        ctx.applySession(await ctx.api('/api/session'));
        if (ctx.unlocked)
            openAccount(ctx);
        else
            loginDialog();
    }
    catch (error) {
        ctx.toast(apiError(error.message));
    }
}
const createButton = (kind, label) => ctx.can(kind+'Create')?html`<button class="btn primary" data-create="${kind}">${icon('plus')}${label}</button>`:'';
const delayedSearch = createDebouncedTask(() => {
    if (ctx.unlocked && ['returns', 'products'].includes(state.view) && document.querySelector('#table-content')) refreshRows();
});
function render(){
    closeRecordMenus();
    actionTooltips.hide();
    const key=!ctx.unlocked?'locked':ctx.isAccountView?'account':state.adminPage?'admin:'+adminSection(ctx):state.view;
    return sectionTransition.run(key,async()=>{await renderContent();normalizeInternalLinks();}).catch(error=>ctx.toast(apiError(error.message)));
}
function renderContent() {
    state.currencyRendered = JSON.stringify(ctx.config?.currency);
    delayedSearch.cancel();
    if(ctx.isAccountView&&ctx.unlocked){
        document.title=t('Mein Konto · retourenboard.');setText(document.querySelector('#breadcrumb-current'),t('Mein Konto'));
        document.querySelectorAll('[data-nav],[data-admin-nav]').forEach(el=>{el.classList.remove('active');el.removeAttribute('aria-current');});
        const backHref=state.accountReturnHash??(state.adminPage?'#admin':'/#overview');
        document.querySelector('#content').innerHTML=renderAccount(internalNavigationUrl(backHref,location.href)??backHref,state.accountReturnHash?t('Zurück'):t('Zum Retourenboard'));
        return bindAccount(ctx,document.querySelector('#content'));
    }
    if(state.view==='chat'&&ctx.unlocked){
        document.title=t('Chat · retourenboard.');setText(document.querySelector('#breadcrumb-current'),t('Chat'));
        const root=document.querySelector<HTMLElement>('#content');
        if(chatController?.workspace.isConnected&&chatGeneration===ctx.authGeneration)return chatController.navigate(location.hash);
        root.innerHTML=renderChat(ctx);chatController=bindChat(ctx,root);chatGeneration=ctx.authGeneration;return;
    }
    if(state.view==='disposals'&&ctx.unlocked){
        document.title=t('Entsorgung')+' · retourenboard.';setText(document.querySelector('#breadcrumb-current'),t('Entsorgung'));
        const root=document.querySelector<HTMLElement>('#content');if(disposalController?.workspace?.isConnected&&disposalGeneration===ctx.authGeneration)return disposalController.navigate(location.hash);
        root.innerHTML=renderDisposals(ctx);disposalGeneration=ctx.authGeneration;disposalController=bindDisposals(ctx,root,{openScanner});return;
    }
    if(state.view==='scan-intake'&&ctx.unlocked){
        document.title=t('Scan-Erfassung')+' · retourenboard.';setText(document.querySelector('#breadcrumb-current'),t('Scan-Erfassung'));
        const root=document.querySelector<HTMLElement>('#content');root.innerHTML=renderScanIntake(ctx);return bindScanIntake(ctx,root,{openScanner,showReturn:row=>showDetails(ctx,'returns',row)});
    }
    document.title = t`${labels[state.view]} · retourenboard.`;
    setText(document.querySelector('#breadcrumb-current'),labels[state.view]);
    document.querySelectorAll('[data-nav]').forEach(el => { el.classList.toggle('active', el.dataset.nav === state.view); if (el.dataset.nav === state.view)
        el.setAttribute('aria-current', 'page');
    else
        el.removeAttribute('aria-current'); });
    document.querySelectorAll('[data-admin-nav]').forEach(el => { const active = el.dataset.adminNav === adminSection(ctx); el.classList.toggle('active', active); if (active)
        el.setAttribute('aria-current', 'page');
    else
        el.removeAttribute('aria-current'); });
    if (state.adminPage)
        setText(document.querySelector('#breadcrumb-current'),adminLabels[adminSection(ctx)]??t('Adminbereich'));
    if (state.adminPage)
        document.title = t`${document.querySelector('#breadcrumb-current').textContent} · retourenboard.`;
    if (!ctx.unlocked) {
        document.title = t`${state.session.setupRequired ? t('Ersteinrichtung') : t('Anmelden')} · retourenboard.`;
        document.querySelector('#content').replaceChildren();
        const dialog = document.querySelector('#dialog');
        if (dialog.open)
            dialog.close();
        const page = document.querySelector('#auth-page');
        if (!page.querySelector('#login-form') || page.dataset.stage !== (state.session.setupRequired ? 'setup' : 'login'))
            loginDialog();
        return;
    }
    document.querySelector('#content').innerHTML = state.view === 'admin' ? '<div data-admin-view>'+renderAdmin(ctx)+'</div>' : (state.view === 'overview' ? overview() : listPage());
    prepareLoading(document.querySelector<HTMLElement>('#content'));
    const ready=bindContent();
    openLinkedReturn();
    return ready;
}
let linkedReturn='';
function openLinkedReturn(){
    const value=new URLSearchParams(location.hash.split('?')[1]??'').get('detail');
    if(!value){linkedReturn='';return;}
    const prepare=new URLSearchParams(location.hash.split('?')[1]??'').get('prepareCompletion')==='1';
    const key=state.view+':'+value+':'+prepare;
    if(!['returns','products'].includes(state.view)||!ctx.unlocked||!state.inventoryLoaded||document.querySelector('#dialog').open||linkedReturn===key||!/^\d+$/.test(value))return;
    linkedReturn=key;const view=state.view,generation=ctx.authGeneration,hash=location.hash,owner=document.querySelector('#dialog').firstElementChild;
    void ctx.api(`/api/${view}/${Number(value)}`).then(item=>{
        if(generation!==ctx.authGeneration||!ctx.unlocked||location.hash!==hash||state.view!==view||document.querySelector('#dialog').open||document.querySelector('#dialog').firstElementChild!==owner)return;
        if(prepare&&view==='returns'&&!item.isClosed&&ctx.can('returnsEdit')&&ctx.can('returnsStatus')){const status=state.masterdata.statuses.find(row=>row.active&&row.isClosed),mapped=(ctx.config?.rules?.disposalResolutionIds??[]).filter(id=>state.masterdata.resolutions.some(row=>row.id===id&&row.active));returnForm(ctx,{...item,...(status?{statusId:status.id}:{}),...(mapped.length===1?{resolutionId:mapped[0]}:{})});}else showDetails(ctx,view,item);
    }).catch(error=>{if(generation===ctx.authGeneration&&location.hash===hash)ctx.toast(apiError(error.message));});
}
function overview() {
    const open = state.returns.filter(r => !r.isClosed), checking = state.returns.filter(r => r.statusTone === 'checking'), done = state.returns.filter(r => r.isClosed), active = state.products.filter(p => p.active);
    const cards = [['open',t('Offene Retouren'), open.length, 'clock', t('Offene ansehen'), 'orange', '#returns?scope=open'], ['checking',t('In Prüfung'), checking.length, 'search', t('Prüfungen ansehen'), 'blue', '#returns?scope=checking'], ['closed',t('Abgeschlossen'), done.length, 'check', t('Abschlüsse ansehen'), 'green', '#returns?scope=closed'], ['products',t('Aktive Produkte'), active.length, 'box', t('Produkte öffnen'), 'neutral', '#products?scope=active']];
    return html`<div class="workspace-overview"><div class="page-heading"><div><div class="eyebrow">DEIN RETOUREN-ARBEITSPLATZ</div><h1>Alles im Blick<span class="heading-dot">.</span></h1><p>Produkte verwalten. Rückläufer erfassen. Gemeinsam weiterkommen.</p></div><div class="heading-actions">${renderOverviewControls()}<button class="btn secondary" type="button" data-scan-search>${icon('barcode')}Scannen</button>${createButton('returns', t('Neue Retoure'))}</div></div>
  <div class="kpi-grid" data-overview-group="kpis">${cards.map(([key,label, num, ic, desc, color, href]) => html`<a class="kpi kpi-link" data-overview-card="${key}" data-overview-empty="${num===0}" href="${href}" aria-label="${label}: ${num} anzeigen"><div class="kpi-top"><span>${label}</span><span class="kpi-icon ${color}">${icon(ic)}</span></div><strong>${num}</strong><small>${desc}${icon('arrow')}</small></a>`).join('')}</div>
  ${!state.products.length ? html`<section class="onboarding"><div class="onboarding-art">${icon('box')}<span>${icon('check')}</span></div><div><span class="eyebrow">DEIN ERSTER SCHRITT</span><h2>Ein guter Überblick beginnt mit einem Produkt.</h2><p>Lege deinen Bestand an oder importiere bestehende Produktdaten als CSV.</p></div><div class="onboarding-buttons">${createButton('products', t('Produkt anlegen'))}<button class="btn secondary" data-import="products">${icon('upload')}CSV importieren</button></div></section>` : ''}
  ${renderWorkspaceActions(ctx)}
  <div class="dashboard-grid" data-overview-group="dashboard"><section class="panel recent-panel" data-overview-card="recent" data-overview-empty="${!state.returns.length}"><div class="panel-heading"><div><h2>Aktuelle Retouren <span class="count-pill">${state.returns.length}</span></h2><p>Die zuletzt erfassten Rückläufer.</p></div><a class="text-link" href="#returns">Alle ansehen ${icon('arrow')}</a></div>${returnTable(state.returns.slice(0, 5), true)}</section>
  <section class="panel workflow" data-overview-card="workflow" data-overview-empty="${!state.returns.length}"><div class="panel-heading"><div><span class="eyebrow">DEIN ARBEITSABLAUF</span><h2>Schnellaktionen</h2><p>Häufig verwendete Schritte.</p></div></div><div class="dashboard-shortcuts">${createButton('returns',t('Neue Retoure'))}${ctx.can('returnsCreate')?html`<a class="btn secondary" href="#scan-intake">${icon('barcode')}Scan-Erfassung</a>`:''}<a class="btn secondary" href="#products">${icon('box')}Produkte</a></div><div class="workflow-subheading"><h3>Dein Retourenprozess</h3></div><div class="workflow-stages">${renderReturnWorkflow(state.masterdata.statuses??[],state.returns)}</div><div class="workflow-footer"><span>Warenwert offener Retouren</span><strong>${currency(open.reduce((sum, r) => sum + r.quantity * r.priceCents, 0))}</strong><small>Auf Basis der gespeicherten Retourenwerte</small></div></section></div>
  ${renderWorkspaceAnalytics(ctx)}
  <div class="overview-actions"><button class="text-link" data-unlock>${state.session.unlocked ? t('Mein Konto') : t('Anmelden')} ${icon('arrow')}</button></div></div>`;
}
function listPage() {
    const products = state.view === 'products', kind = state.view;
    const counts=products?null:returnStatusCounts();
    const csvTools=[ctx.can(kind+'Import')?t('Import'):'',ctx.can(kind+'Export')?t('Export'):''].filter(Boolean);
    const csvHint=csvTools.length===2?t('CSV-Import und -Export verfügbar'):csvTools.length?ctx.can(kind+'Import')?t('CSV-Import verfügbar'):t('CSV-Export verfügbar'):t('Bestand ansehen');
    const {categories,reasons}=inventoryFilterOptions(state.products,state.returns);
    const scopeLabels = { open: t('Offene Retouren'), checking: t('In Prüfung'), closed: t('Abgeschlossen'),overdue:t('Überfällige Retouren'),today:t('Heute fällig') };
    const scopeHint = state.scope && !products ? html`<div class="scope-hint"><span>${icon('filter')}Ansicht: <strong>${scopeLabels[state.scope]}</strong></span><button class="text-link" id="clear-scope">Alle Retouren anzeigen ${icon('close')}</button></div>` : '';
    return html`<div class="page-heading"><div><div class="eyebrow">GEMEINSAMER BESTAND</div><h1>${labels[kind]}<span class="heading-dot">.</span></h1><p>${products ? t('Alle Produktdaten an einem Ort – von der EAN bis zum Lieferanten.') : t('Jeder Rückläufer mit Seriennummer, Grund und Bearbeitungsstatus.')}</p></div><div class="heading-actions"><button class="btn secondary" data-import="${kind}">${icon('upload')}CSV importieren</button>${createButton(kind, products ? t('Neues Produkt') : t('Neue Retoure'))}</div></div>
  <div id="workspace-view-tools" class="workspace-view-tools"><div>${renderTableControls(ctx,kind)}<button class="btn secondary small" type="button" data-scan-search>${icon('barcode')}Scannen</button></div>${renderSavedFilters(ctx,currentFilter())}</div>${scopeHint}
  ${!products ? html`<div class="status-tabs" role="group" aria-label="Retourenstatus filtern"><button data-status="" class="${!state.status && !state.scope ? 'selected' : ''}">Alle Retouren <span data-status-count="">${counts.total}</span></button>${statuses().map(({ name: s }) => html`<button data-status="${h(s)}" class="${state.status === s ? 'selected' : ''}">${h(statusName(s))}<span data-status-count="${h(s)}">${counts.byStatus.get(s)??0}</span></button>`).join('')}</div>` : ''}
  <section class="panel list-panel"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="${products ? t('Produkt, EAN oder Lieferant suchen …') : t('Retoure, Seriennummer, Sendungsnummer oder Kundenreferenz suchen …')}" aria-label="${products ? t('Produkte') : t('Retouren')} suchen" value="${h(state.search)}"></label><div class="toolbar-right">${products ? html`<select id="category-filter" aria-label="Kategorie filtern"><option value="">Alle Kategorien</option>${categories.map(c => html`<option${c === state.category ? ' selected' : ''}>${h(c)}</option>`).join('')}</select><select id="activity-filter" aria-label="Produktstatus filtern"><option value="active"${state.activity === 'active' ? ' selected' : ''}>Aktive Produkte</option><option value="all"${state.activity === 'all' ? ' selected' : ''}>Alle Produkte</option><option value="archived"${state.activity === 'archived' ? ' selected' : ''}>Archivierte Produkte</option></select>` : html`<label class="filter-label">${icon('filter')}<select id="reason-filter" aria-label="Retourengrund filtern"><option value="">Alle Gründe</option>${reasons.map(r => html`<option value="${h(r)}"${r === state.category ? ' selected' : ''}>${h(masterName(state.masterdata,'reasons',r))}</option>`).join('')}</select></label>${assigneeFilter()}`}<button class="icon-btn" data-export="${kind}" aria-label="CSV exportieren" title="CSV exportieren">${icon('download')}</button></div></div><div id="selection-toolbar"></div><div id="table-content">${filteredTable()}</div><div class="table-footer"><span id="result-count" aria-live="polite" aria-atomic="true"></span><span>${csvHint}</span></div></section>`;
}
function filteredItems({ignoreStatusSelection=false}={}):any[] {
    const q = state.search.toLocaleLowerCase('de-DE');
    const today=state.view==='returns'&&state.scope==='today'?workspaceCalendarDay(Date.now(),ctx.config?.rules?.timezone):'';
    return (state.view === 'products' ? state.products : state.returns).filter(item => {
        const keys = state.view === 'products' ? ['name', 'sku', 'ean', 'supplier', 'manufacturer', 'category'] : ['returnNumber', 'productName', 'sku', 'ean', 'supplier', 'serialNumber', 'replacementSerialNumber', 'orderNumber', 'customerReference', 'trackingNumber', 'reason', 'notes','assignedDisplayName','nextStep'];
        if (q && !(state.view==='returns'&&[item.serialNumber,item.replacementSerialNumber].some(value=>serialKey(value).includes(serialKey(state.search))))&&!keys.some(key => [String(item[key] ?? ''),String(masterValue(state.masterdata,item,key))].some(value=>value.toLocaleLowerCase('de-DE').includes(q))))
            return false;
        if (state.view === 'products') {
            const product = item;
            return (!state.category || product.category === state.category) && (state.activity === 'all' || (state.activity === 'active' ? product.active : !product.active));
        }
        const ret = item;
        if(state.assignee==='unassigned'&&ret.assignedUserId!=null)return false;
        if(state.assignee==='mine'&&ret.assignedUserId!==state.session.user?.id)return false;
        if(/^[1-9]\d*$/.test(state.assignee)&&ret.assignedUserId!==Number(state.assignee))return false;
        return (state.scope!=='today'||matchesReturnScope(ret,'today',today))&&(ignoreStatusSelection||(matchesReturnScope(ret, state.scope,today)&&(!state.status||ret.status===state.status))) && (!state.category || ret.reason === state.category);
    });
}
function returnStatusCounts(){
    // Status buttons replace status/scope; all other filters remain in effect.
    const rows=filteredItems({ignoreStatusSelection:true}),byStatus=new Map<string,number>();
    for(const row of rows)byStatus.set(row.status,(byStatus.get(row.status)??0)+1);
    return {total:rows.length,byStatus};
}
function refreshStatusCounts(){
    if(state.view!=='returns')return;
    const counts=returnStatusCounts();
    document.querySelectorAll<HTMLElement>('[data-status-count]').forEach(node=>{node.textContent=String(node.dataset.statusCount?counts.byStatus.get(node.dataset.statusCount)??0:counts.total);});
}
function currentFilter(){return {view:state.view,search:state.search,scope:state.scope,status:state.status,category:state.view==='products'?state.category:'',reason:state.view==='returns'?state.category:'',activity:state.activity,assignee:state.assignee};}
function syncFilters(){hashHistory.replace(internalNavigationUrl(filterRoute(currentFilter()),location.href));routeEvents.sync();acceptedAreaRoute=currentRouteHash();areaNavigation.remember(acceptedAreaRoute);updateAreaSwitcher();bindViews();}
function bindViews(){const root=document.querySelector('#workspace-view-tools');if(root)bindSavedFilters(ctx,root,currentFilter(),filter=>{const hash=filterRoute(filter);if(hash===currentRouteHash())return;location.hash=hash;});}
function assigneeFilter(){
    const accounts=[...state.returnAssignees];
    if(/^[1-9]\d*$/.test(state.assignee)&&!accounts.some(account=>String(account.id)===state.assignee)){const ret=state.returns.find(item=>String(item.assignedUserId)===state.assignee);if(ret)accounts.push({id:ret.assignedUserId,displayName:ret.assignedDisplayName});}
    return html`<select id="assignee-filter" aria-label="Zuständigkeit filtern"><option value="">Alle Zuständigkeiten</option><option value="mine"${state.assignee==='mine'?' selected':''}>Meine Retouren</option><option value="unassigned"${state.assignee==='unassigned'?' selected':''}>Ohne Zuständigkeit</option>${accounts.map(account=>html`<option value="${account.id}"${String(account.id)===state.assignee?' selected':''}>${h(account.displayName||account.username)}</option>`).join('')}</select>`;
}
function sortedItems(){return sortInventoryRows(filteredItems(),state.view,readInventorySort(ctx,state.view),{label:(row,key)=>key==='identity'?(state.view==='products'?row.name:row.returnNumber):key==='serial'?row.serialNumber:key==='status'?(state.view==='products'?(row.active?t('Aktiv'):t('Archiviert')):statusName(row.status)):key==='reason'?masterValue(state.masterdata,row,'reason'):row[key]});}
function listPagination(){return paginate(sortedItems(),state.page??1,25);}
function filteredTable() { const page=listPagination();state.page=page.page;return renderMobileSorting(state.view,readInventorySort(ctx,state.view))+(state.view === 'products' ? productTable(page.rows) : returnTable(page.rows))+html`<nav class="pagination" aria-label="Listenseiten"><button class="btn secondary small" data-list-page="${page.page-1}" ${page.page===1?'disabled':''}>Zurück</button><span>Seite ${page.page} von ${page.pages} · ${page.total} Einträge</span><button class="btn secondary small" data-list-page="${page.page+1}" ${page.page===page.pages?'disabled':''}>Weiter</button></nav>`; }
function empty(kind, filtered = false) { return html`<div class="empty-state"><span class="empty-icon">${icon(kind === 'products' ? 'box' : 'return')}</span><h3>${filtered ? t('Keine passenden Einträge') : kind === 'products' ? t('Dein Produktbestand wartet auf dich') : t('Noch keine Retouren erfasst')}</h3><p>${filtered ? t('Passe deine Suche oder die Filter an.') : kind === 'products' ? t('Lege dein erstes Produkt an oder importiere eine CSV-Datei.') : t('Sobald eine Retoure eingeht, kannst du sie hier erfassen.')}</p>${filtered ? html('<button class="btn secondary" id="clear-filters">Filter zurücksetzen</button>') : createButton(kind, kind === 'products' ? t('Produkt anlegen') : t('Erste Retoure erfassen'))}</div>`; }
function returnWork(item){return html`${item.assignedDisplayName?html`<small class="return-assignee">${icon('users')}${h(item.assignedDisplayName)}</small>`:''}${item.nextStep?html`<small class="return-next-step"><span>${t('Nächster Schritt')}:</span> ${h(item.nextStep)}</small>`:''}`;}
function returnSelect(item){return html`<label class="record-select"><input type="checkbox" data-select-return="${item.id}" aria-label="${h(t`Retoure auswählen: ${item.returnNumber}`)}"${returnSelection.has(item.id)?' checked':''}></label>`;}
function returnTable(rows, compact = false) {
    if (!rows.length)return empty('returns', state.view === 'returns' && (!!state.search || !!state.status || !!state.category || !!state.scope || !!state.assignee));
    const selectable=!compact&&(ctx.can('returnsStatus')||ctx.can('returnsExport'));
    return html`<div class="table-scroll"><table class="${compact ? 'compact-return-table' : ''}${selectable?' selectable-return-table':''}"><thead><tr>${selectable?html`<th class="selection-cell"><label class="record-select"><input type="checkbox" data-select-page aria-label="Auswahl auf dieser Seite"></label></th>`:''}${compact?html`<th scope="col">Retoure / Produkt</th>`:sortableHeading('returns','identity',readInventorySort(ctx,'returns'))}${compact?html`<th scope="col" data-column="status" class="record-status-heading">Status</th>`:sortableHeading('returns','status',readInventorySort(ctx,'returns'))}${!compact ? ['supplier','serial','reason'].map(key=>sortableHeading('returns',key,readInventorySort(ctx,'returns'))).join('') : ''}${compact?html`<th scope="col" data-column="received">Erfasst</th>`:sortableHeading('returns','received',readInventorySort(ctx,'returns'))}<th class="record-actions-heading">Aktionen</th></tr></thead><tbody>${rows.map(r => html`<tr${selectable&&returnSelection.has(r.id)?' class="is-selected"':''}>${selectable?html`<td class="selection-cell">${returnSelect(r)}</td>`:''}<td><div class="product-cell">${productAvatar(r)}<div><button class="row-link" data-detail="returns" data-id="${r.id}">${h(r.productName)}</button><small>${h(r.returnNumber)}${!compact ? ' · ' + h(r.sku) : ''}</small>${compact ? html`<small class="return-serial"><span class="sr-only">${t('Seriennummer')}: </span><span class="mono">${h(r.serialNumber || '—')}</span></small>` : ''}${r.customerReference?html`<small class="customer-reference">${t('Kundenreferenz')}: ${h(r.customerReference)}</small>`:''}${r.trackingNumber?html`<small class="customer-reference tracking-number">${t('Sendungsnummer')}: ${h(r.trackingNumber)}</small>`:''}${returnWork(r)}</div></div></td><td data-column="status" class="record-status-cell">${badge(r.status)}${overdueMarker(r)}</td>${!compact ? html`<td data-column="supplier">${h(r.supplier || '—')}</td><td data-column="serial" class="mono">${h(r.serialNumber || '—')}</td><td data-column="reason">${h(masterValue(state.masterdata,r,'reason'))}</td>` : ''}<td data-column="received" class="nowrap return-timing-cell">${returnTiming(r,compact)}</td><td class="record-actions-cell">${returnQuickActions(ctx,r)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${rows.map(r => html`<article class="record-card${selectable&&returnSelection.has(r.id)?' is-selected':''}"><div class="record-top">${selectable?returnSelect(r):''}<span class="record-number">${h(r.returnNumber)}</span><span data-column="status">${badge(r.status)}${overdueMarker(r)}</span></div><div class="product-card-title">${productAvatar(r)}<button class="row-link record-title" data-detail="returns" data-id="${r.id}">${h(r.productName)}</button></div><dl><div class="full" data-column="received"><dt>Erfasst</dt><dd>${returnTimestamp(r.createdAt)}</dd></div>${r.customerReference?html`<div class="full"><dt>Kundenreferenz</dt><dd>${h(r.customerReference)}</dd></div>`:''}${r.trackingNumber?html`<div class="full"><dt>Sendungsnummer</dt><dd>${h(r.trackingNumber)}</dd></div>`:''}<div data-column="received"><dt>Eingang</dt><dd>${date(r.receiptDate)}</dd></div><div data-column="supplier"><dt>Lieferant</dt><dd>${h(r.supplier || '—')}</dd></div><div data-column="serial"><dt>Seriennummer</dt><dd>${h(r.serialNumber || '—')}</dd></div><div data-column="reason"><dt>Grund</dt><dd>${h(masterValue(state.masterdata,r,'reason'))}</dd></div>${r.assignedDisplayName?html`<div class="full"><dt>Verantwortliche Person</dt><dd>${h(r.assignedDisplayName)}</dd></div>`:''}${r.nextStep?html`<div class="full"><dt>Nächster Schritt</dt><dd>${h(r.nextStep)}</dd></div>`:''}</dl>${returnQuickActions(ctx,r)}</article>`).join('')}</div>`;
}
function productTable(rows) {
    if (!rows.length)
        return empty('products', !!state.search || !!state.category || state.activity !== 'active');
    return html`<div class="table-scroll"><table><thead><tr>${['identity','ean','supplier','category','price','status'].map(key=>sortableHeading('products',key,readInventorySort(ctx,'products'))).join('')}<th class="record-actions-heading">Aktionen</th></tr></thead><tbody>${rows.map(p => html`<tr><td><div class="product-cell">${productAvatar(p)}<div><button class="row-link" data-detail="products" data-id="${p.id}">${h(p.name)}</button><small>${h(p.sku)}${p.manufacturer ? ' · ' + h(p.manufacturer) : ''}</small></div></div></td><td data-column="ean" class="mono">${h(p.ean || '—')}</td><td data-column="supplier">${h(p.supplier || '—')}</td><td data-column="category">${p.category ? html`<span class="category-tag">${h(p.category)}</span>` : '—'}</td><td data-column="price" class="nowrap">${currency(p.priceCents)}</td><td data-column="status" class="record-status-cell"><span data-column="status" class="status ${p.active ? 'done' : 'archived'}"><span></span>${p.active ? t('Aktiv') : t('Archiviert')}</span></td><td class="record-actions-cell">${productQuickActions(ctx,p)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${rows.map(p => html`<article class="record-card"><div class="record-top"><span class="record-number">${h(p.sku)}</span><span data-column="status" class="status ${p.active ? 'done' : 'archived'}"><span></span>${p.active ? t('Aktiv') : t('Archiviert')}</span></div><div class="product-card-title">${productAvatar(p)}<button class="row-link record-title" data-detail="products" data-id="${p.id}">${h(p.name)}</button></div><dl><div data-column="ean"><dt>EAN</dt><dd>${h(p.ean || '—')}</dd></div><div data-column="supplier"><dt>Lieferant</dt><dd>${h(p.supplier || '—')}</dd></div><div data-column="category"><dt>Kategorie</dt><dd>${h(p.category || '—')}</dd></div><div data-column="price"><dt>Preis</dt><dd>${currency(p.priceCents)}</dd></div></dl>${productQuickActions(ctx,p)}</article>`).join('')}</div>`;
}
function bindActions(root: any) {
    root.querySelectorAll('[data-scan-search]').forEach(el=>el.onclick=async()=>{const dialog=document.querySelector('#dialog');if(dialog.open&&!await canLeaveForms(dialog))return;openScanner(ctx,{onScan:value=>openWorkspaceSearch(ctx,value)});});
    bindQuickActions(ctx,root,()=>state.returns,{status:statusForm,create:returnForm});
    if(['products','returns'].includes(state.view))bindInventorySorting(ctx,root,state.view,()=>{state.page=1;refreshRows();});
    root.querySelectorAll('[data-list-page]').forEach(el=>el.onclick=()=>{state.page=Number(el.dataset.listPage);refreshRows();});
    root.querySelectorAll('[data-import]').forEach(el=>el.hidden=!ctx.can(el.dataset.import+'Import'));
    root.querySelectorAll('[data-export]').forEach(el=>el.hidden=!ctx.can(el.dataset.export+'Export'));
    root.querySelectorAll('[data-create]').forEach(el => el.onclick = () => ctx.ensureUnlocked(() => el.dataset.create === 'products' ? productForm(ctx) : returnForm(ctx)));
    root.querySelectorAll('[data-detail]').forEach(el => el.onclick = () => { const kind = el.dataset.detail, item = state[kind].find(r => r.id === Number(el.dataset.id)); if (item)
        showDetails(ctx, kind, item); });
    root.querySelectorAll('[data-import]').forEach(el => el.onclick = () => ctx.ensureUnlocked(() => openImport(ctx, el.dataset.import)));
    root.querySelectorAll('[data-export]').forEach(el => el.onclick = () => ctx.ensureUnlocked(() => openExport(ctx,el.dataset.export)));
    root.querySelectorAll('[data-unlock]').forEach(el => el.onclick = accessClick);
    root.querySelector('#clear-filters')?.addEventListener('click', () => { state.search = ''; state.status = ''; state.category = '';state.assignee=''; state.activity = 'active';state.page=1;returnSelection.clear(); clearScope();syncFilters(); render(); });
    root.querySelectorAll('[data-select-return]').forEach(el=>el.onchange=()=>{try{returnSelection.choose(Number(el.dataset.selectReturn),el.checked);}catch(err){ctx.toast(err.message);}updateSelection();});
    root.querySelector('[data-select-page]')?.addEventListener('change',event=>{try{returnSelection.togglePage(listPagination().rows.map(item=>item.id),(event.target as HTMLInputElement).checked);}catch(err){ctx.toast(err.message);}updateSelection();});
    updateSelection();
}
function updateSelection(){
    const root=document.querySelector<HTMLElement>('#content'),bar=root.querySelector<HTMLElement>('#selection-toolbar');
    if(!bar)return;
    root.querySelectorAll<HTMLInputElement>('[data-select-return]').forEach(el=>{el.checked=returnSelection.has(Number(el.dataset.selectReturn));el.closest('tr,article')?.classList.toggle('is-selected',el.checked);});
    const ids=listPagination().rows.map(item=>item.id),page=root.querySelector<HTMLInputElement>('[data-select-page]');
    if(page){page.checked=returnSelection.all(ids);page.indeterminate=!page.checked&&ids.some(id=>returnSelection.has(id));}
    bar.innerHTML=selectionToolbar(ctx,returnSelection);
    bar.querySelector('[data-selection-clear]')?.addEventListener('click',()=>{returnSelection.clear();updateSelection();});
    bar.querySelector('[data-bulk-status]')?.addEventListener('click',()=>void ctx.ensureUnlocked(()=>openBulkStatus(ctx,returnSelection.ids(),()=>returnSelection.clear())));
}
function refreshRows({preserveScroll=false}={}) {
    const target=document.querySelector<HTMLElement>('#table-content');if(!target)return;
    const update=()=>{
        closeRecordMenus();
        target.innerHTML=filteredTable();
        refreshStatusCounts();
        bindActions(target);
        applyTablePreferences(document.querySelector('#content'),state.view,readTablePreferences(ctx,state.view));
        bindViews();
        setText(document.querySelector('#result-count'),t`${filteredItems().length} von ${state[state.view].length} Einträgen`);
    };
    if(preserveScroll)preserveListScroll(target,update);else update();
}
function bindContent() {
    const root = document.querySelector('#content');
    if (state.view === 'admin') {
        return bindAdmin(ctx, root.querySelector('[data-admin-view]'));
    }
    bindActions(root);
    bindViews();
    if(state.view==='overview')bindOverviewControls(ctx,root);
    if(state.view==='returns'||state.view==='products')bindTableControls(ctx,root,state.view);
    root.querySelectorAll('[data-workflow-status]').forEach(el=>el.onclick=()=>{location.hash='#returns?'+new URLSearchParams({status:el.dataset.workflowStatus});});
    root.querySelector('#search')?.addEventListener('input', (event: any) => { state.page=1;state.search = event.target.value;returnSelection.clear();syncFilters(); delayedSearch.run(); });
    for (const [id, key] of [['category-filter', 'category'], ['reason-filter', 'category'], ['activity-filter', 'activity'],['assignee-filter','assignee']])
        root.querySelector('#' + id)?.addEventListener('change', (event: any) => { state.page=1;state[key] = event.target.value;returnSelection.clear(); if (key === 'activity') clearScope();syncFilters(); refreshRows(); });
    root.querySelector('#clear-scope')?.addEventListener('click', () => { clearScope(); state.status = '';returnSelection.clear();syncFilters(); render(); });
    root.querySelectorAll('[data-status]').forEach(el => el.onclick = () => { state.page=1;if(state.scope!=='today')clearScope(); state.status = el.dataset.status;returnSelection.clear();syncFilters(); render(); });
    if (state.view !== 'overview')
        setText(document.querySelector('#result-count'),t`${filteredItems().length} von ${state[state.view].length} Einträgen`);
}
function clearScope() { state.scope = ''; }
function applyRoute() {
    const next=parseDesignRoute(currentRouteHash());
    state.view=next.view;state.scope=next.scope;if(next.view!=='account')state.adminPage=next.view==='admin';
    acceptedAreaRoute=currentRouteHash();areaNavigation.remember(acceptedAreaRoute);
    document.body.dataset.page=state.adminPage?'admin':state.view==='chat'?'chat':state.view==='account'?'account':'workspace';
    const filter=readWorkspaceFilter(currentRouteHash());
    Object.assign(state,{search:filter?.search??'',category:state.view==='products'?filter?.category??'':filter?.reason??'',activity:filter?.activity??'active',assignee:filter?.assignee??'',status:filter?.status??''});
}
async function route() {
    if(location.hash==='#content'){document.querySelector('#content').focus();return;}
    ctx.stopScanner?.();
    const dialog=document.querySelector('#dialog');if(dialog.open){dialog.close();dialog.replaceChildren();}
    applyRoute();returnSelection.clear();updateAccess();
    if((!ctx.isAccountView&&!state.adminPage&&state.view!=='chat'&&!state.inventoryLoaded)||(state.adminPage&&ctx.hasAdminAccess&&!Object.keys(state.masterdata).length)){await ctx.reload();return;}
    await render();
}
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
document.querySelector('#access-button').onclick = accessClick;
document.querySelector('#header-access').onclick = accessClick;
function normalizeCurrentRoute(){
    const url=internalNavigationUrl(location.href,location.href);
    if(url!==null&&new URL(url,location.href).href!==location.href)history.replaceState(history.state,'',url);
}
function normalizeLink(link:HTMLAnchorElement){
    if(link.hasAttribute('download'))return;
    const url=internalNavigationUrl(link.href,location.href);
    if(url!==null&&link.getAttribute('href')!==url)link.setAttribute('href',url);
}
function normalizeInternalLinks(){document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(normalizeLink);}
normalizeCurrentRoute();
const hashHistory=createHashHistory(history,()=>location.href,()=>(window as any).navigation?.currentEntry?.index);bindUnsavedProtection();
const routeEvents=createLocationChangeListener(()=>location.href,async()=>{
    if(hashHistory.restored())return;
    if(location.hash==='#content'){hashHistory.accept();void route();return;}
    navigationLifecycle.invalidate();const current=navigationLifecycle.checkpoint(),allow=await canLeaveForms();
    if(!current())return;
    if(!allow){hashHistory.cancel();return;}
    normalizeCurrentRoute();routeEvents.sync();hashHistory.accept();state.page=1;await route();
});
window.addEventListener('hashchange',()=>void routeEvents.changed());
window.addEventListener('popstate',()=>void routeEvents.changed());
for(const name of ['pointerover','focusin','contextmenu'])document.addEventListener(name,event=>{
    const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(link)normalizeLink(link);
});
// Keep existing page bookmarks working; ordinary clicks stay in
// the mounted shell. Downloads, external links and new-tab gestures stay native.
document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(!link||link.target||link.hasAttribute('download'))return;
    const hash=internalNavigationHash(link.href,location.href);if(hash===null)return;
    event.preventDefault();if(hash===currentRouteHash())return;if(hash==='#account')void ctx.openAccountPage();else location.hash=hash;
});
window.addEventListener('theme-choice',(event:CustomEvent)=>{if(ctx.unlocked)void ctx.api('/api/account/preferences',{method:'PUT',body:{theme:event.detail}}).catch(err=>ctx.toast(apiError(err.message)));});
window.addEventListener('beforeunload',event=>{if(document.querySelector('form[data-dirty=true]')){event.preventDefault();event.returnValue='';}});
sectionTransition=createSectionTransition(document.querySelector('#content'),document,()=>ctx.unlocked&&document.documentElement.dataset.motion==='normal');
const cancelReducedSectionMotion=()=>{if(document.documentElement.dataset.motion!=='normal')sectionTransition.cancel();};
window.addEventListener('account-preferences',cancelReducedSectionMotion);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',cancelReducedSectionMotion);
ctx.openAccountPage=()=>navigationLifecycle.openAccount({isAccount:()=>ctx.isAccountView,canLeave:canLeaveForms,remember:hash=>state.accountReturnHash=hash,open:()=>{location.hash='account';},fallback:state.adminPage?'#admin':state.view==='chat'?'#chat':'#overview'});
ctx.currencyUI=bindCurrencyControl(ctx,document.querySelector('.topbar-right'),()=>{if(!state.adminPage&&state.view!=='chat'&&state.view!=='scan-intake'&&state.view!=='disposals'&&!ctx.isAccountView)render();});
bindHeaderMenu(document.querySelector('.topbar-right'),button=>signOut(ctx,()=>canLeaveForms(document),button).catch(error=>ctx.toast(apiError(error.message))));
ctx.currencyUI.account(null);
applyRoute();
document.querySelector('#content').innerHTML=loadingSkeleton(state.view==='admin'?'settings':state.view==='account'?'account':state.view==='overview'?'overview':'list');
mobileToolbarMarkup=mobileActions(ctx,state.view);mobileToolbar.innerHTML=mobileToolbarMarkup;
mobileToolbar.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-mobile-create]');if(button)void ctx.ensureUnlocked(()=>{const kind=button.dataset.mobileCreate;if(!ctx.can(kind+'Create'))return;return kind==='returns'?returnForm(ctx):productForm(ctx);});});
navigation = bindMobileNavigation();
try {
    await ctx.reload();
}
catch (error) {
    document.querySelector(ctx.unlocked ? '#content' : '#auth-page').innerHTML = html`<div class="empty-state"><span class="empty-icon">${icon('info')}</span><h1>Verbindung fehlgeschlagen</h1><p>${h(error.message)}</p><button class="btn secondary" id="retry">${icon('refresh')}Erneut versuchen</button></div>`;
    document.querySelector('#retry').onclick = () => location.reload();
}
setInterval(()=>void ctx.poll(),30000);

