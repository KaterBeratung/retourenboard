import test from 'node:test';
import assert from 'node:assert/strict';
import * as routing from '../dist/public/design.js';

test('chat and conversation routes work from workspace, account and admin entry points',()=>{
  for(const admin of [false,true])for(const hash of ['#chat','#channel-42'])assert.deepEqual(routing.parseDesignRoute(hash,admin),{view:'chat',scope:''});
});

test('all internal page links resolve to the mounted application, including legacy bookmarks',()=>{
  assert.equal(typeof routing.internalNavigationHash,'function');
  const cases=[
    ['/chat','#chat'],['/chat/','#chat'],['/chat#channel-42','#channel-42'],
    ['/chat#overview','#overview'],['/account','#account'],['/account/','#account'],
    ['/admin','#admin'],['/admin#backups','#admin?section=backups'],
    ['/admin#settings?tab=logs','#admin?tab=logs&section=settings'],
    ['/admin.html#admin?section=updates','#admin?section=updates'],
    ['/#returns?detail=7','#returns?detail=7'],['/index.html#products','#products'],
    ['#channel-12','#channel-12'],['#chat','#chat'],['#account','#account'],['/','#overview'],
  ];
  for(const current of ['http://board.test/','http://board.test/admin','http://board.test/account','http://board.test/chat'])for(const [href,want]of cases)assert.equal(routing.internalNavigationHash(href,current),want,`${current} → ${href}`);
});

test('downloads, external destinations and the skip link keep their native navigation',()=>{
  assert.equal(typeof routing.internalNavigationHash,'function');
  for(const href of ['/api/export/products','/api/attachments/12/download','https://ko-fi.com/katerberatung','https://other.test/chat','/#content'])assert.equal(routing.internalNavigationHash(href,'http://board.test/'),null);
});

test('link targets use the correct page path from every application entry point',()=>{
  assert.equal(typeof routing.internalNavigationUrl,'function');
  const cases=[['#overview','/#overview'],['#returns?scope=open','/#returns?scope=open'],['#products','/#products'],['#admin','/admin'],['#admin?section=settings','/admin#settings'],['#account','/account'],['#chat','/chat'],['#channel-42','/chat#channel-42'],['/admin#overview','/#overview'],['/account#products','/#products'],['/admin.html#admin?section=updates','/admin#updates'],['/account.html','/account'],['/admin#audit?entity=returns&entityId=7','/admin#audit?entity=returns&entityId=7']];
  for(const current of ['http://board.test/','http://board.test/admin','http://board.test/account','http://board.test/chat'])for(const [href,want]of cases)assert.equal(routing.internalNavigationUrl(href,current),want,`${current} → ${href}`);
});
test('canonical links retain query parameters and leave downloads, external links and skip links alone',()=>{
  assert.equal(typeof routing.internalNavigationUrl,'function');
  assert.equal(routing.internalNavigationUrl('/admin?source=test#settings?tab=logs','http://board.test/'),'/admin?source=test#settings?tab=logs');
  for(const href of ['/api/export/products','https://ko-fi.com/katerberatung','javascript:alert(1)','/#content'])assert.equal(routing.internalNavigationUrl(href,'http://board.test/admin'),null);
});
test('canonical addresses remain stable and resolve to the same view when opened or reloaded directly',()=>{
  for(const [href,view,scope]of [['/admin#admin?section=settings','admin',''],['/account#account','account',''],['/chat#chat','chat',''],['/chat#channel-42','chat',''],['/admin#returns?scope=open','returns','open'],['/index.html#products?scope=active','products','active']]){
    const canonical=routing.internalNavigationUrl(href,'http://board.test/'),absolute='http://board.test'+canonical;assert.equal(routing.internalNavigationUrl(absolute,absolute),canonical);assert.deepEqual(routing.parseDesignRoute(routing.internalNavigationHash(absolute,absolute)),{view,scope});
  }
});
test('one traversal emits one route change even when both popstate and hashchange fire',async()=>{
  assert.equal(typeof routing.createLocationChangeListener,'function');let href='http://board.test/admin',calls=0;
  const listener=routing.createLocationChangeListener(()=>href,async()=>{calls++;href='http://board.test/#overview';listener.sync();});
  href='http://board.test/admin#overview';await listener.changed();await listener.changed();assert.equal(calls,1);
  href='http://board.test/account';await listener.changed();assert.equal(calls,2,'Path-only account routes must also trigger navigation');
});
test('a silently replaced filter URL does not suppress a later visit to the previous filter',async()=>{
  assert.equal(typeof routing.createLocationChangeListener,'function');let href='http://board.test/#returns?scope=open',calls=0;
  const listener=routing.createLocationChangeListener(()=>href,()=>calls++);href='http://board.test/#returns';listener.sync();href='http://board.test/#returns?scope=open';await listener.changed();assert.equal(calls,1);
});
test('rejecting a path-only history traversal restores the original entry without rewriting the destination',()=>{
  const entries=[{url:'http://board.test/admin',state:null},{url:'http://board.test/account',state:null}];let position=0;
  const history={get state(){return entries[position].state;},replaceState(state,_title,url){entries[position].state=state;if(url)entries[position].url=new URL(url,entries[position].url).href;},go(delta){position+=delta;}};
  const tracker=routing.createHashHistory(history,()=>entries[position].url,()=>position);position=1;tracker.cancel();assert.equal(position,0);assert.equal(tracker.restored(),true);assert.equal(entries[1].url,'http://board.test/account');assert.equal(entries[0].url,'http://board.test/admin');
});
