import test from 'node:test';import assert from 'node:assert/strict';
test('restart confirmation uses a required animated switch and shows a factor field only for active MFA',async()=>{
 const {renderRestartForm}=await import('../dist/public/server-operations.js');
 assert.equal(typeof renderRestartForm,'function');
 const html=renderRestartForm(false);
 assert.doesNotMatch(html,/type="password"|name="password"|name="factor"/);
 assert.match(html,/data-form-mode="action"/);
 assert.match(html,/class="checkbox-field switch-field confirmation-field"/);
 assert.match(html,/<input[^>]*role="switch"[^>]*class="switch-input"[^>]*name="confirmed"[^>]*required/);
 assert.match(html,/class="switch-thumb"/);
 const protectedHtml=renderRestartForm(true);
 assert.doesNotMatch(protectedHtml,/type="password"|name="password"/);
 assert.match(protectedHtml,/<input[^>]*name="factor"[^>]*required/);
});
test('restart UI prevents duplicate submissions and never treats an unaccepted response as success',async()=>{
 const {createRestartFlow}=await import('../dist/public/server-operations.js');let finish,calls=0;const flow=createRestartFlow(async()=>{calls++;return new Promise(r=>finish=r);});
 await assert.rejects(flow.start({confirmed:false}),/bestätigen/);const pending=flow.start({confirmed:true});await assert.rejects(flow.start({confirmed:true}),/bereits/);finish({accepted:true});await pending;assert.equal(calls,1);assert.equal(flow.accepted,true);
 const failed=createRestartFlow(async()=>({accepted:false}));await assert.rejects(failed.start({confirmed:true}),/angenommen/);assert.equal(failed.busy,false);
});
test('restart polling tolerates downtime, waits for a new login state and has a bounded timeout',async()=>{
 const {waitForRestart}=await import('../dist/public/server-operations.js');let now=0,calls=0;
 const result=await waitForRestart({now:()=>now,pause:async ms=>now+=ms,fetcher:async()=>{calls++;if(calls===1)throw Error('offline');return new Response(JSON.stringify({unlocked:calls<3}));}});assert.equal(result.relogin,true);assert.equal(calls,3);
 await assert.rejects(waitForRestart({timeout:2000,now:()=>now,pause:async ms=>now+=ms,fetcher:async()=>{throw Error('offline');}}),/erreichbar/);
});
test('log rendering filters severity and text while escaping untrusted journal content',async()=>{
 const {renderLogEntries}=await import('../dist/public/server-operations.js');const entries=[{time:'2026-10-07T12:00:00Z',level:'error',message:'<img src=x onerror=alert(1)> failure'},{time:'2026-10-07T12:01:00Z',level:'info',message:'Started'}];
 const html=renderLogEntries(entries,{level:'error',search:'failure'});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|Started/);assert.match(renderLogEntries(entries,{level:'warn',search:''}),/Keine passenden/);
});
test('a journal failure preserves a successful server status and reports its own error',async()=>{
 const {readServerPanel}=await import('../dist/public/server-operations.js');const result=await readServerPanel(async path=>{if(path.endsWith('/logs'))throw Error('Protokoll nicht verfügbar');return {available:true,state:'idle'};});assert.equal(result.status.available,true);assert.equal(result.logs,undefined);assert.match(result.errors.join(' '),/Protokoll/);
});
