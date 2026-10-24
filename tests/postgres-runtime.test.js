import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {postgresFixture} from './helpers/postgres.js';
import {createRuntime} from '../dist/server/runtime.js';
import {createApp} from '../dist/server/app.js';
const password='Runtime-PostgreSQL-password!';
async function fixture(t,options={}){
 let runtime;t.after(async()=>{await runtime?.close();});
 const f=await postgresFixture(t);runtime=createRuntime({databaseConfig:f.config,internalSchema:f.schema,dataDir:f.dataDir,port:0,host:'127.0.0.1',...options});await runtime.start();
 const base='http://127.0.0.1:'+runtime.current().server.address().port;
 const request=(path,method='GET',body,headers={})=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});
 return {...f,runtime,base,request};
}

test('PostgreSQL HTTP runtime retains login protection and does not serialize unresolved database promises',async t=>{
 const {request,runtime}=await fixture(t);
 assert.equal((await request('/')).status,302);assert.equal((await request('/app.js')).status,401);
 const health=await(await request('/health')).json();assert.equal(health.ok,true);assert.equal(health.databaseEngine,'postgresql');
 let session=await(await request('/api/session')).json();assert.equal(session.setupRequired,true);assert.equal(session.unlocked,false);assert.equal(typeof session.version,'string');
 const setup=await request('/api/setup','POST',{username:'Admin',password,displayName:'Administrator'});assert.equal(setup.status,201,await setup.clone().text());
 session=await setup.json();assert.equal(session.user.username,'Admin');assert.equal(session.user.role,'admin');assert.equal(session.setupRequired,false);
 const auth={Cookie:setup.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken};
 assert.equal((await request('/app.js','GET',undefined,auth)).status,200);
 const product=await request('/api/products','POST',{name:'PostgreSQL Monitor',sku:'PG-HTTP'},auth);assert.equal(product.status,201,await product.clone().text());
 const p=await product.json();assert.equal(p.name,'PostgreSQL Monitor');assert.equal(typeof p.id,'number');
 const list=await(await request('/api/products','GET',undefined,auth)).json();assert.equal(list[0].sku,'PG-HTTP');
 await runtime.current().users.create({username:'Viewer',password,role:'viewer'});
 const login=await request('/api/login','POST',{username:'Viewer',password});assert.equal(login.status,200,await login.clone().text());const data=await login.json();
 const viewer={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};
 assert.equal((await request('/api/products','POST',{name:'Denied',sku:'DENIED'},viewer)).status,403);
 assert.equal((await request('/api/users','GET',undefined,viewer)).status,403);
});

test('PostgreSQL startup maintenance exposes health only and starts no mail or backup work',async t=>{
 const {request,runtime}=await fixture(t,{maintenance:true});
 assert.equal((await request('/health')).status,200);
 for(const [path,method]of [['/login','GET'],['/api/session','GET'],['/api/setup','POST']])assert.equal((await request(path,method,method==='POST'?{username:'Admin',password}:undefined)).status,503);
 assert.equal((await runtime.current().jobs.status()).running,false);
 assert.equal((await runtime.current().store.db.query('SELECT COUNT(*) AS n FROM backup_jobs')).rows[0].n,0);
});

test('two PostgreSQL runtimes cannot concurrently own one application schema',async t=>{
 const f=await fixture(t),second=createRuntime({databaseConfig:f.config,internalSchema:f.schema,dataDir:f.dataDir,port:0,host:'127.0.0.1'});
 try{await assert.rejects(second.start(),/Instanz|bereits|verwendet/);}finally{await second.close();}
 assert.equal((await f.request('/health')).status,200);
});

test('legacy SQLite input without PostgreSQL configuration fails before touching its source',async t=>{
 const f=await postgresFixture(t),dbPath=join(f.dataDir,'retouren.sqlite'),bytes=Buffer.from('unchanged legacy source');writeFileSync(dbPath,bytes);
 await assert.rejects(createApp({dbPath,dataDir:f.dataDir,port:0}),/PostgreSQL|migrier|DATABASE_URL/);
 assert.deepEqual(readFileSync(dbPath),bytes);
});

test('PostgreSQL HTTP feature routes return populated returns, timeline, chat and settings history',async t=>{
 const f=await fixture(t),setup=await f.request('/api/setup','POST',{username:'Admin',password}),login=await setup.json();assert.equal(setup.status,201);
 const auth={Cookie:setup.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.csrfToken};
 const p=await(await f.request('/api/products','POST',{name:'Routes',sku:'ROUTES'},auth)).json();
 const created=await f.request('/api/returns','POST',{productId:p.id,serialNumber:'ROUTE-001',receiptDate:'2026-10-15'},auth);assert.equal(created.status,201,await created.clone().text());const ret=await created.json();
 for(const path of ['/api/returns','/api/returns/assignees','/api/chat/channels']){const response=await f.request(path,'GET',undefined,auth);assert.equal(response.status,200,path+': '+await response.clone().text());const data=await response.json();assert.ok(Array.isArray(data),path);assert.ok(data.length,path);}
 const timeline=await f.request(`/api/returns/${ret.id}/timeline`,'GET',undefined,auth);assert.equal(timeline.status,200,await timeline.clone().text());assert.equal((await timeline.json()).items[0].type,'created');
 const update=await f.request('/api/admin/settings','PUT',{uploadMaxMb:12},auth);assert.equal(update.status,200,await update.clone().text());assert.equal((await update.json()).settings.uploadMaxMb,12);
 const history=(await f.runtime.current().store.db.query("SELECT changes FROM audit WHERE entity='serverSettings' ORDER BY id DESC LIMIT 1")).rows[0];assert.equal(JSON.parse(history.changes).uploadMaxMb.after,12);
});
