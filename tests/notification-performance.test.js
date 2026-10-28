import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/runtime.js';

test('notification pruning checks repeated targets once and rechecks access on the next request',async t=>{
 const f=await runtimeFixture(t),{auth,data}=await f.setup(),db=f.app.store.db;
 const response=await f.request('/api/chat/channels','POST',{kind:'group',name:'Performance fixture',visibility:'private',memberIds:[]},auth);assert.equal(response.status,201);const group=await response.json();
 await db.query("INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) SELECT 'perf:'||g,$1,'chatMessage','Synthetic','Synthetic',$2,'2026-10-28T12:00:00Z' FROM generate_series(1,200) g",[data.user.id,'/chat#channel-'+group.id]);
 const original=db.query.bind(db);let checks=0;db.query=async(sql,...rest)=>{if(/^SELECT .*FROM chat_channels WHERE id=/.test(sql))checks++;return original(sql,...rest);};
 try{let list=await (await f.request('/api/notifications','GET',undefined,auth)).json();assert.equal(list.total,200);assert.ok(checks<=1,`Repeated channel lookups: ${checks}`);
  await original('DELETE FROM chat_members WHERE channelId=$1 AND userId=$2',[group.id,data.user.id]);checks=0;
  list=await (await f.request('/api/notifications','GET',undefined,auth)).json();assert.equal(list.total,0);assert.ok(checks<=1);
 }finally{db.query=original;}
});

test('notification pruning batches invalid entries and keeps other accounts untouched',async t=>{
 const f=await runtimeFixture(t),{data}=await f.setup(),db=f.app.store.db;
 const other=await f.app.users.create({username:'OtherFixture',password:'Synthetic-Only-Password!',role:'member'});
 await db.query("INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) SELECT 'bad:'||g,$1,'chatMessage','Synthetic','Synthetic','/chat#channel-999999','2026-10-28T12:00:00Z' FROM generate_series(1,120) g",[data.user.id]);
 await db.query("INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) VALUES('other:1',$1,'chatMessage','Other','Other','/chat#channel-999999','2026-10-28T12:00:00Z')",[other.id]);
 const original=db.query.bind(db);let deletes=0;db.query=async(sql,...rest)=>{if(/^DELETE FROM notifications/.test(sql))deletes++;return original(sql,...rest);};
 try{await f.app.collaboration.pruneNotifications(data.user);assert.equal(Number((await original('SELECT COUNT(*) AS n FROM notifications WHERE userId=$1',[data.user.id])).rows[0].n),0);assert.equal(Number((await original('SELECT COUNT(*) AS n FROM notifications WHERE userId=$1',[other.id])).rows[0].n),1);assert.ok(deletes<=1,`Individual deletes: ${deletes}`);}finally{db.query=original;}
});
