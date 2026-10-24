import {html,addTranslations} from './i18n.js';
import {icon} from './ui.js';

addTranslations({'Daten & Werkzeuge':'Data & tools','CSV importieren':'Import CSV','CSV exportieren':'Export CSV','Daten übertragen und bestehende Import- und Exportwerkzeuge öffnen.':'Transfer data and open existing import and export tools.','CSV oder JSON mit Vorschau und Zuordnung importieren.':'Import CSV or JSON with preview and field mapping.','Produkte und Retouren als CSV oder JSON herunterladen.':'Download products and returns as CSV or JSON.'});

export function renderDataTools(ctx:{unlocked:boolean;can:(key:string)=>boolean}){
  const rights=navigationToolRights(ctx);
  return html`<section class="data-tools-page"><div class="page-heading"><div><span class="eyebrow">ADMINISTRATION</span><h1>Daten & Werkzeuge<span class="heading-dot">.</span></h1><p>Daten übertragen und bestehende Import- und Exportwerkzeuge öffnen.</p></div></div><div class="data-tools-grid">${rights.import?html`<section class="panel data-tool-card"><span class="detail-symbol">${icon('upload')}</span><h2>CSV importieren</h2><p>CSV oder JSON mit Vorschau und Zuordnung importieren.</p><button type="button" class="btn primary" data-tool-action="import">${icon('upload')}CSV importieren</button></section>`:''}${rights.export?html`<section class="panel data-tool-card"><span class="detail-symbol">${icon('download')}</span><h2>CSV exportieren</h2><p>Produkte und Retouren als CSV oder JSON herunterladen.</p><button type="button" class="btn secondary" data-tool-action="export">${icon('download')}CSV exportieren</button></section>`:''}</div></section>`;
}

export function navigationToolRights(ctx:{unlocked:boolean;can:(key:string)=>boolean},available=true){
  return {
    import:Boolean(available&&ctx.unlocked&&['productsImport','returnsImport'].some(key=>ctx.can(key))),
    export:Boolean(available&&ctx.unlocked&&['productsExport','returnsExport'].some(key=>ctx.can(key)))
  };
}

export function bindDataTools(ctx:any,root:ParentNode,actions:{import:()=>void;export:()=>void}){
  root.querySelectorAll<HTMLElement>('[data-tool-action]').forEach(button=>{
    const action=button.dataset.toolAction as 'import'|'export';
    button.addEventListener('click',()=>{
      if(!navigationToolRights(ctx)[action])return;
      ctx.ensureUnlocked(()=>{if(navigationToolRights(ctx)[action])actions[action]();});
    });
  });
}
