import {test} from 'node:test';
import assert from 'node:assert/strict';

const configModule=()=>import('../dist/server/database/config.js');

test('database configuration rejects missing, conflicting and unsafe URLs without exposing credentials',async()=>{
 const {readDatabaseConfig}=await configModule();
 const secret='DO-NOT-PRINT-DB-PASSWORD';
 for(const env of [{},{DATABASE_URL:'sqlite:///tmp/a'},{DATABASE_URL:`postgresql://admin:${secret}@db.example/board?options=bad`},{DATABASE_URL:`postgresql://admin:${secret}@db.example/board`,DATABASE_URL_FILE:'secret.txt'}]){
  assert.throws(()=>readDatabaseConfig(env),error=>!error.message.includes(secret)&&/Datenbank|DATABASE_URL|PostgreSQL/.test(error.message));
 }
 const cfg=readDatabaseConfig({DATABASE_URL_FILE:'secret.txt'},path=>{assert.equal(path,'secret.txt');return 'postgresql://admin:password@localhost/board\n';});
 assert.equal(new URL(cfg.connectionString).pathname,'/board');assert.equal(cfg.poolMax,10);assert.equal(cfg.connectTimeoutMs,5000);assert.equal(cfg.queryTimeoutMs,30000);
});

test('database TLS cannot be downgraded through URL SSL overrides and custom CA is preserved',async()=>{
 const {readDatabaseConfig}=await configModule();
 const cfg=readDatabaseConfig({DATABASE_URL:'postgresql://admin:password@db.example/board?sslmode=require',DATABASE_CA_FILE:'root.pem'},()=> 'TEST-CA');
 assert.equal(cfg.tls.ca,'TEST-CA');assert.equal(new URL(cfg.connectionString).search,'');
 for(const query of ['sslmode=no-verify','sslcert=x','sslkey=x','sslrootcert=x','ssl=false'])assert.throws(()=>readDatabaseConfig({DATABASE_URL:'postgresql://admin:password@db.example/board?'+query}));
 assert.ok(readDatabaseConfig({DATABASE_URL:'postgresql://admin:password@db.example/board'}).tls);
 assert.equal(readDatabaseConfig({DATABASE_URL:'postgresql://admin:password@localhost/board?sslmode=disable'}).tls,undefined);
});

test('database configuration rejects invalid resource limits',async()=>{
 const {readDatabaseConfig}=await configModule();
 for(const [key,value]of [['DATABASE_POOL_MAX','0'],['DATABASE_POOL_MAX','10000'],['DATABASE_CONNECT_TIMEOUT_MS','NaN'],['DATABASE_QUERY_TIMEOUT_MS','-1']])assert.throws(()=>readDatabaseConfig({DATABASE_URL:'postgresql://admin:password@localhost/board',[key]:value}));
});

test('PostgreSQL transactions isolate clients, roll back savepoints and preserve commit hook order',async t=>{
 const {postgresFixture}=await import('./helpers/postgres.js');
 const {database:db}=await postgresFixture(t);const hooks=[];
 await db.query('CREATE TABLE transaction_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
 await db.transaction(async()=>{
  await db.query('INSERT INTO transaction_probe VALUES($1,$2)',[1,'kept']);db.onCommit(()=>hooks.push('outer'));
  await assert.rejects(db.transaction(async()=>{await db.query('INSERT INTO transaction_probe VALUES($1,$2)',[2,'discarded']);db.onRollback(()=>hooks.push('nested rollback'));throw Error('abort nested');}),/abort nested/);
  await db.transaction(async()=>{await db.query('INSERT INTO transaction_probe VALUES($1,$2)',[3,'nested kept']);db.onCommit(()=>hooks.push('inner'));});
  assert.deepEqual(hooks,['nested rollback']);
 });
 assert.deepEqual(hooks,['nested rollback','outer','inner']);
 assert.deepEqual((await db.query('SELECT id,value FROM transaction_probe ORDER BY id')).rows,[{id:1,value:'kept'},{id:3,value:'nested kept'}]);
 const pids=await Promise.all([1,2].map(()=>db.transaction(async()=>{const p=(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await new Promise(r=>setTimeout(r,40));assert.equal((await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,p);return p;})));
 assert.notEqual(pids[0],pids[1]);
});

test('a failed PostgreSQL transaction releases its client and later queries work',async t=>{
 const {postgresFixture}=await import('./helpers/postgres.js');const {database:db}=await postgresFixture(t);let rolledBack=0;
 await db.query('CREATE TABLE failure_probe(id INTEGER PRIMARY KEY)');
 await assert.rejects(db.transaction(async()=>{db.onRollback(()=>rolledBack++);await db.query('INSERT INTO failure_probe VALUES(1)');await db.query('INSERT INTO failure_probe VALUES(1)');}),error=>error.code==='23505');
 assert.equal(rolledBack,1);assert.equal((await db.query('SELECT COUNT(*) AS n FROM failure_probe')).rows[0].n,0);
 await db.query('INSERT INTO failure_probe VALUES(2)');assert.equal((await db.query('SELECT id FROM failure_probe')).rows[0].id,2);
});

test('unsafe PostgreSQL bigint results fail rather than lose precision',async t=>{
 const {postgresFixture}=await import('./helpers/postgres.js');const {database:db}=await postgresFixture(t);
 assert.equal((await db.query("SELECT '9007199254740991'::bigint AS value")).rows[0].value,9007199254740991);
 await assert.rejects(db.query("SELECT '9007199254740993'::bigint AS value"),/Zahlenbereich|integer|precision/i);
 assert.equal((await db.query('SELECT 2 AS value')).rows[0].value,2);
});
