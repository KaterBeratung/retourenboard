import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {postgresFixture} from './helpers/postgres.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';
import {defaultPermissions} from '../dist/shared/permissions.js';

async function fixture(t,options={}){
 const f=await runtimeFixture(t,options),{auth}=await f.setup();
 const created=await f.request('/api/disposals','POST',{productName:'Kundengeraet <SSD>',serialNumber:'PRIVATE-SERIAL',mode:'erase',location:'PRIVATE-LOCATION',ownerReference:'PRIVATE-OWNER',reason:'PRIVATE-REASON',notes:'PRIVATE-NOTES'},auth);
 assert.equal(created.status,201,await created.clone().text());const row=await created.json(),comments='/api/disposals/'+row.id+'/comments',share='/api/disposals/'+row.id+'/customer-status';
 const post=async text=>{const r=await f.request(comments,'POST',{text},auth);assert.equal(r.status,201,await r.clone().text());return r.json();};
 const createShare=async(input={})=>{const r=await f.request(share,'POST',{revision:0,days:30,publicNote:'Dein Auftrag wird bearbeitet.',...input},auth);assert.equal(r.status,201,await r.clone().text());return r.json();};
 const publicPath=value=>'/api/public/disposal-status/'+value.path.split('/').at(-1);
 return {...f,auth,row,comments,share,post,createShare,publicPath};
}

test('disposal communication has separate safe permission defaults',()=>{
 const admin=defaultPermissions('admin'),member=defaultPermissions('member'),viewer=defaultPermissions('viewer');
 assert.equal(admin.disposalsShare,true);assert.equal(member.disposalsShare,false);assert.equal(viewer.disposalsShare,false);
 assert.equal(member.disposalsCommentsCreate,true);assert.equal(member.disposalsCommentsModerate,false);assert.equal(viewer.disposalsCommentsCreate,false);
});

test('disposal comments preserve workflow revisions and enforce author/moderator and read permissions',async t=>{
 const f=await fixture(t),member=await(await f.request('/api/users','POST',{username:'Worker',role:'member',password:testPassword},f.auth)).json(),viewer=await(await f.request('/api/users','POST',{username:'Reader',role:'viewer',password:testPassword},f.auth)).json();
 const memberAuth=(await f.login('Worker')).auth,viewerAuth=(await f.login('Reader')).auth;
 assert.equal((await f.request(f.comments)).status,401);
 const ownRes=await f.request(f.comments,'POST',{text:'Interne Absprache @Admin'},memberAuth);assert.equal(ownRes.status,201,await ownRes.clone().text());const own=await ownRes.json();assert.equal(own.author.id,member.id);assert.equal(own.canEdit,true);
 assert.equal((await f.request(f.comments,'GET',undefined,viewerAuth)).status,200);assert.equal((await f.request(f.comments,'POST',{text:'not allowed'},viewerAuth)).status,403);
 assert.equal((await f.request(f.comments+'/'+own.id,'PUT',{text:'Eigene Bearbeitung'},memberAuth)).status,200);
 assert.equal((await f.request(f.comments+'/'+own.id,'PUT',{text:'not my text'},f.auth)).status,403);
 const removed=await f.request(f.comments+'/'+own.id,'DELETE',{},f.auth);assert.equal(removed.status,200);assert.equal((await removed.json()).deleted,true);
 const current=await(await f.request('/api/disposals/'+f.row.id,'GET',undefined,f.auth)).json();assert.equal(current.revision,f.row.revision);assert.equal(current.events.length,1);
 await f.app.users.update(member.id,{permissions:{...member.permissions,disposalsRead:false}});assert.equal((await f.request(f.comments,'GET',undefined,memberAuth)).status,403);assert.equal(viewer.role,'viewer');
});

test('disposal comment IDs cannot be used across orders and drafts start internal',async t=>{
 const f=await fixture(t),comment=await f.post('INTERNAL ONLY'),other=await(await f.request('/api/disposals','POST',{productName:'Other',serialNumber:'OTHER',mode:'destroy'},f.auth)).json();
 assert.equal((await f.request('/api/disposals/'+other.id+'/comments/'+comment.id,'PUT',{text:'foreign'},f.auth)).status,404);
 const s=await f.createShare();assert.equal((await(await f.request(f.publicPath(s))).json()).comments,undefined);
 assert.equal((await f.request(f.comments,'POST',{text:'x'.repeat(4001)},f.auth)).status,400);
 assert.equal((await f.request(f.comments,'POST',{text:'missing csrf'},{Cookie:f.auth.Cookie})).status,403);
});

