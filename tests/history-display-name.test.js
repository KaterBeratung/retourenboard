import test from './helpers/postgres-context.js';import assert from 'node:assert/strict';
import {runtimeFixture,testPassword} from './helpers/runtime.js';

async function fixture(t){
 const f=await runtimeFixture(t),{auth,data}=await f.setup();
 await f.request('/api/account/profile','PUT',{displayName:'Alexander'},auth);
 const product=await(await f.request('/api/products','POST',{name:'History device',sku:'HISTORY-NAME'},auth)).json();
 const ret=await(await f.request('/api/returns','POST',{productId:product.id,serialNumber:'HISTORY-SN',assignedUserId:data.user.id},auth)).json();
 const updated=await f.request('/api/returns/'+ret.id,'PUT',{...ret,statusId:13,nextStep:'Prüfung abschließen'},auth);assert.equal(updated.status,200);
 const attachment=(await f.app.store.db.query('INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ret.id,'Historie.pdf','history-fixture.pdf','application/pdf',12,new Date().toISOString()])).rows[0].id;
 await f.app.store.withActor({id:data.user.id,name:'Alexander',source:'user'},()=>f.app.store.recordChange({entity:'attachments',id:attachment,action:'create',after:{returnId:ret.id,originalName:'Historie.pdf'}}));
 await f.request('/api/returns/'+ret.id+'/comments','POST',{text:'Bestehender Kommentar'},auth);
 const disposal=await(await f.request('/api/disposals','POST',{productName:'History disk',serialNumber:'HISTORY-DISK',mode:'erase'},auth)).json();
 await f.request('/api/disposals/'+disposal.id+'/approve','POST',{revision:disposal.revision},auth);
 return {...f,auth,admin:data.user,ret,disposal};
}
const get=async(f,path)=>{const r=await f.request(path,'GET',undefined,f.auth);assert.equal(r.status,200,await r.clone().text());return r.json();};

test('existing return activity uses the current account name for creation, status, assignment, next step, uploads and comments',async t=>{
 const f=await fixture(t),path='/api/returns/'+f.ret.id+'/timeline',before=await get(f,path),page=await get(f,path+'?limit=2'),audit=(await f.app.store.db.query('SELECT * FROM audit ORDER BY id')).rows;
 assert.deepEqual(new Set(before.items.map(e=>e.type)),new Set(['created','status','assignment','nextStep','attachment','comment']));
 assert.ok(before.items.every(e=>e.actorName==='Alexander'));
 await f.request('/api/account/profile','PUT',{displayName:'Alextest2'},f.auth);
 const after=await get(f,path);assert.ok(after.items.every(e=>e.actorName==='Alextest2'),'Every existing event for this account must display its new name');
 assert.deepEqual(after.items.map(e=>[e.id,e.at,e.type]),before.items.map(e=>[e.id,e.at,e.type]));
 const older=await get(f,path+'?limit=2&before='+encodeURIComponent(page.nextCursor));assert.ok(older.items.every(e=>e.actorName==='Alextest2'));assert.ok(older.items.every(e=>!page.items.some(first=>first.id===e.id)));
 assert.deepEqual((await f.app.store.db.query('SELECT * FROM audit WHERE id<=$1 ORDER BY id',[audit.at(-1).id])).rows,audit,'Original stored events remain intact');
});
test('audit history, actor filters and text search use current names while preserving literal before/after changes',async t=>{
 const f=await fixture(t),path='/api/admin/audit?entity=returns&actorId='+f.admin.id,before=await get(f,path);
 await f.request('/api/account/profile','PUT',{displayName:'Alextest2'},f.auth);
 const after=await get(f,path);assert.ok(after.items.length>0);assert.ok(after.items.every(e=>e.actorName==='Alextest2'));
 assert.deepEqual(after.items.map(e=>[e.id,e.createdAt,e.changes]),before.items.map(e=>[e.id,e.createdAt,e.changes]));
 const actors=await get(f,'/api/admin/audit/actors');assert.equal(actors.find(u=>u.id===f.admin.id).name,'Alextest2');
 assert.equal((await get(f,path+'&query=Alextest2')).total,after.total);assert.equal((await get(f,path+'&query=Alexander')).total,after.total);
 const first=await get(f,path+'&pageSize=10&page=1');assert.equal(first.total,after.total);
});
test('existing disposal history resolves the same current actor without rewriting event snapshots',async t=>{
 const f=await fixture(t),stored=(await f.app.store.db.query('SELECT * FROM disposal_events ORDER BY id')).rows;
 await f.request('/api/account/profile','PUT',{displayName:'Alextest2'},f.auth);
 const result=await get(f,'/api/disposals/'+f.disposal.id);assert.ok(result.events.every(e=>e.actorName==='Alextest2'));
 assert.deepEqual((await f.app.store.db.query('SELECT * FROM disposal_events ORDER BY id')).rows,stored);
 assert.equal(result.events[0].snapshot.details.createdByName,'Alexander');
});
test('name resolution follows account IDs, includes inactive accounts and retains recorded names for deleted or unlinked actors',async t=>{
 const f=await runtimeFixture(t),{auth,data}=await f.setup();f.auth=auth;
 const one=await f.app.users.create({username:'HistoryOne',displayName:'Gleicher Name',password:testPassword}),two=await f.app.users.create({username:'HistoryTwo',displayName:'Gleicher Name',password:testPassword}),product=await f.app.store.createProduct({name:'IDs',sku:'HISTORY-IDS'});
 const create=(actor,serial)=>f.app.store.withActor(actor,()=>f.app.store.createReturn({productId:product.id,serialNumber:serial}));
 const ret=await create({id:one.id,name:'Gleicher Name',source:'user'},'ONE'),other=await create({id:two.id,name:'Gleicher Name',source:'user'},'TWO'),legacy=await create({id:null,name:'Gleicher Name',source:'system'},'LEGACY');
 await f.app.users.update(one.id,{displayName:'Aktueller Name',active:false});
 assert.equal((await get(f,'/api/returns/'+ret.id+'/timeline')).items[0].actorName,'Aktueller Name');
 for(const row of [other,legacy])assert.equal((await get(f,'/api/returns/'+row.id+'/timeline')).items[0].actorName,'Gleicher Name');
 await f.app.users.remove(one.id,data.user.id);await f.app.users.create({username:'HistoryOne',displayName:'Anderes Konto',password:testPassword});
 assert.equal((await get(f,'/api/returns/'+ret.id+'/timeline')).items[0].actorName,'Gleicher Name');
});
