import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from '../dist/server/auth.js';
import {runtimeFixture,testPassword} from './helpers/runtime.js';
import {createMfa} from '../dist/server/mfa.js';
import {postgresFixture} from './helpers/postgres.js';
for(const delay of ['factor-check','session-hours'])test(`password proof cannot cross a reset during ${delay}`,async t=>{
 const f=await runtimeFixture(t);await f.setup();const id=(await f.app.users.credentialsByName('Admin')).id;
 let reset=false;const change=async()=>{if(!reset){reset=true;await f.app.users.update(id,{password:'New-password-after-reset!'});}};
 const auth=createAuth({users:f.app.users,secondFactor:{needed:async()=>{if(delay==='factor-check')await change();return false;}},sessionHours:async()=>{if(delay==='session-hours')await change();return 8;}});
 await assert.rejects(auth.login({username:'Admin',password:testPassword},'test-client'),error=>error.status===401);
});
test('MFA challenge cannot bind an old password proof to a newer credential version',async t=>{
 const f=await runtimeFixture(t);await f.setup();const account=await f.app.users.credentialsByName('Admin');
 await f.app.users.update(account.id,{password:'New-password-after-reset!'});
 await assert.rejects(f.app.mfa.beginChallenge(account.id,'test-client',account.authVersion),error=>error.status===401);
});
test('authorization is reacquired after a preview savepoint releases its row lock',async t=>{
 const {database:db}=await postgresFixture(t);await db.query('CREATE TABLE access_probe(id INTEGER PRIMARY KEY, active INTEGER NOT NULL)');await db.query('INSERT INTO access_probe VALUES(1,1)');let checks=0;
 await db.transaction(async()=>db.authorizeMutations(async()=>{checks++;const {rows}=await db.query('SELECT active FROM access_probe WHERE id=1 FOR SHARE');if(rows[0].active!==1)throw Error('revoked');},async()=>{
  await assert.rejects(db.transaction(async()=>{await db.query('INSERT INTO access_probe VALUES(2,1)');throw Error('preview rollback');}),/preview rollback/);
  // UPDATE uses another pooled connection and proves the savepoint lock is gone.
  const {openDatabase}=await import('../dist/server/database/connection.js');const other=await openDatabase((await import('../dist/server/database/config.js')).readDatabaseConfig({DATABASE_URL:process.env.RETOURENBOARD_TEST_DATABASE_URL}),db.schema);
  try{await other.query('UPDATE access_probe SET active=0 WHERE id=1');}finally{await other.close();}
  await assert.rejects(db.query('INSERT INTO access_probe VALUES(3,1)'),/revoked/);
 }));assert.equal(checks,2);assert.deepEqual((await db.query('SELECT id FROM access_probe ORDER BY id')).rows,[{id:1}]);
});