test('public disposal status uses a fixed allowlist, independent URL and real workflow stages',async t=>{
 const f=await fixture(t);assert.equal((await f.request(f.share)).status,401);assert.equal((await f.request(f.share,'POST',{revision:0},{Cookie:f.auth.Cookie})).status,403);
 const share=await f.createShare();assert.match(share.path,/^\/d\/[A-Za-z0-9_-]{22}$/);
 let r=await f.request(f.publicPath(share)),data=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 assert.deepEqual(Object.keys(data).sort(),['disposalNumber','isClosed','productName','publicNote','recordKind','status','statusKey','statusTone','updatedAt']);assert.equal(data.recordKind,'disposal');assert.equal(data.statusKey,'planned');assert.equal(data.disposalNumber,f.row.disposalNumber);
 for(const text of ['PRIVATE-SERIAL','PRIVATE-LOCATION','PRIVATE-OWNER','PRIVATE-REASON','PRIVATE-NOTES','actor','performedBy','revision'])assert.ok(!JSON.stringify(data).includes(text),text);
 const approved=await(await f.request('/api/disposals/'+f.row.id+'/approve','POST',{revision:f.row.revision},f.auth)).json();assert.equal((await(await f.request(f.publicPath(share))).json()).statusKey,'approved');
 const today=new Date().toISOString().slice(0,10);await f.request('/api/disposals/'+f.row.id+'/complete','POST',{revision:approved.revision,completedOn:today,method:'PRIVATE METHOD',performedBy:'PRIVATE PERFORMER'},f.auth);
 data=await(await f.request(f.publicPath(share))).json();assert.equal(data.statusKey,'completed');assert.equal(data.isClosed,true);assert.ok(!JSON.stringify(data).includes('PRIVATE'));
 const page=await f.request(share.path);assert.equal(page.status,200);assert.equal(page.headers.get('set-cookie'),null);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await f.request(f.publicPath(share),'POST',{})).status,405);assert.equal((await f.request('/api/public/return-status/'+share.path.split('/').at(-1))).status,404);
});

test('disposal comment sharing requires reviewed versions and keeps published copies stable',async t=>{
 const f=await fixture(t),chosen=await f.post('Kundeninformation @Admin'),internal=await f.post('PRIVATE INTERNAL');
 const choices=await(await f.request(f.share+'/comments?ids='+chosen.id+','+internal.id,'GET',undefined,f.auth)).json();assert.equal(choices.items.length,2);assert.deepEqual(Object.keys(choices.items[0]).sort(),['createdAt','id','text','version']);
 const candidate=choices.items.find(c=>c.id===chosen.id),share=await f.createShare({commentIds:[chosen.id],commentVersions:{[chosen.id]:candidate.version}});
 let data=await(await f.request(f.publicPath(share))).json();assert.deepEqual(data.comments,[{text:'Kundeninformation @Team',createdAt:chosen.createdAt}]);assert.ok(!JSON.stringify(data).includes('author'));assert.ok(!JSON.stringify(data).includes('PRIVATE INTERNAL'));
 await f.request(f.comments+'/'+chosen.id,'PUT',{text:'PRIVATE LATER EDIT'},f.auth);
 const saved=await(await f.request(f.share,'PUT',{revision:share.revision,commentIds:[chosen.id],options:{showProduct:false,showUpdated:false,showPublicNote:false}},f.auth)).json();data=await(await f.request(f.publicPath(saved))).json();assert.equal(data.comments[0].text,'Kundeninformation @Team');assert.equal(data.productName,undefined);assert.equal(data.updatedAt,undefined);assert.equal(data.publicNote,undefined);
 await f.request(f.comments+'/'+chosen.id,'DELETE',{},f.auth);assert.equal((await(await f.request(f.publicPath(saved))).json()).comments,undefined);
 const other=await f.post('Reviewed A'),preview=await(await f.request(f.share+'/comments?ids='+other.id,'GET',undefined,f.auth)).json();await f.request(f.comments+'/'+other.id,'PUT',{text:'Unreviewed B'},f.auth);
 assert.equal((await f.request(f.share,'PUT',{revision:saved.revision,commentIds:[other.id],commentVersions:{[other.id]:preview.items[0].version}},f.auth)).status,409);
});

