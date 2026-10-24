import test from 'node:test';import assert from 'node:assert/strict';
test('restore UI discards stale previews, allows identity retry and never submits an accepted commit twice',async()=>{
 const {createRestoreFlow}=await import('../dist/public/backup-restore.js');let resolve,commits=0;const flow=createRestoreFlow(async(path)=>{if(path.endsWith('/commit')){if(++commits===1)throw Error('Passwort falsch');return {accepted:true};}return new Promise(r=>resolve=r);});
 const stale=flow.prepare('/prepare',{});flow.reset();resolve({id:'old',state:'ready'});assert.equal(await stale,null);assert.equal(flow.preview,null);await assert.rejects(()=>flow.commit({}),/gültige/);
 const prepared=flow.prepare('/prepare',{});resolve({id:'new',state:'ready'});await prepared;await assert.rejects(()=>flow.commit({}),/Passwort/);assert.equal(flow.busy,false);await flow.commit({});await assert.rejects(()=>flow.commit({}),/bereits/);assert.equal(commits,2);
});
test('restored session polling waits until old login state has been discarded',async()=>{
 const {waitForRestoredSession}=await import('../dist/public/backup-restore.js');let attempts=0;const session=await waitForRestoredSession(async(path)=>({ok:true,json:async()=>({unlocked:++attempts<3})}),{pause:async()=>{}});assert.equal(session.unlocked,false);assert.equal(attempts,3);
});
