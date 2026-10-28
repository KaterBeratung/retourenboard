import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {postgresFixture} from './helpers/postgres.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';
import {defaultPermissions} from '../dist/shared/permissions.js';

async function fixture(t,options={}){
 const f=await runtimeFixture(t,options),{auth}=await f.setup();
 const product=await f.app.store.createProduct({name:'Kundenprodukt <Monitor>',sku:'CUSTOMER-1',priceCents:19999});
 const row=await f.app.store.createReturn({productId:product.id,serialNumber:'PRIVATE-SERIAL',replacementSerialNumber:'PRIVATE-REPLACEMENT',customerReference:'PRIVATE-CUSTOMER',orderNumber:'PRIVATE-ORDER',notes:'PRIVATE-NOTE',nextStep:'PRIVATE-NEXT'});
 const url='/api/returns/'+row.id+'/customer-status';
 const create=async(input={})=>{if(Array.isArray(input.commentIds)&&!Object.hasOwn(input,'commentVersions')){const page=await(await f.request(url+'/comments','GET',undefined,auth)).json();input={...input,commentVersions:Object.fromEntries(page.items.filter(c=>input.commentIds.includes(c.id)).map(c=>[c.id,c.version]))};}const response=await f.request(url,'POST',{revision:0,days:30,publicNote:'Wir prüfen dein Gerät.',...input},auth);assert.equal(response.status,201,await response.clone().text());return response.json();};
 const publicPath=share=>'/api/public/return-status/'+share.path.split('/').at(-1);
 return {...f,auth,product,row,url,create,publicPath};
}

test('customer sharing is an explicit administrative permission by default',()=>{
 assert.equal(defaultPermissions('admin').returnsShare,true);
 assert.equal(defaultPermissions('member').returnsShare,false);
 assert.equal(defaultPermissions('viewer').returnsShare,false);
});

test('anonymous customer status exposes an exact allowlist and changes with the real return',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request(f.url)).status,401);
 assert.equal((await f.request('/api/public/return-status/'+'a'.repeat(22))).status,404);
 const share=await f.create();assert.match(share.path,/^\/s\/[A-Za-z0-9_-]{22}$/);assert.equal(share.revision,1);assert.equal(share.active,true);
 const response=await f.request(f.publicPath(share));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('x-robots-tag'),/noindex/);
 const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['isClosed','productName','publicNote','returnNumber','status','statusTone','updatedAt']);assert.equal(data.publicNote,'Wir prüfen dein Gerät.');assert.equal(data.returnNumber,f.row.returnNumber);assert.equal(data.productName,f.product.name);
 const serialized=JSON.stringify(data);for(const secret of ['PRIVATE-SERIAL','PRIVATE-REPLACEMENT','PRIVATE-CUSTOMER','PRIVATE-ORDER','PRIVATE-NOTE','PRIVATE-NEXT','19999'])assert.ok(!serialized.includes(secret),secret);
 const status=(await f.app.store.masters.all()).statuses.find(x=>x.tone==='checking');await f.app.store.updateReturn(f.row.id,{...f.row,statusId:status.id});assert.equal((await(await f.request(f.publicPath(share))).json()).status,status.name);
 const page=await f.request(share.path);assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.equal(page.headers.get('set-cookie'),null);assert.ok(!(await page.text()).includes('PRIVATE-NOTE'));
 assert.equal((await f.request('/api/returns/'+f.row.id)).status,401);assert.equal((await f.request('/customer-status.js')).status,401);assert.equal((await f.request('/customer-status-public.js')).status,200);
 const raw=(await f.app.store.db.query('SELECT tokenHash,tokenEnc FROM return_shares')).rows[0];assert.ok(!JSON.stringify(raw).includes(share.path.split('/').at(-1)),'raw link token must not be stored');
});

