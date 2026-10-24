import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createServiceControlHandler} from '../dist/server/service-control-routes.js';
import {createLinuxServiceControl} from '../dist/server/service-control.js';

test('an update body arriving across restart reservation cannot start an update',async t=>{
 let observe,observed=false,release,starts=0;const checked=new Promise(r=>observe=r),execute=new Promise(r=>release=r);
 const control=createLinuxServiceControl({updateStatus:()=>({state:'idle'}),execute:async()=>{await execute;return {stdout:''};}});
 const serviceControl={...control,status(){if(!observed){observed=true;observe();}return control.status();}};
 const worker={status:()=>({state:'idle'}),start(){starts++;return {state:'queued'};}};
 const server=createServer(createServiceControlHandler({worker,serviceControl}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 let slow;t.after(async()=>{release();slow?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const result=new Promise((resolve,reject)=>{slow=request(base+'/start',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});slow.on('error',reject);});
 slow.write('{"id":');await checked;
 const reservation=await fetch(base+'/server/restart/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(reservation.status,202);const {id}=await reservation.json();
 const commit=await fetch(base+'/server/restart/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});assert.equal(commit.status,202);assert.equal((await commit.json()).state,'restarting');
 slow.end('"update-job","version":"99.0.0"}');const response=await result;assert.equal(response.status,409);assert.match(response.body.error,/neustart/i);assert.equal(starts,0);
});

test('privileged control rejects extra commands, array bodies and invalid job identities',async t=>{
 let executions=0,starts=0;const serviceControl=createLinuxServiceControl({updateStatus:()=>({state:'idle'}),execute:async()=>{executions++;return {stdout:''};}});
 const server=createServer(createServiceControlHandler({worker:{status:()=>({state:'idle'}),start:()=>{starts++;}},serviceControl}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});const base=`http://127.0.0.1:${server.address().port}`;
 for(const [path,input] of [['/server/restart/prepare',{unit:'other.service'}],['/server/restart/prepare',[]],['/server/restart/commit',{id:'wrong'}],['/start',{id:'x',version:'9.0.0',command:'reboot'}]]){
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(res.status,400,path);
 }
 assert.equal(executions,0);assert.equal(starts,0);
});
