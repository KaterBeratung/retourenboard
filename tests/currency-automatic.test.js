import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {postgresFixture} from './helpers/postgres.js';
import {migratePostgres} from '../dist/server/database/migrations.js';
import {createWriteCoordinator} from '../dist/server/write-coordinator.js';
import {createCurrency} from '../dist/server/currency.js';
import {createApp} from '../dist/server/app.js';

const initial=Date.UTC(2026,9,15,12),hour=3600000,retry=300000;
const quote=rate=>new Response(JSON.stringify({base:'EUR',quote:'USD',date:'2026-10-15',rate}));
async function fixture(t,options={}){
 const f=await postgresFixture(t);await migratePostgres(f.database);let now=initial;const timers=[],cleared=[],coordinator=createWriteCoordinator();
 const service=await createCurrency({db:f.database,coordinator,now:()=>now,schedule:(fn,delay)=>{const timer={fn,delay,unref(){}};timers.push(timer);return timer;},cancel:timer=>cleared.push(timer),...options});
 f.beforeCleanup(async()=>{service.close();await coordinator.close();});
 return {...f,service,timers,cleared,advance:ms=>now+=ms};
}

test('an active quote refreshes hourly without another page request and persists the new rate',async t=>{
 let rate=1.16,calls=0;const f=await fixture(t,{fetcher:async()=>{calls++;return quote(rate);}});
 assert.equal((await f.service.current('USD')).rate,1.16);assert.equal(typeof f.service.startAutomatic,'function');
 await f.service.startAutomatic();await f.service.startAutomatic();assert.equal(calls,1);assert.equal(f.timers.length,1);assert.equal(f.timers[0].delay,hour);
 f.advance(hour);rate=1.2;await f.timers[0].fn();assert.equal(calls,2);assert.equal(f.service.read('USD').rate,1.2);assert.equal(JSON.parse((await f.database.query('SELECT value FROM currency_rates WHERE id=1')).rows[0].value).rate,1.2);
 f.service.close();assert.equal(f.cleared.at(-1),f.timers.at(-1));
});

test('background failures retain the valid quote and retry after five minutes',async t=>{
 let calls=0;const f=await fixture(t,{fetcher:async()=>++calls===2?new Response('',{status:503}):quote(calls===1?1.16:1.21)});
 await f.service.current('USD');assert.equal(typeof f.service.startAutomatic,'function');await f.service.startAutomatic();f.advance(hour);await f.timers[0].fn();
 assert.equal(f.service.read('USD').rate,1.16);assert.equal(f.service.read('USD').status,'cached');assert.equal(f.timers.at(-1).delay,retry);
 f.advance(retry);await f.timers.at(-1).fn();assert.equal(calls,3);assert.equal(f.service.read('USD').rate,1.21);assert.equal(f.service.read('USD').status,'current');assert.equal(f.timers.at(-1).delay,hour);
});

test('a failed first USD request replaces the idle EUR timer with a five-minute retry',async t=>{
 let calls=0;const f=await fixture(t,{fetcher:async()=>++calls===1?new Response('',{status:503}):quote(1.2)});await f.service.startAutomatic();const idle=f.timers[0];f.advance(60000);await f.service.current('USD');
 assert.ok(f.cleared.includes(idle));assert.equal(f.timers.at(-1).delay,retry);f.advance(retry);await f.timers.at(-1).fn();assert.equal(calls,2);assert.equal(f.service.read('USD').rate,1.2);
});

test('unused EUR does not fetch rates but a shared USD setting loads automatically at startup',async t=>{
 for(const display of ['EUR','USD']){let calls=0;const f=await fixture(t,{displayCurrency:async()=>display,fetcher:async()=>{calls++;return quote(1.16);}});assert.equal(typeof f.service.startAutomatic,'function');await f.service.startAutomatic();assert.equal(calls,display==='USD'?1:0);assert.equal(f.timers.length,1);}
});

test('closing an automatic fetch aborts it without late writes or rescheduling',async t=>{
 let finish,started,aborted=false;const reached=new Promise(resolve=>started=resolve),f=await fixture(t,{displayCurrency:async()=>'USD',fetcher:async(_url,{signal})=>{signal.addEventListener('abort',()=>aborted=true);started();return new Promise(resolve=>finish=resolve);}});
 assert.equal(typeof f.service.startAutomatic,'function');const pending=f.service.startAutomatic();await reached;f.service.close();finish(quote(1.16));await pending;
 assert.equal(aborted,true);assert.equal(f.timers.length,0);assert.equal((await f.database.query('SELECT COUNT(*) AS n FROM currency_rates')).rows[0].n,0);
});

test('a background database failure is contained and the next refresh can recover',async t=>{
 let rate=1.16;const f=await fixture(t,{fetcher:async()=>quote(rate)});await f.service.current('USD');assert.equal(typeof f.service.startAutomatic,'function');await f.service.startAutomatic();
 await f.database.query('ALTER TABLE currency_rates ADD CONSTRAINT simulated_outage CHECK (false) NOT VALID');f.advance(hour);rate=1.22;await assert.doesNotReject(f.timers[0].fn());assert.equal(f.timers.at(-1).delay,retry);
 await f.database.query('ALTER TABLE currency_rates DROP CONSTRAINT simulated_outage');f.advance(retry);await f.timers.at(-1).fn();assert.equal(JSON.parse((await f.database.query('SELECT value FROM currency_rates')).rows[0].value).rate,1.22);
});

test('a normal app starts the currency scheduler after listening while maintenance postpones it',async t=>{
 for(const maintenance of [false,true]){
  const f=await postgresFixture(t);await migratePostgres(f.database);await f.database.query('INSERT INTO currency_rates(id,value) VALUES(1,$1)',[JSON.stringify({rate:1.16,date:'2026-10-15',checkedAt:initial-2*hour,lastAttempt:initial-2*hour,failed:false})]);
  let started,calls=0;const incoming=new Promise(resolve=>started=resolve),app=await createApp({databaseConfig:f.config,internalSchema:f.schema,dataDir:f.dataDir,maintenance,now:()=>initial,currencyFetch:async()=>{calls++;started();return quote(1.2);}});f.beforeCleanup(()=>app.close());
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));if(maintenance){assert.equal(calls,0);await app.releaseStartupMaintenance();}
  let timeout;try{await Promise.race([incoming,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Automatic quote did not start')),5000))]);}finally{clearTimeout(timeout);}
  assert.equal(calls,1);await app.currency.current('USD');assert.equal(app.currency.read('USD').rate,1.2);await app.close();
 }
});