test('sharing requires CSRF and a fresh explicit permission; a member can be granted it',async t=>{
 const f=await fixture(t),member=await(await f.request('/api/users','POST',{username:'Sharer',role:'member',password:testPassword},f.auth)).json();const viewer=await(await f.request('/api/users','POST',{username:'ShareReader',role:'viewer',password:testPassword},f.auth)).json();
 const memberAuth=(await f.login('Sharer')).auth,viewerAuth=(await f.login('ShareReader')).auth;
 for(const auth of [{},memberAuth,viewerAuth])assert.equal((await f.request(f.url,'POST',{revision:0},auth)).status,Object.keys(auth).length?403:401);
 assert.equal((await f.request(f.url,'POST',{revision:0},{Cookie:f.auth.Cookie})).status,403);
 await f.app.users.update(member.id,{permissions:{...member.permissions,returnsShare:true}});
 const created=await f.request(f.url,'POST',{revision:0,days:7,publicNote:''},memberAuth);assert.equal(created.status,201);const share=await created.json();
 await f.app.users.update(member.id,{permissions:{...member.permissions,returnsShare:false}});
 assert.equal((await f.request(f.url,'PUT',{revision:share.revision,publicNote:'NO'},memberAuth)).status,403);assert.equal((await f.request(f.publicPath(share))).status,404,'creator losing permission disables public access');
 assert.equal((await f.request(f.url,'GET',undefined,viewerAuth)).status,403);assert.equal(viewer.role,'viewer');
});

test('expiration, rotation, revocation and return deletion invalidate old links without resurrection',async t=>{
 let clock=Date.parse('2026-10-28T12:00:00Z');const f=await fixture(t,{now:()=>clock}),first=await f.create();
 assert.equal(Date.parse(first.expiresAt)-clock,30*86400000);const reopened=await(await f.request(f.url,'GET',undefined,f.auth)).json();assert.equal(reopened.path,first.path,'link remains copyable on reopening');
 clock+=30*86400000;Object.assign(f.auth,(await f.login('Admin')).auth);assert.equal((await f.request(f.publicPath(first))).status,404);
 assert.equal((await f.request(f.url,'PUT',{revision:first.revision,days:30,publicNote:'expired'},f.auth)).status,409,'saving a stale dialog cannot reactivate an expired URL');
 assert.equal((await f.request(f.publicPath(first))).status,404);
 const second=await f.create({revision:first.revision,days:7});assert.notEqual(second.path,first.path);assert.equal((await f.request(f.publicPath(first))).status,404);assert.equal((await f.request(f.publicPath(second))).status,200);
 const revoked=await(await f.request(f.url,'DELETE',{revision:second.revision},f.auth)).json();assert.equal(revoked.active,false);assert.equal(revoked.path,null);assert.equal((await f.request(f.publicPath(second))).status,404);
 assert.equal((await f.request(f.url,'POST',{revision:second.revision},f.auth)).status,409,'a stale tab cannot recreate a revoked grant');
 const third=await f.create({revision:revoked.revision});await f.app.store.deleteReturn(f.row.id);assert.equal((await f.request(f.publicPath(third))).status,404);
});

test('parallel sharing edits conflict, public hints are explicit and bounded, and invalid links are uniform',async t=>{
 const f=await fixture(t);const responses=await Promise.all([f.request(f.url,'POST',{revision:0},f.auth),f.request(f.url,'POST',{revision:0},f.auth)]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);const share=await responses.find(r=>r.status===201).json();
 const updated=await(await f.request(f.url,'PUT',{revision:share.revision,days:30,publicNote:'<script>alert(1)</script> & Nachricht'},f.auth)).json();assert.equal(updated.path,share.path);assert.equal((await(await f.request(f.publicPath(share))).json()).publicNote,'<script>alert(1)</script> & Nachricht');
 assert.equal((await f.request(f.url,'PUT',{revision:share.revision,publicNote:'stale'},f.auth)).status,409);
 for(const input of [{revision:updated.revision,days:0},{revision:updated.revision,days:365},{revision:updated.revision,publicNote:'x'.repeat(1001)},{revision:updated.revision,publicNote:{}}])assert.equal((await f.request(f.url,'PUT',input,f.auth)).status,400);
 for(const code of ['1','a'.repeat(22),'../private'])assert.equal((await f.request('/api/public/return-status/'+encodeURIComponent(code))).status,404);
});

test('customer status requests are rate limited with a bounded retry interval',async t=>{
 const f=await fixture(t);let last;for(let i=0;i<61;i++)last=await f.request('/api/public/return-status/'+'z'.repeat(22));assert.equal(last.status,429);assert.ok(Number(last.headers.get('retry-after'))>0);
});

