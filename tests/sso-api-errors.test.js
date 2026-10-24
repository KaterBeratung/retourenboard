import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Execute the production ctx.api method with only network/DOM boundaries replaced.
// The failure is a real unwanted loginDialog() call, not a source-text assertion.
test('anonymous SSO failures preserve the current login form and display their original error',async()=>{
 const source=readFileSync(new URL('../frontend/src/app.ts',import.meta.url),'utf8'),start=source.indexOf('    async api(path, options: any = {}) {'),end=source.indexOf('    async reload(',start);
 const method=source.slice(start,end).replace('options: any = {}','options = {}');let dialogs=0;
 const ctx={authGeneration:1,unlocked:false,applySession(){},api:null},state={session:{csrfToken:null}};
 const fetch=async path=>({ok:path==='/api/session',status:path==='/api/session'?200:401,json:async()=>path==='/api/session'?{unlocked:false}:{error:'SSO expired'}});
 ctx.api=new Function('ctx','state','fetch','loginDialog','t','apiError','return ({'+method+'}).api;')(ctx,state,fetch,()=>dialogs++,v=>v,v=>v);
 await assert.rejects(ctx.api('/api/sso/complete',{method:'POST',body:{}}),/SSO expired/);
 assert.equal(dialogs,0,'a failed anonymous SSO flow must not recreate and erase the local form');
});
