import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {postgresFixture} from './helpers/postgres.js';
import {createStore} from '../dist/server/store.js';
import {createUsers} from '../dist/server/users.js';
import {createAuth} from '../dist/server/auth.js';
import {createMfa} from '../dist/server/mfa.js';
import {createSecrets} from '../dist/server/secrets.js';
import {TOTP,Secret} from '../dist/vendor/totp.js';
const password='PostgreSQL-test-password!';
async function fixture(t){const f=await postgresFixture(t),store=await createStore({database:f.database}),users=createUsers(store);const admin=await users.createFirst({username:'Admin',password});return {...f,store,users,admin};}

test('concurrent PostgreSQL administration cannot deactivate the last active administrator',async t=>{
 const {users,database:db,admin}=await fixture(t);const second=await users.create({username:'SecondAdmin',password,role:'admin'});
 const results=await Promise.allSettled([users.update(admin.id,{active:false}),users.update(second.id,{active:false})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND deletedAt IS NULL")).rows[0].n,1);
});

test('concurrent PostgreSQL MFA attempts cannot reuse a TOTP step or recovery code',async t=>{
 const {users,database:db,admin,dataDir}=await fixture(t),secrets=createSecrets(dataDir),now=Date.parse('2026-10-15T12:00:00Z'),secret='JBSWY3DPEHPK3PXP';
 await db.query('INSERT INTO user_mfa(userId,secretEnc,lastStep) VALUES($1,$2,$3)',[admin.id,secrets.encrypt('mfa',String(admin.id),secret,true),-1]);
 const mfa=createMfa({db,users,secrets,clock:{now:()=>now}}),code=new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:now});
 let results=await Promise.allSettled([mfa.verifyFactor(admin.id,code,'same-client'),mfa.verifyFactor(admin.id,code,'same-client')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const recovery='ABCD-EF01-2345-6789',hash=createHash('sha256').update(recovery.replaceAll('-','')).digest('hex');
 await db.query('INSERT INTO recovery_codes(userId,hash) VALUES($1,$2)',[admin.id,hash]);
 results=await Promise.allSettled([mfa.verifyFactor(admin.id,recovery,'same-client'),mfa.verifyFactor(admin.id,recovery,'same-client')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok((await db.query('SELECT usedAt FROM recovery_codes WHERE userId=$1',[admin.id])).rows[0].usedAt);
});

test('a revoked PostgreSQL account cannot finish a login that began with valid credentials',async t=>{
 const {users,admin}=await fixture(t);let reached,release;
 const snapshotRead=new Promise(r=>reached=r),barrier=new Promise(r=>release=r),original=users.credentialsByName;
 users.credentialsByName=async name=>{const account=await original(name);reached();await barrier;return account;};
 const auth=createAuth({users}),pending=auth.login({username:'Admin',password},'127.0.0.1');
 await snapshotRead;const second=await users.create({username:'SecondAdmin',password,role:'admin'});assert.ok(second.id);
 await users.update(admin.id,{active:false});release();
 await assert.rejects(pending,error=>error.status===401);
});

test('deleted PostgreSQL account IDs retain authorship and cannot authenticate after username reuse',async t=>{
 const {users,database:db,admin}=await fixture(t);const member=await users.create({username:'Member',password});
 const before=await users.credentialsById(member.id);assert.ok(before.passwordHash);
 await users.remove(member.id,admin.id);assert.equal(await users.credentialsById(member.id),null);assert.equal(await users.credentialsByName('Member'),null);
 const replacement=await users.create({username:'Member',password});assert.notEqual(replacement.id,member.id);
 assert.equal((await db.query('SELECT displayName,deletedAt FROM users WHERE id=$1',[member.id])).rows[0].displayName,'Gelöschtes Konto');
});