test('portable backups retain business data while excluding public grants so restores cannot revive links',async t=>{
 const f=await fixture(t);await f.create();assert.equal((await f.app.store.db.query('SELECT COUNT(*) AS n FROM return_shares')).rows[0].n,1);
 const path=join(f.dataDir,'share-backup.jsonl');await exportData(f.app.store.db,path);const content=readFileSync(path,'utf8');assert.equal(JSON.parse(content.split('\n')[0]).schema,5,'portable business data includes disposal comments');assert.ok(!content.includes('return_shares'));assert.ok(!content.includes('Wir prüfen dein Gerät.'));
 const target=await postgresFixture(t);await importData(target.database,path);assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM returns')).rows[0].n,1);assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM return_shares')).rows[0].n,0);
});

test('sharing options remove disabled values from the anonymous response and survive reopening',async t=>{
 const f=await fixture(t),share=await f.create({options:{showProduct:false,showUpdated:false,showPublicNote:false}});
 assert.deepEqual(share.options,{showProduct:false,showUpdated:false,showPublicNote:false});
 const response=await(await f.request(f.publicPath(share))).json();
 assert.deepEqual(Object.keys(response).sort(),['isClosed','returnNumber','status','statusTone']);
 const reopened=await(await f.request(f.url,'GET',undefined,f.auth)).json();assert.equal(reopened.path,share.path);assert.deepEqual(reopened.options,share.options);
 const saved=await(await f.request(f.url,'PUT',{revision:share.revision,options:{showProduct:true,showUpdated:true,showPublicNote:true},publicNote:'Visible'},f.auth)).json();
 assert.equal((await(await f.request(f.publicPath(saved))).json()).productName,f.product.name);
});

test('only selected comment snapshots are public, without authors or mentions, and deleted sources disappear',async t=>{
 const f=await fixture(t),add=async text=>(await(await f.request('/api/returns/'+f.row.id+'/comments','POST',{text},f.auth)).json());
 const chosen=await add('Pruefung abgeschlossen. @Admin meldet sich. <script>plain</script>'),internal=await add('PRIVATE INTERNAL COMMENT');
 const share=await f.create({commentIds:[chosen.id]});
 const first=await(await f.request(f.publicPath(share))).json();assert.deepEqual(first.comments,[{text:'Pruefung abgeschlossen. @Team meldet sich. <script>plain</script>',createdAt:chosen.createdAt}]);
 for(const secret of ['PRIVATE INTERNAL COMMENT','author','mentions','username','displayName','@Admin'])assert.ok(!JSON.stringify(first).includes(secret),secret);
 await f.request('/api/returns/'+f.row.id+'/comments/'+chosen.id,'PUT',{text:'PRIVATE LATER EDIT'},f.auth);
 const saved=await(await f.request(f.url,'PUT',{revision:share.revision,commentIds:[chosen.id],publicNote:'Update'},f.auth)).json();
 assert.equal((await(await f.request(f.publicPath(saved))).json()).comments[0].text,first.comments[0].text,'saving other settings must preserve a published snapshot');
 const extra=await add('NEW INTERNAL COMMENT');assert.ok(!(await(await f.request(f.publicPath(saved))).text()).includes('NEW INTERNAL COMMENT'));
 assert.ok(internal.id!==extra.id);
 await f.request('/api/returns/'+f.row.id+'/comments/'+chosen.id,'DELETE',{},f.auth);
 assert.equal((await(await f.request(f.publicPath(saved))).json()).comments,undefined);
 const revoked=await f.request(f.url,'DELETE',{revision:saved.revision},f.auth);assert.equal(revoked.status,200);assert.equal((await f.request(f.publicPath(saved))).status,404);
});

