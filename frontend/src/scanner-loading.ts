import {captureAuthContext} from './auth-context.js';
import {t,addTranslations} from './i18n.js';
import {stopReturnLabel} from './return-labels.js';
addTranslations({'Scanner konnte nicht geladen werden. Bitte erneut versuchen.':'Could not load scanner. Please try again.'});
type ScannerModule={openScanner:(ctx:any,options:any)=>any;stopScanner:()=>void};

// Keep decoder downloads outside the normal workspace module graph. A delayed
// download must still belong to the same account, page and record form.
export function createScannerLauncher(load:()=>Promise<ScannerModule>=()=>import('./scan-labels.js'),{document:doc=globalThis.document,href=()=>globalThis.location?.href}:any={}){
 let scanner:ScannerModule|null=null,loading:Promise<ScannerModule>|null=null,generation=0,release:(()=>void)|null=null;
 return {
  async open(ctx:any,options:any){
   if(!ctx.unlocked)return;
   const token=++generation;release?.();
   const auth=captureAuthContext(ctx),url=href(),content=doc?.querySelector('#content'),page=content?.firstElementChild,dialog=doc?.querySelector('#dialog'),owner=dialog?.firstElementChild,wasOpen=dialog?.open,modals=Array.from(doc?.querySelectorAll?.('dialog[open]')??[]);
   const sameModals=()=>{const open=Array.from(doc?.querySelectorAll?.('dialog[open]')??[]);return open.length===modals.length&&open.every((item,index)=>item===modals[index]);};
   const current=()=>token===generation&&auth()&&href()===url&&sameModals()&&doc?.querySelector('#content')===content&&content?.firstElementChild===page&&doc?.querySelector('#dialog')===dialog&&dialog?.open===wasOpen&&dialog?.firstElementChild===owner;
   const button=doc?.activeElement?.tagName==='BUTTON'?doc.activeElement:null,disabled=button?.disabled,busy=button?.getAttribute('aria-busy');let released=false;
   const done=()=>{if(released)return;released=true;if(button){button.disabled=disabled;if(busy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',busy);}if(release===done)release=null;};
   if(button&&!scanner){button.disabled=true;button.setAttribute('aria-busy','true');}release=done;
   try{
    scanner??=await(loading??=load().finally(()=>{loading=null;}));
    if(current())return scanner.openScanner(ctx,options);
   }catch{if(current())ctx.toast(t('Scanner konnte nicht geladen werden. Bitte erneut versuchen.'));}
   finally{done();}
  },
  stop(){generation++;release?.();if(scanner)scanner.stopScanner();else stopReturnLabel();}
 };
}
const launcher=createScannerLauncher();
export const openScanner=launcher.open;
export const stopScanner=launcher.stop;
