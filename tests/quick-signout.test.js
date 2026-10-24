import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const {signOut}=await sourceModule("export * from './frontend/src/auth-context.ts';");
function fixture(){const calls=[],button={disabled:false},ctx={unlocked:true,authGeneration:1,session:{user:{id:7},csrfToken:'one'},api:async(path,options)=>{calls.push([path,options]);return {unlocked:false};},applySession:value=>calls.push(value),reload:async()=>calls.push('reload')};return {ctx,calls,button};}
test('quick sign-out respects unsaved input and only posts after the user agrees to leave',async()=>{
 const f=fixture();assert.equal(await signOut(f.ctx,async()=>false,f.button),false);assert.deepEqual(f.calls,[]);assert.equal(f.button.disabled,false);
 assert.equal(await signOut(f.ctx,async()=>true,f.button),true);assert.deepEqual(f.calls,[['/api/logout',{method:'POST',body:{}}],{unlocked:false},'reload']);assert.equal(f.button.disabled,false);
});
test('double clicks and an account change during the leave prompt cannot sign out another session',async()=>{
 const f=fixture();let allow;const first=signOut(f.ctx,()=>new Promise(resolve=>allow=resolve),f.button);
 assert.equal(f.button.disabled,true);assert.equal(await signOut(f.ctx,async()=>true,f.button),false);
 f.ctx.authGeneration++;allow(true);assert.equal(await first,false);assert.deepEqual(f.calls,[]);assert.equal(f.button.disabled,false);
});
test('a failed sign-out is retryable and never clears the current session locally',async()=>{
 const f=fixture();f.ctx.api=async()=>{throw Error('offline');};await assert.rejects(signOut(f.ctx,async()=>true,f.button),/offline/);assert.deepEqual(f.calls,[]);assert.equal(f.button.disabled,false);
 f.ctx.api=async()=>({unlocked:false});assert.equal(await signOut(f.ctx,async()=>true,f.button),true);
});