test('sharing rejects malformed options and foreign, deleted, duplicate or excessive comment selections',async t=>{
 const f=await fixture(t),other=await f.app.store.createReturn({productId:f.product.id,serialNumber:'OTHER'});
 const foreign=await(await f.request('/api/returns/'+other.id+'/comments','POST',{text:'PRIVATE OTHER RETURN'},f.auth)).json();
 const deleted=await(await f.request('/api/returns/'+f.row.id+'/comments','POST',{text:'deleted'},f.auth)).json();await f.request('/api/returns/'+f.row.id+'/comments/'+deleted.id,'DELETE',{},f.auth);
 for(const input of [{options:{showProduct:'false'}},{options:{showSecret:true}},{options:[]},{commentIds:[foreign.id]},{commentIds:[deleted.id]},{commentIds:[1,1]},{commentIds:Array.from({length:21},(_,i)=>i+1)},{commentIds:['1']},{commentIds:null}]){
  assert.equal((await f.request(f.url,'POST',{revision:0,...input},f.auth)).status,400,JSON.stringify(input));
 }
 assert.equal((await f.request(f.url,'GET',undefined,f.auth)).status,200);
});

test('comment choices are separately permission checked, paginated and contain only publishable text',async t=>{
 const f=await fixture(t),at='2026-10-28T12:00:00.000Z',admin=(await f.app.users.list()).find(x=>x.username==='Admin');
 for(let i=0;i<52;i++)await f.app.store.db.query('INSERT INTO return_comments(returnId,authorId,text,createdAt) VALUES($1,$2,$3,$4)',[f.row.id,admin.id,'Choice '+i+' @Admin',at]);
 const path=f.url+'/comments';assert.equal((await f.request(path)).status,401);
 const first=await(await f.request(path,'GET',undefined,f.auth)).json();assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.deepEqual(Object.keys(first.items[0]).sort(),['createdAt','id','text','version']);assert.ok(first.items[0].text.endsWith('@Team'));
 const next=await(await f.request(path+'?before='+first.items.at(-1).id,'GET',undefined,f.auth)).json();assert.equal(next.items.length,2);assert.equal(next.hasMore,false);
 assert.equal((await f.request(path+'?before=invalid','GET',undefined,f.auth)).status,400);
});

test('schema6 upgrades preserve existing links and default visibility without publishing comments',async t=>{
 const f=await fixture(t),share=await f.create();
 await f.app.store.db.query('ALTER TABLE return_shares DROP COLUMN options, DROP COLUMN publishedComments');await f.app.store.db.query('DROP TABLE disposal_shares,disposal_comments');await f.app.store.db.query('DELETE FROM schema_migrations WHERE version>=7');
 const {migratePostgres}=await import('../dist/server/database/migrations.js');await migratePostgres(f.app.store.db);await migratePostgres(f.app.store.db);
 const reopened=await(await f.request(f.url,'GET',undefined,f.auth)).json();assert.equal(reopened.path,share.path);assert.deepEqual(reopened.options,{showProduct:true,showUpdated:true,showPublicNote:true});assert.deepEqual(reopened.selectedComments,[]);
 assert.equal((await(await f.request(f.publicPath(share))).json()).publicNote,'Wir prüfen dein Gerät.');
});

test('a comment changed after preview requires a new review before first publication',async t=>{
 const f=await fixture(t),path='/api/returns/'+f.row.id+'/comments';
 const comment=await(await f.request(path,'POST',{text:'Reviewed public text'},f.auth)).json();
 const choices=await(await f.request(f.url+'/comments','GET',undefined,f.auth)).json(),choice=choices.items.find(c=>c.id===comment.id);
 await f.request(path+'/'+comment.id,'PUT',{text:'PRIVATE EDIT AFTER PREVIEW'},f.auth);
 const stale=await f.request(f.url,'POST',{revision:0,commentIds:[comment.id],commentVersions:{[comment.id]:choice.version}},f.auth);assert.equal(stale.status,409,'changing the source must invalidate the reviewed choice');
 const fresh=await(await f.request(f.url+'/comments','GET',undefined,f.auth)).json(),next=fresh.items.find(c=>c.id===comment.id);assert.notEqual(next.version,choice.version);
 const missing=await f.request(f.url,'POST',{revision:0,commentIds:[comment.id]},f.auth);assert.equal(missing.status,409,'new comments cannot be shared without a reviewed version');
 const saved=await(await f.request(f.url,'POST',{revision:0,commentIds:[comment.id],commentVersions:{[comment.id]:next.version}},f.auth)).json();assert.equal((await(await f.request(f.publicPath(saved))).json()).comments[0].text,'PRIVATE EDIT AFTER PREVIEW');
});
