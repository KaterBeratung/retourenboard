import {mkdtempSync,mkdirSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../dist/server/database/connection.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {createTestPostgres} from './test-postgres.mjs';
import {validateUpdatePackage} from '../dist/server/update-package.js';
import {createStore} from '../dist/server/legacy-sqlite/store.js';
import {createUsers} from '../dist/server/legacy-sqlite/users.js';
const execute=promisify(execFile),version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const archive=resolve(process.argv[2]??`releases/${version}/retourenboard-linux-${version}.tar.gz`),work=mkdtempSync(join(tmpdir(),'retourenboard-release-pg-'));
let cluster,child,admin,createdRole=false,createdDatabase=false;const databaseName='rb_release_'+randomBytes(12).toString('hex');
try{
 const target=join(work,'package'),source=join(work,'legacy'),data=join(work,'data');mkdirSync(source);mkdirSync(data);
 await validateUpdatePackage({archive,target,version});assert.equal(existsSync(join(target,'node_modules')),false);
 const legacy=createStore(join(source,'retouren.sqlite'));try{await createUsers(legacy).createFirst({username:'ReleaseTest',password:'ReleaseMigrationTest2026!'});const p=legacy.createProduct({name:'Release fixture',sku:'RELEASE-1'});legacy.createReturn({productId:p.id,serialNumber:'RELEASE-SN',replacementSerialNumber:'RELEASE-REPLACEMENT',trackingNumber:'000123',receiptDate:'2026-10-15'});legacy.db.prepare("UPDATE sqlite_sequence SET seq=9000 WHERE name='products'").run();}finally{legacy.close();}
 const original=readFileSync(join(source,'retouren.sqlite'));cluster=await createTestPostgres();admin=await openDatabase(readDatabaseConfig({DATABASE_URL:cluster.url}));const password=randomBytes(32).toString('hex');await admin.query("CREATE ROLE "+databaseName+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");createdRole=true;await admin.query('CREATE DATABASE '+databaseName+' OWNER '+databaseName);createdDatabase=true;const url=new URL(cluster.url);url.username=databaseName;url.password=password;url.pathname='/'+databaseName;
 const env={...process.env,DATABASE_URL:url.href,DATA_DIR:data,HOST:'127.0.0.1',NODE_ENV:'development',PUBLIC_ORIGIN:'',SECURE_COOKIES:'false',DB_PATH:join(source,'retouren.sqlite'),NODE_PATH:''};delete env.DATABASE_URL_FILE;delete env.DATABASE_CA_FILE;
 const migration=join(target,'scripts/migrate-sqlite.mjs');
 await execute(process.execPath,[migration,'--check','--sqlite',env.DB_PATH,'--source-data',source,'--data-dir',data],{cwd:target,env,timeout:60000,maxBuffer:128*1024,windowsHide:true});
 await execute(process.execPath,[migration,'--apply','--sqlite',env.DB_PATH,'--source-data',source,'--data-dir',data,'--service-stopped','--confirm'],{cwd:target,env,timeout:60000,maxBuffer:128*1024,windowsHide:true});
 assert.deepEqual(readFileSync(env.DB_PATH),original);
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));env.PORT=String(socket.address().port);await new Promise(r=>socket.close(r));
 let errors='';child=spawn(process.execPath,[join(target,'dist/server/index.js')],{cwd:target,env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',chunk=>errors=(errors+chunk).slice(-4096));
 const base='http://127.0.0.1:'+env.PORT;let ready=false;
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Extrahierter Server wurde beendet: '+errors);try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();if(r.ok&&h.databaseEngine==='postgresql'&&h.version===version){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(ready,'Standalone PostgreSQL package did not become ready');
 const session=await(await fetch(base+'/api/session')).json();assert.equal(session.version,version);assert.equal(session.setupRequired,false);assert.equal((await fetch(base+'/app.js')).status,401);assert.equal((await fetch(base+'/api/products')).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'ReleaseTest',password:'ReleaseMigrationTest2026!'})});assert.equal(login.status,200);const account=await login.json(),headers={Origin:base,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':account.csrfToken};
 const products=await(await fetch(base+'/api/products',{headers})).json(),returns=await(await fetch(base+'/api/returns',{headers})).json();assert.equal(products[0].sku,'RELEASE-1');assert.equal(returns[0].replacementSerialNumber,'RELEASE-REPLACEMENT');
 const next=await(await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name:'Next identity',sku:'NEXT'})})).json();assert.equal(next.id,9001);
 const deviceResponse=await fetch(base+'/api/disposals',{method:'POST',headers,body:JSON.stringify({returnId:returns[0].id,mode:'destroy'})});assert.equal(deviceResponse.status,201);const device=await deviceResponse.json();assert.equal(device.serialNumber,'RELEASE-SN');
 const approved=await(await fetch(base+'/api/disposals/'+device.id+'/approve',{method:'POST',headers,body:JSON.stringify({revision:device.revision})})).json();
 const completed=await fetch(base+'/api/disposals/'+device.id+'/complete',{method:'POST',headers,body:JSON.stringify({revision:approved.revision,completedOn:'2026-10-15',method:'Release fixture only',performedBy:'Synthetic operator'})});assert.equal(completed.status,200);
 const proof=await(await fetch(base+'/api/disposals/'+device.id+'/label?kind=certificate',{headers})).json();assert.equal(proof.status,'completed');assert.equal(proof.details.method,'Release fixture only');assert.match(proof.qrDataUrl,/^data:image\/png;base64,/);
 console.log('RELEASE_OK '+version+': extracted package, no node_modules, SQLite migration, original bytes, login/private assets, sequence high-water and disposal completion proof.');
}finally{
 if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
 try{if(createdDatabase)await admin.query('DROP DATABASE '+databaseName+' WITH (FORCE)');if(createdRole)await admin.query('DROP ROLE '+databaseName);}finally{await admin?.close();await cluster?.stop();}rmSync(work,{recursive:true,force:true});
}
