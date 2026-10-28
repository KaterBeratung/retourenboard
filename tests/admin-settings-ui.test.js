import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSettings} from '../dist/public/admin-settings.js';
function fixture(t,values,failWrite=false){
 const previous=globalThis.FormData;
 globalThis.FormData=class extends Map{constructor(form){super(Object.entries(form.values));}};
 t.after(()=>{globalThis.FormData=previous;});
 const button={disabled:false},currency={hidden:true,textContent:''},globalError={hidden:true,textContent:''};
 const form={isConnected:true,dataset:{},values,closest:()=>null,addEventListener(){},querySelector:s=>s==='[type=submit]'?button:s==='.form-error'?currency:s==='.settings-save .form-error'?globalError:null};
 const target={isConnected:true,innerHTML:'',querySelector:s=>s==='#server-settings-form'?form:s==='#currency-refresh'?{}:s==='#currency-error'?currency:null};
 const root={querySelector:s=>s==='#settings-content'?target:null};let writes=0;
 const settings={publicOrigin:'',port:3022,uploadMaxMb:10,maxFilesPerReturn:10,sessionHours:12};
 const ctx={isAdmin:true,toast(){},api:async(path,options)=>{if(options){writes++;if(failWrite)throw Error('Rejected settings');return {};}
 assert.equal(path,'/api/admin/settings');return {settings,activeNetwork:{port:3022,secureCookies:false},server:{host:'127.0.0.1',version:'4.0.70',nodeVersion:'24'}};},reload:async()=>{}};
 return {ctx,root,form,currency,globalError,writes:()=>writes};
}
test('server form validation stays visible outside an inactive currency panel without writing settings',async t=>{
 const f=fixture(t,{domain:'',protocol:'https'});await bindSettings(f.ctx,f.root);await f.form.onsubmit({preventDefault(){}});
 assert.equal(f.writes(),0);assert.equal(f.globalError.hidden,false);assert.match(f.globalError.textContent,/Domain|IP/);assert.equal(f.currency.hidden,true);
});
test('server settings API errors use the global form alert rather than a hidden currency-specific alert',async t=>{
 const f=fixture(t,{domain:'example.test',protocol:'http',port:'3022',displayCurrency:'EUR',uploadMaxMb:'10',maxFilesPerReturn:'10',sessionHours:'12'},true);await bindSettings(f.ctx,f.root);await f.form.onsubmit({preventDefault(){}});
 assert.equal(f.writes(),1);assert.equal(f.globalError.hidden,false);assert.equal(f.globalError.textContent,'Rejected settings');assert.equal(f.currency.hidden,true);
});
