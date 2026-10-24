import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture,testPassword} from './helpers/runtime.js';

async function fixture(t){
 const f=await runtimeFixture(t),{auth,data}=await f.setup();
 const member=await(await f.request('/api/users','POST',{username:'Handler',displayName:'Bisheriger Name',password:testPassword},auth)).json();
 const other=await(await f.request('/api/users','POST',{username:'OtherHandler',displayName:'Bisheriger Name',password:testPassword},auth)).json();
 const product=await f.app.store.createProduct({name:'Name test',sku:'NAME-1'});
 const assigned=await f.app.store.createReturn({productId:product.id,serialNumber:'NAME-SN-1',assignedUserId:member.id});
 const untouched=await f.app.store.createReturn({productId:product.id,serialNumber:'NAME-SN-2',assignedUserId:other.id});
 return {...f,auth,admin:data.user,member,other,product,assigned,untouched,memberAuth:(await f.login(member.username)).auth};
}
test('a profile rename updates existing return assignments by account ID without rewriting return history',async t=>{
 const f=await fixture(t),before=await f.app.store.db.query('SELECT * FROM audit ORDER BY id');
 const saved=await f.request('/api/account/profile','PUT',{displayName:' Neuer Name '},f.memberAuth);assert.equal(saved.status,200);
 for(const row of [await f.app.store.getReturn(f.assigned.id),await f.app.store.findReturn(f.assigned.returnNumber),...(await f.app.store.listReturns()).filter(r=>r.id===f.assigned.id)])assert.equal(row.assignedDisplayName,'Neuer Name');
 assert.equal((await f.app.store.getReturn(f.untouched.id)).assignedDisplayName,'Bisheriger Name','Equal labels must not merge different accounts');
 const response=await f.request('/api/returns','GET',undefined,f.auth);assert.equal((await response.json()).find(r=>r.id===f.assigned.id).assignedDisplayName,'Neuer Name');
 const exported=await(await f.request('/api/export/all','GET',undefined,f.auth)).json();assert.equal(exported.returns.find(r=>r.returnNumber===f.assigned.returnNumber).assignedUserId,f.member.id,'Portable references keep the stable account ID');
 assert.equal((await f.app.store.getReturn(f.assigned.id)).updatedAt,f.assigned.updatedAt,'A rename is not an edit to the return');
 assert.deepEqual((await f.app.store.db.query('SELECT * FROM audit WHERE id<=$1 ORDER BY id',[before.rows.at(-1).id])).rows,before.rows,'Stored history must retain its original evidence');
 const directory=await(await f.request('/api/returns/assignees','GET',undefined,f.auth)).json();assert.equal(directory.find(u=>u.id===f.member.id).displayName,'Neuer Name');
});
test('an admin rename also resolves current names on inactive assignees and when a return is edited',async t=>{
 const f=await fixture(t),response=await f.request('/api/users/'+f.member.id,'PUT',{displayName:'Adminänderung',active:false},f.auth);assert.equal(response.status,200);
 assert.equal((await f.app.store.getReturn(f.assigned.id)).assignedDisplayName,'Adminänderung');
 const updated=await f.app.store.updateReturn(f.assigned.id,{...f.assigned,nextStep:'Check device'});assert.equal(updated.assignedDisplayName,'Adminänderung');
 assert.equal((await f.app.store.getReturn(f.untouched.id)).assignedDisplayName,'Bisheriger Name');
 await f.app.store.db.query("UPDATE returns SET assignedUserId=NULL,assignedDisplayName=$1 WHERE id=$2",['Übernommener Name',f.untouched.id]);
 assert.equal((await f.app.store.getReturn(f.untouched.id)).assignedDisplayName,'Übernommener Name','A reference without a resolvable account retains its stored fallback');
});
test('existing direct chats, messages and return comments read the current profile name',async t=>{
 const f=await fixture(t),channel=await(await f.request('/api/chat/channels','POST',{kind:'direct',userId:f.member.id},f.auth)).json();
 await f.request('/api/chat/channels/'+channel.id+'/messages','POST',{text:'Existing message'},f.memberAuth);
 await f.request('/api/returns/'+f.assigned.id+'/comments','POST',{text:'Existing comment'},f.memberAuth);
 await f.request('/api/account/profile','PUT',{displayName:'Aktuelle Person'},f.memberAuth);
 const chat=await(await f.request('/api/chat/channels/'+channel.id,'GET',undefined,f.auth)).json();assert.equal(chat.name,'Aktuelle Person');
 for(const path of ['/api/chat/channels/'+channel.id+'/messages','/api/returns/'+f.assigned.id+'/comments']){const result=await(await f.request(path,'GET',undefined,f.auth)).json();assert.equal(result.items[0].author.displayName,'Aktuelle Person');}
 const people=await(await f.request('/api/collaboration/users','GET',undefined,f.auth)).json();assert.equal(people.find(u=>u.id===f.member.id).displayName,'Aktuelle Person');
});