test('disposal sharing obeys permission loss, revocation, rotation, expiry and cancellation',async t=>{
 let clock=Date.parse('2026-10-28T10:00:00Z');const f=await fixture(t,{now:()=>clock});
 const member=await(await f.request('/api/users','POST',{username:'ShareWorker',role:'member',password:testPassword},f.auth)).json(),memberAuth=(await f.login('ShareWorker')).auth;
 assert.equal((await f.request(f.share,'POST',{revision:0},memberAuth)).status,403);await f.app.users.update(member.id,{permissions:{...member.permissions,disposalsShare:true}});
 const first=await(await f.request(f.share,'POST',{revision:0,days:7},memberAuth)).json();assert.equal((await f.request(f.publicPath(first))).status,200);
 await f.app.users.update(member.id,{permissions:{...member.permissions,disposalsShare:false}});assert.equal((await f.request(f.publicPath(first))).status,404);
 const second=await f.createShare({revision:first.revision,days:7});assert.notEqual(second.path,first.path);assert.equal((await f.request(f.publicPath(first))).status,404);
 const cancelled=await f.request('/api/disposals/'+f.row.id+'/cancel','POST',{revision:f.row.revision,reason:'PRIVATE CANCEL REASON'},f.auth);assert.equal(cancelled.status,200);
 const state=await(await f.request(f.publicPath(second))).json();assert.equal(state.statusKey,'cancelled');assert.ok(!JSON.stringify(state).includes('PRIVATE CANCEL REASON'));
 const revoked=await(await f.request(f.share,'DELETE',{revision:second.revision},f.auth)).json();assert.equal((await f.request(f.publicPath(second))).status,404);
 const third=await f.createShare({revision:revoked.revision,days:7});clock+=7*86400000;assert.equal((await f.request(f.publicPath(third))).status,404);
});

test('disposal comments survive portable5 backups while grants stay excluded and schema4 remains readable',async t=>{
 const f=await fixture(t),comment=await f.post('Kept in backup'),share=await f.createShare();
 const file=join(f.dataDir,'communication.jsonl');await exportData(f.app.store.db,file);const lines=readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.equal(lines[0].schema,5);assert.ok(lines.some(line=>line.table==='disposal_comments'));assert.ok(!JSON.stringify(lines).includes('disposal_shares'));assert.ok(!JSON.stringify(lines).includes(share.path.split('/').at(-1)));
 const target=await postgresFixture(t);await importData(target.database,file);assert.equal((await target.database.query('SELECT text FROM disposal_comments WHERE id=$1',[comment.id])).rows[0].text,'Kept in backup');assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM disposal_shares')).rows[0].n,0);
 const old=lines.filter(line=>line.table!=='disposal_comments');old[0].schema=4;delete old[0].sequences.disposal_comments;old.at(-1).tables=old.at(-1).tables.filter(table=>table.name!=='disposal_comments');const oldFile=join(f.dataDir,'schema4.jsonl');writeFileSync(oldFile,old.map(line=>JSON.stringify(line)).join('\n')+'\n');
 const legacy=await postgresFixture(t);await importData(legacy.database,oldFile);assert.equal((await legacy.database.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,1);assert.equal((await legacy.database.query('SELECT COUNT(*) AS n FROM disposal_comments')).rows[0].n,0);
});

test('disposal mentions notify eligible readers once and disappear after read permission is revoked',async t=>{
 const f=await fixture(t),member=await(await f.request('/api/users','POST',{username:'OrderReader',role:'member',password:testPassword},f.auth)).json(),reader=(await f.login('OrderReader')).auth;
 const posted=await f.post('Please review @OrderReader');assert.equal(posted.mentions[0].id,member.id);
 let inbox=await(await f.request('/api/notifications','GET',undefined,reader)).json(),notice=inbox.items.find(n=>n.kind==='disposalMention');assert.ok(notice);assert.equal(notice.href,'/#disposals?record='+f.row.disposalNumber);assert.ok(!notice.message.includes('Please review'));
 await f.request(f.comments+'/'+posted.id,'PUT',{text:'Updated @OrderReader'},f.auth);inbox=await(await f.request('/api/notifications','GET',undefined,reader)).json();assert.equal(inbox.items.filter(n=>n.kind==='disposalMention').length,1);
 await f.app.users.update(member.id,{permissions:{...member.permissions,disposalsRead:false}});inbox=await(await f.request('/api/notifications','GET',undefined,reader)).json();assert.ok(!inbox.items.some(n=>n.kind==='disposalMention'));
});
